import { z } from "zod";

import { getSql } from "@/lib/db";
import { apiError, apiZodError } from "@/lib/api/errors";
import { responseForDbError } from "@/lib/dbTransient";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { ingestBscTokenDepositTx, ingestNativeBnbDepositTx } from "@/lib/blockchain/depositIngest";
import { getBscReadProvider } from "@/lib/blockchain/wallet";
import { createPgRateLimiter, type PgRateLimiter } from "@/lib/rateLimitPg";
import { auditContextFromRequest, writeAuditLog } from "@/lib/auditLog";
import { logRouteResponse } from "@/lib/routeLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let reportLimiter: PgRateLimiter | null = null;
function getReportLimiter(sql: ReturnType<typeof getSql>): PgRateLimiter {
  if (reportLimiter) return reportLimiter;
  const raw = Number(String(process.env.EXCHANGE_DEPOSIT_REPORT_MAX_PER_MIN ?? "10").trim());
  const max = Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : 10;
  reportLimiter = createPgRateLimiter(sql as any, {
    name: "exchange-deposit-report",
    windowMs: 60_000,
    max,
  });
  return reportLimiter;
}

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

async function bestEffortIsContract(provider: { getCode: (address: string) => Promise<string> }, address: string | null | undefined): Promise<boolean | null> {
  const addr = String(address ?? "").trim();
  if (!addr) return null;
  try {
    const code = await provider.getCode(addr);
    return String(code).toLowerCase() !== "0x";
  } catch {
    return null;
  }
}

