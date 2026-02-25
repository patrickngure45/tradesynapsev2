import { z } from "zod";
import { ethers } from "ethers";

import { getSql } from "@/lib/db";
import { apiError, apiZodError } from "@/lib/api/errors";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { resolveReadOnlyUserScope } from "@/lib/auth/impersonation";
import { getBscReadProvider } from "@/lib/blockchain/wallet";
import { createPgRateLimiter, type PgRateLimiter } from "@/lib/rateLimitPg";
import { auditContextFromRequest, writeAuditLog } from "@/lib/auditLog";
import { logRouteResponse } from "@/lib/routeLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let traceLimiter: PgRateLimiter | null = null;
function getTraceLimiter(sql: ReturnType<typeof getSql>): PgRateLimiter {
  if (traceLimiter) return traceLimiter;
  const raw = Number(String(process.env.EXCHANGE_DEPOSIT_TRACE_MAX_PER_MIN ?? "20").trim());
  const max = Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : 20;
  traceLimiter = createPgRateLimiter(sql as any, {
    name: "exchange-deposit-trace",
    windowMs: 60_000,
    max,
  });
  return traceLimiter;
}

const schema = z.object({
  tx_hash: z.string().min(10),
  chain: z.literal("bsc").optional().default("bsc"),
  confirmations_required: z.number().int().min(0).max(200).optional(),
});

function normalizeAddress(addr: string): string {
  return String(addr || "").trim().toLowerCase();
}

function isHexTxHash(v: string): boolean {
  const s = String(v || "").trim();
  return /^0x[0-9a-fA-F]{64}$/.test(s);
}

const TRANSFER_TOPIC0 = ethers.id("Transfer(address,address,uint256)");
const transferIface = new ethers.Interface(["event Transfer(address indexed from, address indexed to, uint256 value)"]);

async function bestEffortIsContract(provider: ethers.Provider, address: string | null | undefined): Promise<boolean | null> {
  const addr = String(address ?? "").trim();
  if (!addr) return null;
  try {
    const code = await provider.getCode(addr);
    if (!code) return null;
    return String(code).toLowerCase() !== "0x";
  } catch {
    return null;
  }
}

type DepositEventRow = {
  id: number;
  tx_hash: string;
  log_index: number;
  block_number: number;
  from_address: string | null;
  to_address: string;
  amount: string;
  asset_symbol: string;
  asset_decimals: number;
  journal_entry_id: string | null;
  created_at: string;
};

