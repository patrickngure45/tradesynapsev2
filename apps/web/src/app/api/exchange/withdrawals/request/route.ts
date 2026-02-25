import { z } from "zod";

import { getSql } from "@/lib/db";
import { requireSessionUserId } from "@/lib/auth/sessionGuard";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { apiError, apiZodError } from "@/lib/api/errors";
import { amount3818PositiveSchema } from "@/lib/exchange/amount";
import { enqueueOutbox } from "@/lib/outbox";
import { responseForDbError } from "@/lib/dbTransient";
import { logRouteResponse } from "@/lib/routeLog";
import { writeAuditLog, auditContextFromRequest } from "@/lib/auditLog";
import { checkWithdrawalVelocity } from "@/lib/exchange/withdrawalVelocity";
import { enforceTotpRequired } from "@/lib/auth/requireTotp";
import { chargeGasFeeFromQuote, quoteGasFee } from "@/lib/exchange/gas";
import { add3818, bpsFeeCeil3818, fromBigInt3818, sub3818NonNegative, toBigInt3818 } from "@/lib/exchange/fixed3818";
import { createNotification } from "@/lib/notifications";
import { getStepUpTokenFromRequest, verifyStepUpToken } from "@/lib/auth/stepUp";
import { logArcadeConsumption } from "@/lib/arcade/consumption";
import { createPgRateLimiter, type PgRateLimiter } from "@/lib/rateLimitPg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let withdrawalRequestLimiter: PgRateLimiter | null = null;
function getWithdrawalRequestLimiter(sql: ReturnType<typeof getSql>): PgRateLimiter {
  if (withdrawalRequestLimiter) return withdrawalRequestLimiter;
  const raw = Number(String(process.env.EXCHANGE_WITHDRAW_REQUEST_MAX_PER_MIN ?? "6").trim());
  const max = Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : 6;
  withdrawalRequestLimiter = createPgRateLimiter(sql as any, {
    name: "exchange-withdraw-request",
    windowMs: 60_000,
    max,
  });
  return withdrawalRequestLimiter;
}

const bscAddress = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/i, "Invalid address")
  .transform((s) => s.toLowerCase());

const requestSchema = z.object({
  asset_id: z.string().uuid(),
  amount: amount3818PositiveSchema,
  destination_address: bscAddress,
  reference: z.string().min(1).max(200).optional(),
  totp_code: z.string().length(6).regex(/^\d{6}$/).optional(),

  // Optional: spend an Arcade boost to reduce the charged withdrawal fee.
  use_fee_boost: z.boolean().optional().default(false),

  // Optional: spend an Arcade boost to prioritize withdrawal review.
  use_priority_boost: z.boolean().optional().default(false),
});

type KycLevel = "none" | "basic" | "full";

class AbortWithdrawalTx extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(opts: { status: number; code: string; details?: unknown }) {
    super(opts.code);
    this.status = opts.status;
    this.code = opts.code;
    this.details = opts.details;
  }
}

