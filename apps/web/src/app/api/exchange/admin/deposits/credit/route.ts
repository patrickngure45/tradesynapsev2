import { z } from "zod";

import { getSql } from "@/lib/db";
import { apiError, apiZodError } from "@/lib/api/errors";
import { requireAdminForApi } from "@/lib/auth/admin";
import { responseForDbError } from "@/lib/dbTransient";
import { getBscProvider } from "@/lib/blockchain/wallet";
import { ingestBscTokenDepositTx, ingestNativeBnbDepositTx } from "@/lib/blockchain/depositIngest";

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
  const sql = getSql();
  const admin = await requireAdminForApi(sql as any, request);
  if (!admin.ok) return admin.response;

  try {
    const json = await request.json().catch(() => ({}));
    let input: z.infer<typeof schema>;
    try {
      input = schema.parse(json);
    } catch (e) {
      return apiZodError(e) ?? apiError("invalid_input", { status: 400 });
    }

    const txHash = String(input.tx_hash || "").trim();
    if (!isHexTxHash(txHash)) return apiError("invalid_tx_hash", { status: 400 });

    const provider = getBscProvider();
    const tx = await provider.getTransaction(txHash);
    if (!tx) return apiError("tx_not_found", { status: 404 });

    const toAddress = tx.to ? normalizeAddress(tx.to) : "";
    if (!toAddress) return apiError("tx_missing_to", { status: 400 });

    // Only allow crediting deposits to active derived deposit addresses.
    const addrRows = await sql<{ user_id: string; address: string }[]>`
      SELECT user_id::text AS user_id, address
      FROM ex_deposit_address
      WHERE chain = 'bsc'
        AND status = 'active'
        AND lower(address) = ${toAddress}
      LIMIT 1
    `;

    if (addrRows.length === 0) {
      return apiError("unknown_deposit_address", { status: 400, details: { to_address: toAddress } });
    }

    const userId = String(addrRows[0]!.user_id);

    // Native value transfer path.
    const value = typeof (tx as any)?.value === "bigint" ? ((tx as any).value as bigint) : 0n;
    if (value > 0n) {
      const out = await ingestNativeBnbDepositTx(sql as any, {
        txHash,
        confirmations: input.confirmations,
      });

      if (!out.ok) {
        const status = out.error === "tx_not_confirmed" ? 202 : out.error === "tx_not_found" ? 404 : 400;
        return apiError(out.error, { status, details: out.details ?? { tx_hash: txHash } });
      }

      return Response.json({
        ok: true,
        chain: out.chain,
        tx_hash: out.txHash,
        credited_user_id: out.userId,
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

    // Token transfer path (allowlisted enabled assets).
    const tokenOut = await ingestBscTokenDepositTx(sql as any, {
      txHash,
      userId,
      depositAddress: toAddress,
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
      credited_user_id: userId,
      to_address: tokenOut.depositAddress,
      credits: tokenOut.credits.map((c) => ({
        asset_symbol: c.assetSymbol,
        amount: c.amount,
        outcome: c.outcome,
      })),
    });
  } catch (e) {
    const resp = responseForDbError("exchange.admin.deposits.credit", e);
    if (resp) return resp;
    throw e;
  }
}