export async function POST(request: Request) {
  const startMs = Date.now();
  const sql = getSql();
  const actingUserId = getActingUserId(request);

  const reply = (response: Response, meta?: Record<string, unknown>) => {
    try {
      logRouteResponse(request, response, { startMs, userId: actingUserId, meta });
    } catch {
      // ignore
    }
    return response;
  };

  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return reply(apiError(authErr, { status: 401 }), { code: authErr });
  if (!actingUserId) return reply(apiError("missing_x_user_id", { status: 401 }), { code: "missing_x_user_id" });

  const scopeRes = await retryOnceOnTransientDbError(() => resolveReadOnlyUserScope(sql, request, actingUserId));
  if (!scopeRes.ok) return reply(apiError(scopeRes.error, { status: 403 }), { code: scopeRes.error });
  const userId = scopeRes.scope.userId;

  try {
    // Abuse prevention: rate limit trace calls (chain RPC + DB lookups).
    try {
      const rl = await getTraceLimiter(sql).consume(`u:${userId}`);
      if (!rl.allowed) return reply(apiError("rate_limit_exceeded", { status: 429 }), { code: "rate_limit_exceeded" });
    } catch {
      // If limiter fails, do not block trace (availability > limiter).
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
        actorId: actingUserId,
        actorType: "user",
        action: "exchange.deposits.trace",
        resourceType: "deposit_trace",
        resourceId: String(input.tx_hash ?? "").trim() || null,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
        detail: {
          scope_user_id: userId,
          chain: input.chain,
          tx_hash: String(input.tx_hash ?? "").trim(),
          confirmations_required: input.confirmations_required ?? null,
        },
      });
    } catch {
      // ignore
    }

    const txHash = String(input.tx_hash || "").trim();
    if (!isHexTxHash(txHash)) return reply(apiError("invalid_tx_hash", { status: 400 }), { code: "invalid_tx_hash" });

    const envConfsRaw = String(process.env.BSC_DEPOSIT_CONFIRMATIONS ?? "2").trim();
    const envConfsNum = Number(envConfsRaw);
    const envConfs = Number.isFinite(envConfsNum) ? Math.trunc(envConfsNum) : 2;
    const confirmationsRequired = Math.max(
      0,
      Math.min(200, Math.trunc(input.confirmations_required != null ? input.confirmations_required : envConfs)),
    );

    const activeErr = await retryOnceOnTransientDbError(() => requireActiveUser(sql, userId));
    if (activeErr) return reply(apiError(activeErr), { code: activeErr });

    const depositAddrRows = await retryOnceOnTransientDbError(async () => {
      return await sql<{ address: string }[]>`
        SELECT address
        FROM ex_deposit_address
        WHERE chain = 'bsc'
          AND status = 'active'
          AND user_id = ${userId}::uuid
        ORDER BY created_at DESC
        LIMIT 1
      `;
    });

    const depositAddress = depositAddrRows[0]?.address ? normalizeAddress(depositAddrRows[0].address) : "";
    if (!depositAddress) return reply(apiError("deposit_address_missing", { status: 400 }), { code: "deposit_address_missing" });

    const provider = getBscReadProvider();

    const [tip, tx, receipt, events] = await Promise.all([
      provider.getBlockNumber().catch(() => null),
      provider.getTransaction(txHash).catch(() => null),
      provider.getTransactionReceipt(txHash).catch(() => null),
      retryOnceOnTransientDbError(async () => {
        return await sql<DepositEventRow[]>`
          SELECT
            e.id,
            e.tx_hash,
            e.log_index,
            e.block_number,
            e.from_address,
            e.to_address,
            e.amount::text AS amount,
            a.symbol AS asset_symbol,
            a.decimals AS asset_decimals,
            e.journal_entry_id::text AS journal_entry_id,
            e.created_at::text AS created_at
          FROM ex_chain_deposit_event e
          JOIN ex_asset a ON a.id = e.asset_id
          WHERE e.chain = 'bsc'
            AND e.user_id = ${userId}::uuid
            AND e.tx_hash = ${txHash}
          ORDER BY e.log_index ASC
        `;
      }).catch(() => [] as DepositEventRow[]),
    ]);

    const txTo = tx?.to ? normalizeAddress(tx.to) : "";
    const txFrom = tx?.from ? normalizeAddress(tx.from) : null;
    const txValue = typeof (tx as any)?.value === "bigint" ? ((tx as any).value as bigint) : 0n;
    const receiptBlock = receipt?.blockNumber != null ? Number(receipt.blockNumber) : null;
    const receiptStatus = typeof (receipt as any)?.status === "number" ? ((receipt as any).status as number) : null;

    const confirmations =
      tip != null && receiptBlock != null && Number.isFinite(receiptBlock) && receiptBlock > 0
        ? Math.max(0, Number(tip) - receiptBlock + 1)
        : 0;

    const nativeMatch = Boolean(txTo && txTo === depositAddress && txValue > 0n);

    // Token matches: decode Transfer logs (best-effort; requires receipt).
    const tokenMatches: Array<{ contract: string; from: string | null; to: string; value_wei: string; log_index: number | null }> = [];
    if (receipt && Array.isArray((receipt as any).logs)) {
      for (const log of (receipt as any).logs as Array<any>) {
        try {
          const topic0 = String(log?.topics?.[0] ?? "");
          if (topic0 !== TRANSFER_TOPIC0) continue;
          const decoded = transferIface.decodeEventLog("Transfer", log.data, log.topics);
          const to = decoded?.to ? normalizeAddress(String(decoded.to)) : "";
          if (!to || to !== depositAddress) continue;
          const from = decoded?.from ? normalizeAddress(String(decoded.from)) : null;
          const value = typeof decoded?.value === "bigint" ? (decoded.value as bigint) : 0n;
          if (value <= 0n) continue;
          tokenMatches.push({
            contract: normalizeAddress(String(log.address ?? "")),
            from,
            to,
            value_wei: value.toString(),
            log_index: typeof log?.logIndex === "number" ? log.logIndex : null,
          });
        } catch {
          // ignore
        }
      }
    }

    const tokenContracts = Array.from(new Set(tokenMatches.map((m) => m.contract).filter(Boolean)));
    const tokenAssets = tokenContracts.length
      ? await retryOnceOnTransientDbError(async () => {
          return await sql<{ symbol: string; decimals: number; contract_address: string }[]>`
            SELECT symbol, decimals, contract_address
            FROM ex_asset
            WHERE chain = 'bsc'
              AND contract_address IS NOT NULL
              AND lower(contract_address) = ANY(${tokenContracts})
          `;
        }).catch(() => [] as Array<{ symbol: string; decimals: number; contract_address: string }>)
      : [];

    const assetByContract = new Map<string, { symbol: string; decimals: number }>();
    for (const a of tokenAssets) assetByContract.set(normalizeAddress(a.contract_address), { symbol: a.symbol, decimals: a.decimals });

    const tokenTransfers = tokenMatches.map((m) => {
      const meta = assetByContract.get(m.contract);
      const decimals = meta?.decimals ?? 18;
      const amount = ethers.formatUnits(BigInt(m.value_wei), decimals);
      return {
        kind: "token" as const,
        asset_symbol: meta?.symbol ?? "UNKNOWN",
        contract: m.contract,
        amount,
        log_index: m.log_index,
      };
    });

    const nativeTransfers = nativeMatch
      ? [{ kind: "native" as const, asset_symbol: "BNB", amount: ethers.formatEther(txValue), log_index: null as number | null }]
      : [];

    const isOurs = nativeMatch || tokenTransfers.length > 0 || (Array.isArray(events) && events.length > 0);

    const credited = Array.isArray(events) && events.some((e) => Boolean(e.journal_entry_id));
    const seen = Array.isArray(events) && events.length > 0;

    const verdict: "not_ours" | "pending" | "seen" | "credited" = !isOurs
      ? "not_ours"
      : credited
        ? "credited"
        : seen
          ? "seen"
          : "pending";

    const okOnchain = receiptStatus == null ? null : receiptStatus === 1;
    const readyByConfs = confirmationsRequired === 0 ? true : confirmations >= confirmationsRequired;
    const canPost = verdict !== "credited" && isOurs && okOnchain !== false && readyByConfs;

    // If the chain hasn't produced a receipt yet, we cannot safely classify token transfers.
    // Treat it as pending unless we already have a DB event.
    const refinedVerdict = (() => {
      if (verdict !== "not_ours" && verdict !== "pending") return verdict;
      if (!receipt && !seen) return "pending" as const;
      return verdict;
    })();

    const txToIsContract =
      receipt && tx?.to && refinedVerdict === "not_ours" && !seen && !nativeMatch && tokenTransfers.length === 0
        ? await bestEffortIsContract(provider, tx.to)
        : null;

    const diagnostic = (() => {
      // Only attach diagnostics when we have something actionable to say.
      if (!receipt && !tx) return null;

      // Reverted tx: never a valid deposit.
      if (receiptStatus === 0) {
        return {
          kind: "reverted_tx",
          message: "This transaction reverted on-chain (status=0), so it did not complete.",
        };
      }

      if (refinedVerdict !== "not_ours") return null;
      if (!receipt) return null;

      if (!seen && !nativeMatch && tokenTransfers.length === 0) {
        if (!tx?.to) {
          return {
            kind: "contract_creation_or_missing_to",
            message: "This transaction has no 'to' address (contract creation). It does not look like a direct deposit to your address.",
          };
        }

        if (txToIsContract === true) {
          return {
            kind: "contract_interaction_no_transfer_logs",
            tx_to_is_contract: true,
            message:
              "This transaction is a contract interaction. If you expected a deposit, you must send directly to your deposit address. Internal transfers from contracts may not be detectable without tracing support.",
          };
        }

        return {
          kind: "no_matching_transfers",
          message: "No native transfer or token Transfer logs were found to your active deposit address in this tx.",
        };
      }

      return null;
    })();

    const response = Response.json({
      ok: true,
      chain: "bsc",
      tx_hash: txHash,
      verdict: refinedVerdict,
      deposit_address: depositAddress,
      tip,
      receipt: {
        found: Boolean(receipt || tx),
        status: receiptStatus,
        block_number: receiptBlock,
        confirmations,
        confirmations_required: confirmationsRequired,
      },
      tx: tx
        ? {
            from: txFrom,
            to: txTo || null,
            value_wei: txValue.toString(),
            ...(txToIsContract != null ? { to_is_contract: txToIsContract } : {}),
          }
        : null,
      matches: {
        native: nativeTransfers,
        token: tokenTransfers,
      },
      events,
      can_post: canPost,
      ...(diagnostic ? { diagnostic } : {}),
    });
    return reply(response, { ok: true, verdict: refinedVerdict, scope_user_id: userId });
  } catch (e) {
    const resp = responseForDbError("exchange.deposits.trace", e);
    if (resp) return reply(resp, { code: "db_error" });
    const message = e instanceof Error ? e.message : String(e);
    return reply(apiError("internal_error", { details: { message } }), { code: "internal_error" });
  }
}
