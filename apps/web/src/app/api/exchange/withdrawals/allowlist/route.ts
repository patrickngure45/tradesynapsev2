import { z } from "zod";

import { getSql } from "@/lib/db";
import { requireSessionUserId } from "@/lib/auth/sessionGuard";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { apiError, apiZodError } from "@/lib/api/errors";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { enforceTotpRequired } from "@/lib/auth/requireTotp";
import { auditContextFromRequest, writeAuditLog } from "@/lib/auditLog";
import { getStepUpTokenFromRequest, verifyStepUpToken } from "@/lib/auth/stepUp";
import { createPgRateLimiter, type PgRateLimiter } from "@/lib/rateLimitPg";
import { logRouteResponse } from "@/lib/routeLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let allowlistLimiter: PgRateLimiter | null = null;
function getAllowlistLimiter(sql: ReturnType<typeof getSql>): PgRateLimiter {
  if (allowlistLimiter) return allowlistLimiter;
  const raw = Number(String(process.env.EXCHANGE_WITHDRAW_ALLOWLIST_MAX_PER_MIN ?? "4").trim());
  const max = Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : 4;
  allowlistLimiter = createPgRateLimiter(sql as any, {
    name: "exchange-withdraw-allowlist",
    windowMs: 60_000,
    max,
  });
  return allowlistLimiter;
}

const bscAddress = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/i, "Invalid address")
  .transform((s) => s.toLowerCase());

const createSchema = z.object({
  chain: z.literal("bsc").optional().default("bsc"),
  address: bscAddress,
  label: z.string().min(1).max(64).optional(),
  totp_code: z.string().length(6).regex(/^\d{6}$/).optional(),
});

export async function GET(request: Request) {
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
    const activeErr = await retryOnceOnTransientDbError(() => requireActiveUser(sql, actingUserId));
    if (activeErr) return reply(apiError(activeErr), { code: activeErr });

    const rows = await retryOnceOnTransientDbError(async () => {
      return await sql<
        {
          id: string;
          chain: string;
          address: string;
          label: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        }[]
      >`
        SELECT id, chain, address, label, status, created_at, updated_at
        FROM ex_withdrawal_allowlist
        WHERE user_id = ${actingUserId}
        ORDER BY created_at DESC
        LIMIT 100
      `;
    });

    return reply(Response.json({ user_id: actingUserId, addresses: rows }), { ok: true });
  } catch (e) {
    const resp = responseForDbError("exchange.withdrawals.allowlist.list", e);
    if (resp) return reply(resp, { code: "db_error" });
    throw e;
  }
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
    // Abuse prevention: rate limit allowlist writes.
    try {
      const rl = await getAllowlistLimiter(sql).consume(`u:${actingUserId}`);
      if (!rl.allowed) return reply(apiError("rate_limit_exceeded", { status: 429 }), { code: "rate_limit_exceeded" });
    } catch {
      // If limiter fails, do not block allowlist updates.
    }

    const activeErr = await retryOnceOnTransientDbError(() => requireActiveUser(sql, actingUserId));
    if (activeErr) return reply(apiError(activeErr), { code: activeErr });

    const body = await request.json().catch(() => ({}));
    let input: z.infer<typeof createSchema>;
    try {
      input = createSchema.parse(body);
    } catch (e) {
      return reply(apiZodError(e) ?? apiError("invalid_input"), { code: "invalid_input" });
    }

    // Security gates: email verified + strong auth.
    const uRows = await retryOnceOnTransientDbError(() =>
      sql<{ email_verified: boolean; totp_enabled: boolean }[]>`
        SELECT email_verified, totp_enabled
        FROM app_user
        WHERE id = ${actingUserId}::uuid
        LIMIT 1
      `
    );
    const u = uRows[0];
    if (!u) return reply(apiError("user_not_found"), { code: "user_not_found" });
    if (!u.email_verified) {
      return reply(apiError("email_not_verified", {
        status: 403,
        details: { message: "Verify your email before modifying withdrawal allowlists." },
      }), { code: "email_not_verified" });
    }

    const secret = process.env.PROOFPACK_SESSION_SECRET ?? "";
    if (!secret) return reply(apiError("session_secret_not_configured"), { code: "session_secret_not_configured" });

    const stepUpToken = getStepUpTokenFromRequest(request);
    const stepUp =
      typeof stepUpToken === "string" && stepUpToken
        ? verifyStepUpToken({ token: stepUpToken, secret })
        : null;
    const stepUpOk = !!stepUp && stepUp.ok && stepUp.payload.uid === actingUserId;

    if (!stepUpOk) {
      if (u.totp_enabled) {
        const totpResp = await enforceTotpRequired(sql, actingUserId, input.totp_code);
        if (totpResp) return reply(totpResp, { code: "totp_required" });
      } else {
        const pk = await retryOnceOnTransientDbError(() =>
          sql<{ c: number }[]>`
            SELECT count(*)::int AS c
            FROM user_passkey_credential
            WHERE user_id = ${actingUserId}::uuid
          `
        );
        if ((pk[0]?.c ?? 0) > 0) {
          return reply(apiError("stepup_required", {
            status: 403,
            details: { message: "Confirm with your passkey to continue." },
          }), { code: "stepup_required" });
        }
        return reply(apiError("totp_setup_required", {
          status: 403,
          details: { message: "Set up 2FA or add a passkey before modifying allowlists." },
        }), { code: "totp_setup_required" });
      }
    }

    const rows = await retryOnceOnTransientDbError(async () =>
      await sql<
      {
        id: string;
        chain: string;
        address: string;
        label: string | null;
        status: string;
        created_at: string;
        updated_at: string;
      }[]
    >`
      INSERT INTO ex_withdrawal_allowlist (user_id, chain, address, label, status)
      VALUES (${actingUserId}, ${input.chain}, ${input.address}, ${input.label ?? null}, 'active')
      ON CONFLICT (user_id, chain, address) DO UPDATE
        SET label = COALESCE(EXCLUDED.label, ex_withdrawal_allowlist.label),
            status = 'active',
            updated_at = now()
      RETURNING id, chain, address, label, status, created_at, updated_at
    `
    );

    const ctx = auditContextFromRequest(request);
    await writeAuditLog(sql, {
      actorId: actingUserId,
      actorType: "user",
      action: "exchange.withdrawals.allowlist.upsert",
      resourceType: "withdrawal_allowlist",
      resourceId: rows[0]?.id ?? null,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      detail: {
        chain: input.chain,
        address: input.address,
        label: input.label ?? null,
      },
    });

    return reply(Response.json({ address: rows[0] }, { status: 201 }), {
      ok: true,
      address_id: rows[0]?.id ?? null,
    });
  } catch (e) {
    const resp = responseForDbError("exchange.withdrawals.allowlist.create", e);
    if (resp) return reply(resp, { code: "db_error" });
    throw e;
  }
}
