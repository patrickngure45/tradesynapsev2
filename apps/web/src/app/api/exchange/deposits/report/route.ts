import { z } from "zod";

import { getSql } from "@/lib/db";
import { apiError, apiZodError } from "@/lib/api/errors";
import { responseForDbError } from "@/lib/dbTransient";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { ingestBscTokenDepositTx, ingestNativeBnbDepositTx } from "@/lib/blockchain/depositIngest";
import { getBscProvider } from "@/lib/blockchain/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  chain: z.literal("bsc").optional().default("bsc"),
  tx_hash: z.string().min(10),
  confirmations: z.number().int().min(0).max(200).optional(),
});

function normalizeAddress(addr: string): string {
  return String(addr || "").trim().toLowerCase();
}

function isHexTxHash(v: string): boolean {
  const s = String(v || "").trim();
  return /^0x[0-9a-fA-F]{64}$/.test(s);
}

export async function POST(request: Request) {
  const userId = getActingUserId(request);
  const productionGuard = requireActingUserIdInProd(userId);
  if (productionGuard) return apiError(productionGuard, { status: 401 });
  if (!userId) return apiError("unauthorized", { status: 401 });

  const sql = getSql();

  try {
    const json = await request.json().catch(() => ({}));
    let input: z.infer<typeof schema>;
    try {
      input = schema.parse(json);
    } catch (e) {
      return apiZodError(e) ?? apiError("invalid_input", { status: 400 });
    }

    const txHash = String(input.tx_hash || "").trim();
    if (!isHexTxHash(txHash)) {
      return apiError("invalid_tx_hash", { status: 400 });
    }

    const ownedRows = await sql<{ address: string }[]>`
      SELECT address
      FROM ex_deposit_address
      WHERE chain = 'bsc'
        AND status = 'active'
        AND user_id = ${userId}::uuid
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const depositAddress = ownedRows[0]?.address ? normalizeAddress(ownedRows[0].address) : "";
    if (!depositAddress) {
      return apiError("deposit_address_missing", { status: 400 });
    }

    // Verify the tx is actually to THIS user's active deposit address.
    // This prevents a user from crediting someone else's deposit.
    const provider = getBscProvider();
    const tx = await provider.getTransaction(txHash);
    if (!tx) return apiError("tx_not_found", { status: 404, details: { tx_hash: txHash } });

    const toAddress = tx.to ? normalizeAddress(tx.to) : "";
    const value = typeof (tx as any)?.value === "bigint" ? ((tx as any).value as bigint) : 0n;

    // Case 1: native BNB transfer directly to the user's deposit address
    if (toAddress && toAddress === depositAddress) {
      const out = await ingestNativeBnbDepositTx(sql as any, {
        txHash,
        confirmations: input.confirmations,
      });

      if (!out.ok) {
        const status = out.error === "tx_not_confirmed" ? 202 : out.error === "tx_not_found" ? 404 : 400;
        return apiError(out.error, { status, details: out.details ?? { tx_hash: txHash } });
      }

      if (String(out.userId) !== String(userId)) {
        return apiError("tx_to_not_your_deposit_address", {
          status: 400,
          details: { to_address: out.toAddress },
        });
      }

      return Response.json({
        ok: true,
        chain: out.chain,
        tx_hash: out.txHash,
        block_number: out.blockNumber,
        confirmations_required: out.confirmations,
        safe_tip: out.safeTip,
        to_address: out.toAddress,
        credits: [
          {
            asset_symbol: out.assetSymbol,
            amount: out.amount,
            outcome: out.outcome,
          },
        ],
      });
    }

    // If the transaction sent native value to some other address, this is not a token deposit
    // for the current user. Return a clearer error rather than trying token-ingest.
    if (toAddress && value > 0n) {
      return apiError("tx_to_not_your_deposit_address", {
        status: 400,
        details: {
          to_address: toAddress,
          expected_deposit_address: depositAddress,
          value_wei: value.toString(),
        },
      });
    }

    // Case 2: token transfer(s) to the user's deposit address
    const tokenOut = await ingestBscTokenDepositTx(sql as any, {
      txHash,
      userId,
      depositAddress,
      confirmations: input.confirmations,
    });

    if (!tokenOut.ok) {
      const status = tokenOut.error === "tx_not_confirmed" ? 202 : tokenOut.error === "tx_not_found" ? 404 : 400;
      return apiError(tokenOut.error, { status, details: tokenOut.details ?? { tx_hash: txHash } });
    }

    return Response.json({
      ok: true,
      chain: tokenOut.chain,
      tx_hash: tokenOut.txHash,
      block_number: tokenOut.blockNumber,
      confirmations_required: tokenOut.confirmations,
      safe_tip: tokenOut.safeTip,
      to_address: tokenOut.depositAddress,
      credits: tokenOut.credits.map((c) => ({
        asset_symbol: c.assetSymbol,
        amount: c.amount,
        outcome: c.outcome,
      })),
    });
  } catch (e) {
    const resp = responseForDbError("exchange.deposits.report", e);
    if (resp) return resp;
    throw e;
  }
}