function parseCsvSymbols(raw: string): string[] {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

export async function POST(request: Request) {
  const startMs = Date.now();
  const userId = getActingUserId(request);
  const productionGuard = requireActingUserIdInProd(userId);
  const reply = (response: Response, meta?: Record<string, unknown>) => {
    try {
      logRouteResponse(request, response, { startMs, userId, meta });
    } catch {
      // ignore
    }
    return response;
  };

  if (productionGuard) return reply(apiError(productionGuard, { status: 401 }), { code: productionGuard });
  if (!userId) return reply(apiError("unauthorized", { status: 401 }), { code: "unauthorized" });

  const sql = getSql();

  try {
    // Abuse prevention: rate limit report calls (chain RPC + ingest work).
    try {
      const rl = await getReportLimiter(sql).consume(`u:${userId}`);
      if (!rl.allowed) return reply(apiError("rate_limit_exceeded", { status: 429 }), { code: "rate_limit_exceeded" });
    } catch {
      // If limiter fails, do not block report.
    }

    const json = await request.json().catch(() => ({}));
    let input: z.infer<typeof schema>;
    try {
      input = schema.parse(json);
    } catch (e) {
      return reply(apiZodError(e) ?? apiError("invalid_input", { status: 400 }), { code: "invalid_input" });
    }

    // Best-effort audit log (do not block).
    try {
      const ctx = auditContextFromRequest(request);
      await writeAuditLog(sql, {
        actorId: userId,
        actorType: "user",
        action: "exchange.deposits.report",
        resourceType: "deposit_report",
        resourceId: String(input.tx_hash ?? "").trim() || null,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
        detail: {
          chain: input.chain,
          tx_hash: String(input.tx_hash ?? "").trim(),
          confirmations: input.confirmations ?? null,
        },
      });
    } catch {
      // ignore
    }

    const txHash = String(input.tx_hash || "").trim();
    if (!isHexTxHash(txHash)) {
      return reply(apiError("invalid_tx_hash", { status: 400 }), { code: "invalid_tx_hash" });
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
      return reply(apiError("deposit_address_missing", { status: 400 }), { code: "deposit_address_missing" });
    }

    // Verify the tx is actually to THIS user's active deposit address.
    // This prevents a user from crediting someone else's deposit.
    const provider = getBscReadProvider();
    const tx = await provider.getTransaction(txHash);
    if (!tx) return reply(apiError("tx_not_found", { status: 404, details: { tx_hash: txHash } }), { code: "tx_not_found" });

    const receipt = await provider.getTransactionReceipt(txHash).catch(() => null);
    const receiptStatus = typeof (receipt as any)?.status === "number" ? ((receipt as any).status as number) : null;
    if (receiptStatus === 0) {
      return reply(apiError("tx_failed", {
        status: 400,
        details: {
          tx_hash: txHash,
          message: "This transaction reverted on-chain (status=0), so it did not complete.",
        },
      }), { code: "tx_failed" });
    }

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
        return reply(apiError(out.error, { status, details: out.details ?? { tx_hash: txHash } }), { code: out.error });
      }

      if (String(out.userId) !== String(userId)) {
        return reply(apiError("tx_to_not_your_deposit_address", {
          status: 400,
          details: { to_address: out.toAddress },
        }), { code: "tx_to_not_your_deposit_address" });
      }

      const response = Response.json({
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
      return reply(response, { ok: true, chain: out.chain, kind: "native" });
    }

    // If the transaction sent native value to some other address, this is not a token deposit
    // for the current user. Return a clearer error rather than trying token-ingest.
    if (toAddress && value > 0n) {
      return reply(apiError("tx_to_not_your_deposit_address", {
        status: 400,
        details: {
          to_address: toAddress,
          expected_deposit_address: depositAddress,
          value_wei: value.toString(),
          message: "This transaction sent native BNB to a different address. Direct BNB deposits must be sent to your deposit address.",
        },
      }), { code: "tx_to_not_your_deposit_address" });
    }

    // Case 2: token transfer(s) to the user's deposit address
    const tokenSymbols = (() => {
      const fromScan = parseCsvSymbols(String(process.env.DEPOSIT_SCAN_SYMBOLS ?? ""));
      if (fromScan.length) return fromScan;
      const fromReport = parseCsvSymbols(String(process.env.BSC_REPORT_TOKEN_SYMBOLS ?? ""));
      if (fromReport.length) return fromReport;
      return [] as string[];
    })();

    const tokenOut = await ingestBscTokenDepositTx(sql as any, {
      txHash,
      userId,
      depositAddress,
      confirmations: input.confirmations,
      ...(tokenSymbols.length ? { tokenSymbols } : {}),
    });

    if (!tokenOut.ok) {
      const status = tokenOut.error === "tx_not_confirmed" ? 202 : tokenOut.error === "tx_not_found" ? 404 : 400;

      const toIsContract = tx?.to ? await bestEffortIsContract(provider as any, tx.to) : null;
      const baseDetails = tokenOut.details ?? { tx_hash: txHash };
      const message = (() => {
        switch (tokenOut.error) {
          case "tx_not_found":
            return "Transaction receipt not found yet. If you just broadcast it, wait a bit and try again.";
          case "tx_not_confirmed":
            return "Transaction is not confirmed yet. Wait for confirmations and try again.";
          case "tx_failed":
            return "This transaction failed/reverted on-chain, so it cannot be credited.";
          case "token_asset_not_enabled":
            return "Token deposits are not enabled for the supported symbols on this server.";
          case "no_matching_token_transfers":
            return toIsContract === true
              ? "This transaction is a contract interaction and has no supported token Transfer logs to your deposit address. If you used a swap/bridge, ensure the final Transfer goes to your deposit address."
              : "No supported token Transfer logs to your deposit address were found in this transaction.";
          default:
            return null;
        }
      })();

      return reply(apiError(tokenOut.error, {
        status,
        details: {
          ...baseDetails,
          ...(message ? { message } : {}),
          ...(toIsContract != null ? { tx_to_is_contract: toIsContract } : {}),
        },
      }), { code: tokenOut.error });
    }

    const response = Response.json({
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
    return reply(response, { ok: true, chain: tokenOut.chain, kind: "token", credits: tokenOut.credits.length });
  } catch (e) {
    const resp = responseForDbError("exchange.deposits.report", e);
    if (resp) return reply(resp, { code: "db_error" });
    throw e;
  }
}