function csvEnv(name: string, fallbackCsv: string): string[] {
  const raw = (process.env[name] ?? fallbackCsv).trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function envHours(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

function envLimit3818(name: string, fallback: string): bigint | null {
  const rawEnv = (process.env[name] ?? "").trim();
  const raw = (rawEnv || fallback).trim();
  if (!raw || raw === "0") return null;
  try {
    return toBigInt3818(raw);
  } catch {
    try {
      return toBigInt3818(fallback);
    } catch {
      return null;
    }
  }
}

async function sumWithdrawals24hForAsset(sql: ReturnType<typeof getSql>, opts: { userId: string; assetId: string }) {
  const rows = await sql<{ sum24h: string }[]>`
    SELECT coalesce(sum(amount), 0)::text AS sum24h
    FROM ex_withdrawal_request
    WHERE user_id = ${opts.userId}::uuid
      AND asset_id = ${opts.assetId}::uuid
      AND created_at >= now() - interval '24 hours'
      AND status NOT IN ('failed', 'canceled', 'rejected')
  `;
  return rows[0]?.sum24h ?? "0";
}

export async function POST(request: Request) {
  const startMs = Date.now();
  const sql = getSql();

  let actingUserId: string | null = null;
  const reply = (response: Response, meta?: Record<string, unknown>) => {
    try {
      logRouteResponse(request, response, { startMs, userId: actingUserId, meta });
    } catch {
      // ignore
    }
    return response;
  };

  const authed = await requireSessionUserId(sql as any, request);
  if (!authed.ok) return reply(authed.response, { code: "unauthorized" });
  actingUserId = authed.userId;

  try {
    // Abuse prevention: rate limit withdrawal requests (even failed attempts can be expensive).
    try {
      const rl = await getWithdrawalRequestLimiter(sql).consume(`u:${actingUserId}`);
      if (!rl.allowed) return reply(apiError("rate_limit_exceeded", { status: 429 }), { code: "rate_limit_exceeded" });
    } catch {
      // If limiter fails, do not block withdrawals.
    }

    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return reply(apiError(activeErr), { code: activeErr });

    const body = await request.json().catch(() => ({}));
    let input: z.infer<typeof requestSchema>;
    try {
      input = requestSchema.parse(body);
    } catch (e) {
      return reply(apiZodError(e) ?? apiError("invalid_input"), { code: "invalid_input" });
    }

    // Load asset symbol early (outside tx) so we can enforce auth/tier rules.
    const preAssets = await sql<{ id: string; chain: string; symbol: string }[]>`
      SELECT id, chain, symbol
      FROM ex_asset
      WHERE id = ${input.asset_id} AND is_enabled = true
      LIMIT 1
    `;
    if (preAssets.length === 0) return reply(apiError("not_found", { status: 404 }), { code: "not_found" });
    const preAsset = preAssets[0]!;
    if (preAsset.chain !== "bsc") {
      return reply(apiError("invalid_input", { status: 400, details: "unsupported_chain" }), { code: "unsupported_chain" });
    }
    const sym = String(preAsset.symbol ?? "").toUpperCase();

    // ── Withdrawal security gates ──────────────────────────────────
    const uRows = await sql<{ email_verified: boolean; kyc_level: string; totp_enabled: boolean }[]>`
      SELECT email_verified, kyc_level, totp_enabled
      FROM app_user
      WHERE id = ${actingUserId}::uuid
      LIMIT 1
    `;
    const u = uRows[0];
    if (!u) return reply(apiError("user_not_found"), { code: "user_not_found" });
    if (!u.email_verified) {
      return reply(apiError("email_not_verified", {
        status: 403,
        details: { message: "Verify your email before requesting a withdrawal." },
      }), { code: "email_not_verified" });
    }

    // Strong auth required. For large withdrawals, require passkey step-up if available.
    const secret = process.env.PROOFPACK_SESSION_SECRET ?? "";
    if (!secret) return reply(apiError("session_secret_not_configured"), { code: "session_secret_not_configured" });

    const stepUpToken = getStepUpTokenFromRequest(request);
    const stepUp =
      typeof stepUpToken === "string" && stepUpToken
        ? verifyStepUpToken({ token: stepUpToken, secret })
        : null;
    const stepUpOk = !!stepUp && stepUp.ok && stepUp.payload.uid === actingUserId;

    const largeStepUpAssets = csvEnv("WITHDRAWAL_LARGE_STEPUP_ASSETS", "USDT,USDC,BUSD").map((s) => s.toUpperCase());
    const largeStepUpMin = envLimit3818("WITHDRAWAL_LARGE_STEPUP_MIN", "1000");
    const isLargeWithdrawal = !!largeStepUpMin
      && largeStepUpAssets.includes(sym)
      && toBigInt3818(input.amount) >= largeStepUpMin;

    let passkeyCount: number | null = null;
    const getPasskeyCount = async () => {
      if (passkeyCount !== null) return passkeyCount;
      const pk = await sql<{ c: number }[]>`
        SELECT count(*)::int AS c
        FROM user_passkey_credential
        WHERE user_id = ${actingUserId}::uuid
      `;
      passkeyCount = pk[0]?.c ?? 0;
      return passkeyCount;
    };

    if (!stepUpOk) {
      if (isLargeWithdrawal) {
        if ((await getPasskeyCount()) > 0) {
          return reply(apiError("stepup_required", {
            status: 403,
            details: { message: "Large withdrawals require passkey confirmation.", required_for: "large_withdrawal" },
          }), { code: "stepup_required" });
        }
        if (u.totp_enabled) {
          const totpResp = await enforceTotpRequired(sql, actingUserId, input.totp_code);
          if (totpResp) return reply(totpResp, { code: "totp_required" });
        } else {
          return reply(apiError("totp_setup_required", {
            status: 403,
            details: { message: "Set up 2FA before requesting large withdrawals." },
          }), { code: "totp_setup_required" });
        }
      } else if (u.totp_enabled) {
        const totpResp = await enforceTotpRequired(sql, actingUserId, input.totp_code);
        if (totpResp) return reply(totpResp, { code: "totp_required" });
      } else {
        if ((await getPasskeyCount()) > 0) {
          return reply(apiError("stepup_required", {
            status: 403,
            details: { message: "Confirm with your passkey to continue." },
          }), { code: "stepup_required" });
        }
        return reply(apiError("totp_setup_required", {
          status: 403,
          details: { message: "Set up 2FA or add a passkey before requesting a withdrawal." },
        }), { code: "totp_setup_required" });
      }
    }

    const kycLevel: KycLevel = (u.kyc_level === "full" || u.kyc_level === "basic" || u.kyc_level === "none")
      ? (u.kyc_level as KycLevel)
      : "none";

    // ── Velocity check (hard limit, outside the transaction) ──────────
    const velocity = await checkWithdrawalVelocity(sql, actingUserId, input.amount);
    if (!velocity.ok) {
      return reply(
        Response.json(
          { error: velocity.code, detail: velocity.detail },
          { status: 429, headers: { "Retry-After": "60" } },
        ),
        { code: velocity.code },
      );
    }

    // These limits operate per-asset so units are meaningful (e.g. USDT).
    // For non-stable assets, require full KYC by default.
    // Override via env if needed.
    const noneAllowed = csvEnv("WITHDRAWAL_NO_KYC_ALLOWED_ASSETS", "USDT").map((s) => s.toUpperCase());
    const basicAllowed = csvEnv("WITHDRAWAL_BASIC_ALLOWED_ASSETS", "USDT,USDC,BUSD").map((s) => s.toUpperCase());
    const noneMaxSingle = envLimit3818("WITHDRAWAL_NO_KYC_MAX_SINGLE", "50");
    const noneMax24h = envLimit3818("WITHDRAWAL_NO_KYC_MAX_24H", "100");
    const basicMaxSingle = envLimit3818("WITHDRAWAL_BASIC_MAX_SINGLE", "2000");
    const basicMax24h = envLimit3818("WITHDRAWAL_BASIC_MAX_24H", "5000");

    if (kycLevel === "none") {
      if (!noneAllowed.includes(sym)) {
        return reply(apiError("kyc_required_for_asset", {
          status: 403,
          details: { message: `Full verification is required to withdraw ${sym}.`, required_kyc: "full" },
        }), { code: "kyc_required_for_asset" });
      }
      if (noneMaxSingle && toBigInt3818(input.amount) > noneMaxSingle) {
        return reply(apiError("withdrawal_requires_kyc", {
          status: 403,
          details: { message: "Withdrawal amount exceeds the no-KYC limit.", required_kyc: "basic", limit: process.env.WITHDRAWAL_NO_KYC_MAX_SINGLE ?? "50" },
        }), { code: "withdrawal_requires_kyc" });
      }
      if (noneMax24h) {
        const sum24h = await sumWithdrawals24hForAsset(sql, { userId: actingUserId, assetId: preAsset.id });
        if (toBigInt3818(sum24h) + toBigInt3818(input.amount) > noneMax24h) {
          return reply(apiError("withdrawal_requires_kyc", {
            status: 403,
            details: {
              message: "Daily withdrawal limit reached for non-verified accounts.",
              required_kyc: "basic",
              limit_24h: process.env.WITHDRAWAL_NO_KYC_MAX_24H ?? "100",
              current_24h: sum24h,
            },
          }), { code: "withdrawal_requires_kyc" });
        }
      }
    }

    if (kycLevel === "basic") {
      if (!basicAllowed.includes(sym)) {
        return reply(apiError("kyc_required_for_asset", {
          status: 403,
          details: { message: `Full verification is required to withdraw ${sym}.`, required_kyc: "full" },
        }), { code: "kyc_required_for_asset" });
      }
      if (basicMaxSingle && toBigInt3818(input.amount) > basicMaxSingle) {
        return reply(apiError("withdrawal_requires_kyc", {
          status: 403,
          details: { message: "Withdrawal amount exceeds the Basic tier limit.", required_kyc: "full", limit: process.env.WITHDRAWAL_BASIC_MAX_SINGLE ?? "2000" },
        }), { code: "withdrawal_requires_kyc" });
      }
      if (basicMax24h) {
        const sum24h = await sumWithdrawals24hForAsset(sql, { userId: actingUserId, assetId: preAsset.id });
        if (toBigInt3818(sum24h) + toBigInt3818(input.amount) > basicMax24h) {
          return reply(apiError("withdrawal_requires_kyc", {
            status: 403,
            details: {
              message: "Daily withdrawal limit reached for Basic tier.",
              required_kyc: "full",
              limit_24h: process.env.WITHDRAWAL_BASIC_MAX_24H ?? "5000",
              current_24h: sum24h,
            },
          }), { code: "withdrawal_requires_kyc" });
        }
      }
    }

    let result: { status: number; body: unknown };
    try {
      result = await sql.begin(async (tx) => {
        const txSql = tx as unknown as typeof sql;

    const asset = preAsset;

    const allowlisted = await txSql<{ id: string; status: string; created_at: string }[]>`
      SELECT id, status, created_at
      FROM ex_withdrawal_allowlist
      WHERE user_id = ${actingUserId} AND chain = ${asset.chain} AND address = ${input.destination_address}
      LIMIT 1
    `;

    if (allowlisted.length === 0 || allowlisted[0]!.status !== "active") {
      return { status: 403 as const, body: { error: "withdrawal_address_not_allowlisted" } };
    }

    const minAgeHours = envHours("WITHDRAWAL_ALLOWLIST_MIN_AGE_HOURS", 0);
    if (minAgeHours > 0) {
      const okAge = await txSql<{ ok: boolean }[]>`
        SELECT (created_at <= now() - make_interval(hours => ${minAgeHours}::int)) AS ok
        FROM ex_withdrawal_allowlist
        WHERE id = ${allowlisted[0]!.id}::uuid
        LIMIT 1
      `;
      if (okAge.length > 0 && okAge[0] && okAge[0].ok === false) {
        return {
          status: 403 as const,
          body: { error: "withdrawal_allowlist_cooldown", details: { message: "New withdrawal addresses require a cooldown before use." } },
        };
      }
    }

    const accounts = await txSql<{ id: string }[]>`
      INSERT INTO ex_ledger_account (user_id, asset_id)
      VALUES (${actingUserId}, ${asset.id})
      ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
      RETURNING id
    `;
    const accountId = accounts[0]!.id;

    const balRows = await txSql<
      { posted: string; held: string; available: string; ok: boolean }[]
    >`
      WITH posted AS (
        SELECT coalesce(sum(amount), 0)::numeric AS posted
        FROM ex_journal_line
        WHERE account_id = ${accountId}
      ),
      held AS (
          SELECT coalesce(sum(remaining_amount), 0)::numeric AS held
        FROM ex_hold
        WHERE account_id = ${accountId} AND status = 'active'
      )
      SELECT
        posted.posted::text AS posted,
        held.held::text AS held,
        (posted.posted - held.held)::text AS available,
        ((posted.posted - held.held) >= (${input.amount}::numeric)) AS ok
      FROM posted, held
    `;

    const bal = balRows[0];

    const gasQuote = await quoteGasFee(txSql, {
      action: "withdrawal_request",
      chain: asset.chain,
      assetSymbol: asset.symbol,
    });
    if ("code" in gasQuote) {
      return { status: 409 as const, body: { error: gasQuote.code, details: gasQuote.details } };
    }

    let feeChargeAmount = gasQuote.enabled ? (gasQuote.chargeAmount ?? "") : "0";
    if (gasQuote.enabled && (!feeChargeAmount || toBigInt3818(feeChargeAmount) < 0n)) {
      return {
        status: 409 as const,
        body: {
          error: "gas_fee_invalid",
          details: { message: "missing_fee_charge_amount", quote: gasQuote },
        },
      };
    }

    let appliedFeeBoost: null | { code: string; bps: number; discount_amount: string; fee_before: string; fee_after: string } = null;
    let feeBoostToConsume: null | { inventory_id: string; code: string; quantity: number; fee_before: string; fee_after: string; discount_amount: string; bps: number } = null;
    if (input.use_fee_boost && gasQuote.enabled) {
      const feeBig = toBigInt3818(feeChargeAmount || "0");
      if (feeBig > 0n) {
        const invRows = await txSql<
          {
            id: string;
            quantity: number;
            code: string;
          }[]
        >`
          SELECT id::text AS id, quantity, code
          FROM arcade_inventory
          WHERE user_id = ${actingUserId}::uuid
            AND kind = 'boost'
            AND code = ANY(ARRAY['fee_25bps_7d','fee_15bps_72h','fee_10bps_48h','fee_5bps_24h']::text[])
          ORDER BY
            CASE code
              WHEN 'fee_25bps_7d' THEN 1
              WHEN 'fee_15bps_72h' THEN 2
              WHEN 'fee_10bps_48h' THEN 3
              WHEN 'fee_5bps_24h' THEN 4
              ELSE 99
            END,
            updated_at DESC
          LIMIT 1
          FOR UPDATE
        `;

        if (!invRows.length || Number(invRows[0]!.quantity ?? 0) <= 0) {
          return { status: 409 as const, body: { error: "insufficient_balance", details: { message: "No fee discount boost available." } } };
        }

        const inv = invRows[0]!;
        const m = String(inv.code ?? "").match(/fee_(\d+)bps/i);
        const bps = m ? Number(m[1]) : 0;
        if (!Number.isFinite(bps) || bps <= 0 || bps > 2500) {
          return { status: 409 as const, body: { error: "internal_error", details: { message: "invalid_fee_boost" } } };
        }

        const maxDiscount = bpsFeeCeil3818(input.amount, bps);
        const maxDiscountBig = toBigInt3818(maxDiscount);
        const discountBig = maxDiscountBig >= feeBig ? feeBig : maxDiscountBig;
        const feeAfterBig = feeBig - discountBig;
        const feeAfter = fromBigInt3818(feeAfterBig);

        feeChargeAmount = feeAfter;
        appliedFeeBoost = {
          code: inv.code,
          bps,
          discount_amount: fromBigInt3818(discountBig),
          fee_before: fromBigInt3818(feeBig),
          fee_after: feeAfter,
        };

        feeBoostToConsume = {
          inventory_id: inv.id,
          code: inv.code,
          quantity: Number(inv.quantity ?? 0),
          fee_before: fromBigInt3818(feeBig),
          fee_after: feeAfter,
          discount_amount: fromBigInt3818(discountBig),
          bps,
        };
      }
    }

    const requestedTotal = add3818(input.amount, feeChargeAmount || "0");
    const availableBig = toBigInt3818(bal?.available ?? "0");
    const okTotal = availableBig >= toBigInt3818(requestedTotal);
    if (!okTotal) {
      return {
        status: 409 as const,
        body: {
          error: "insufficient_balance",
          details: {
            posted: bal?.posted ?? "0",
            held: bal?.held ?? "0",
            available: bal?.available ?? "0",
            requested: input.amount,
            network_fee_display: gasQuote.enabled
              ? { amount: gasQuote.amount, symbol: gasQuote.gasSymbol }
              : { amount: "0", symbol: gasQuote.gasSymbol },
            fee_charged_in_asset: feeChargeAmount || "0",
            total_debit: requestedTotal,
          },
        },
      };
    }

    // Create request first to get an id, then create the hold referencing it.
    const reqRows = await txSql<
      {
        id: string;
        status: string;
        created_at: string;
      }[]
    >`
      INSERT INTO ex_withdrawal_request (
        user_id,
        asset_id,
        amount,
        destination_address,
        allowlist_id,
        status,
        reference
      )
      VALUES (
        ${actingUserId},
        ${asset.id},
        (${input.amount}::numeric),
        ${input.destination_address},
        ${allowlisted[0]!.id},
        'requested',
        ${input.reference ?? null}
      )
      RETURNING id, status, created_at
    `;

    const withdrawalId = reqRows[0]!.id;

    let appliedPriorityBoost: null | { code: string; hours: number; priority_until: string } = null;
    if (input.use_priority_boost) {
      const invRows = await txSql<
        {
          id: string;
          quantity: number;
          code: string;
          metadata_json: any;
        }[]
      >`
        SELECT id::text AS id, quantity, code, metadata_json
        FROM arcade_inventory
        WHERE user_id = ${actingUserId}::uuid
          AND kind = 'boost'
          AND code = ANY(ARRAY['withdraw_priority_72h','withdraw_priority_12h']::text[])
        ORDER BY
          CASE code
            WHEN 'withdraw_priority_72h' THEN 1
            WHEN 'withdraw_priority_12h' THEN 2
            ELSE 99
          END,
          updated_at DESC
        LIMIT 1
        FOR UPDATE
      `;

      if (!invRows.length || Number(invRows[0]!.quantity ?? 0) <= 0) {
        return { status: 409 as const, body: { error: "insufficient_balance", details: { message: "No withdrawal priority boost available." } } };
      }

      const inv = invRows[0]!;
      const invQty = Number(inv.quantity ?? 0);
      const m = String(inv.code ?? "").match(/priority_(\d+)h/i);
      const hoursFromCode = m ? Number(m[1]) : 0;
      const hoursRaw = inv.metadata_json?.duration_hours;
      const hours = Math.max(1, Math.min(24 * 30, Number(hoursRaw ?? hoursFromCode ?? 12)));

      if (invQty === 1) {
        await txSql`
          DELETE FROM arcade_inventory
          WHERE id = ${inv.id}::uuid
        `;
      } else {
        await txSql`
          UPDATE arcade_inventory
          SET quantity = ${invQty - 1}, updated_at = now()
          WHERE id = ${inv.id}::uuid
        `;
      }

      const priRows = await txSql<{ priority_until: string | null }[]>`
        UPDATE ex_withdrawal_request
        SET priority_until = (
            CASE
              WHEN priority_until IS NULL OR priority_until < now() THEN now()
              ELSE priority_until
            END
          ) + make_interval(hours => ${hours}::int),
          priority_boost_code = ${inv.code},
          priority_applied_at = now(),
          updated_at = now()
        WHERE id = ${withdrawalId}::uuid
        RETURNING priority_until::text AS priority_until
      `;

      appliedPriorityBoost = {
        code: inv.code,
        hours,
        priority_until: String(priRows[0]?.priority_until ?? ""),
      };

      await logArcadeConsumption(txSql, {
        user_id: actingUserId,
        kind: "boost",
        code: inv.code,
        rarity: null,
        quantity: 1,
        context_type: "withdrawal_request",
        context_id: withdrawalId,
        module: "withdrawal_priority",
        metadata: { hours, priority_until: appliedPriorityBoost.priority_until },
      });
    }

    const holdRows = await txSql<
      { id: string; amount: string; status: string; created_at: string }[]
    >`
      INSERT INTO ex_hold (account_id, asset_id, amount, reason)
      VALUES (${accountId}, ${asset.id}, (${input.amount}::numeric), ${`withdrawal:${withdrawalId}`})
      RETURNING id, amount::text AS amount, status, created_at
    `;

    const holdId = holdRows[0]!.id;

    await txSql`
      UPDATE ex_withdrawal_request
      SET hold_id = ${holdId}, updated_at = now()
      WHERE id = ${withdrawalId}
    `;

    if (gasQuote.enabled && toBigInt3818(feeChargeAmount || "0") > 0n) {
      const effectiveQuote = {
        ...gasQuote,
        chargeAmount: feeChargeAmount,
        details: {
          ...(gasQuote.details ?? {}),
          ...(appliedFeeBoost
            ? {
              arcade_fee_boost: {
                code: appliedFeeBoost.code,
                bps: appliedFeeBoost.bps,
                fee_before: appliedFeeBoost.fee_before,
                fee_after: appliedFeeBoost.fee_after,
                discount_amount: appliedFeeBoost.discount_amount,
              },
            }
            : {}),
        },
      };

      const gasErr = await chargeGasFeeFromQuote(
        txSql,
        {
          userId: actingUserId,
          action: "withdrawal_request",
          reference: `withdrawal:${withdrawalId}`,
          chain: asset.chain,
          assetSymbol: asset.symbol,
        },
        effectiveQuote as any,
      );
      if (gasErr) {
        throw new AbortWithdrawalTx({ status: 409, code: gasErr.code, details: gasErr.details });
      }
    }

    if (feeBoostToConsume) {
      const invQty = Number(feeBoostToConsume.quantity ?? 0);
      if (invQty <= 0) {
        throw new AbortWithdrawalTx({ status: 409, code: "insufficient_balance", details: { message: "No fee discount boost available." } });
      }

      if (invQty === 1) {
        await txSql`
          DELETE FROM arcade_inventory
          WHERE id = ${feeBoostToConsume.inventory_id}::uuid
        `;
      } else {
        await txSql`
          UPDATE arcade_inventory
          SET quantity = ${invQty - 1}, updated_at = now()
          WHERE id = ${feeBoostToConsume.inventory_id}::uuid
        `;
      }

      await logArcadeConsumption(txSql, {
        user_id: actingUserId,
        kind: "boost",
        code: feeBoostToConsume.code,
        rarity: null,
        quantity: 1,
        context_type: "withdrawal_request",
        context_id: withdrawalId,
        module: "withdrawal_fee",
        metadata: {
          fee_before: feeBoostToConsume.fee_before,
          fee_after: feeBoostToConsume.fee_after,
          discount_amount: feeBoostToConsume.discount_amount,
          bps: feeBoostToConsume.bps,
        },
      });
    }

    await enqueueOutbox(txSql, {
      topic: "ex.withdrawal.requested",
      aggregate_type: "withdrawal",
      aggregate_id: withdrawalId,
      payload: {
        withdrawal_id: withdrawalId,
        user_id: actingUserId,
        asset_id: asset.id,
        asset_symbol: asset.symbol,
        chain: asset.chain,
        amount: input.amount,
        destination_address: input.destination_address,
      },
    });

    // Notify user immediately that a send request was accepted and is queued.
    // We use the existing 'system' type to avoid widening the DB CHECK constraint.
    const destinationShort = `${input.destination_address.slice(0, 6)}…${input.destination_address.slice(-4)}`;
    await createNotification(txSql as any, {
      userId: actingUserId,
      type: "system",
      title: "Withdrawal requested",
      body: `You requested to send ${input.amount} ${asset.symbol} to ${destinationShort}. Processing will start after review/approval.`,
      metadata: {
        withdrawal_id: withdrawalId,
        asset_symbol: asset.symbol,
        chain: asset.chain,
        amount: input.amount,
        destination_address: input.destination_address,
        fee_boost: appliedFeeBoost,
        priority_boost: appliedPriorityBoost,
      },
    });

        return {
          status: 201 as const,
          body: {
            withdrawal: {
              id: withdrawalId,
              asset_id: asset.id,
              chain: asset.chain,
              symbol: asset.symbol,
              amount: input.amount,
              destination_address: input.destination_address,
              status: "requested",
              hold_id: holdId,
              created_at: reqRows[0]!.created_at,
              priority: appliedPriorityBoost,
              fees: gasQuote.enabled
                ? {
                  network_fee_display_amount: gasQuote.amount,
                  network_fee_display_symbol: gasQuote.gasSymbol,
                  fee_charged_in_asset_amount: feeChargeAmount || "0",
                  fee_charged_in_asset_symbol: asset.symbol,
                  fee_boost: appliedFeeBoost,
                }
                : {
                  network_fee_display_amount: "0",
                  network_fee_display_symbol: gasQuote.gasSymbol,
                  fee_charged_in_asset_amount: "0",
                  fee_charged_in_asset_symbol: asset.symbol,
                  fee_boost: appliedFeeBoost,
                },
            },
          },
        };
      });
    } catch (e) {
      if (e instanceof AbortWithdrawalTx) {
        return apiError(e.code, { status: e.status, details: e.details });
      }
      throw e;
    }

    const err = result.body as { error?: string; details?: unknown };
    if (typeof err.error === "string") {
      return reply(apiError(err.error, { status: result.status, details: err.details }), { code: err.error });
    }

    const response = reply(Response.json(result.body, { status: result.status }), {
      withdrawalId: (result.body as any)?.withdrawal?.id,
    });

    try {
      const w = (result.body as any)?.withdrawal;
      if (w?.id) {
        await writeAuditLog(sql, {
          actorId: actingUserId,
          actorType: "user",
          action: "withdrawal.requested",
          resourceType: "withdrawal",
          resourceId: w.id,
          ...auditContextFromRequest(request),
          detail: { amount: w.amount, asset_id: w.asset_id, destination: w.destination_address },
        });
      }
    } catch { /* audit log failure must not block the response */ }

    return response;
  } catch (e) {
    const resp = responseForDbError("exchange.withdrawals.request", e);
    if (resp) return reply(resp, { code: "db_error" });
    console.error("exchange.withdrawals.request failed:", e);
    return reply(apiError("internal_error", {
      details: {
        message: e instanceof Error ? e.message : String(e),
      },
    }), { code: "internal_error" });
  }
}
