import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { enforceTotpIfEnabled } from "@/lib/auth/requireTotp";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { fromBigInt3818, toBigInt3818 } from "@/lib/exchange/fixed3818";
import { quantizeDownToStep3818 } from "@/lib/exchange/steps";
import { enforceAccountSecurityRateLimit } from "@/lib/auth/securityRateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  market_id: z.string().uuid().optional(),
});

const createSchema = z.object({
  market_id: z.string().uuid(),
  side: z.enum(["buy", "sell"]),
  total_quantity: z.string().min(1).max(80),
  slice_count: z.coerce.number().int().min(2).max(50),
  interval_sec: z.coerce.number().int().min(10).max(24 * 60 * 60),
  first_run_in_sec: z.coerce.number().int().min(1).max(3600).optional().default(5),
  totp_code: z.string().length(6).regex(/^\d{6}$/).optional(),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["active", "paused", "canceled"]),
  totp_code: z.string().length(6).regex(/^\d{6}$/).optional(),
});

function ttlForAutomationSeconds(): number {
  const v = Number(String(process.env.EXCHANGE_AUTOMATION_AUTH_TTL_SEC ?? "").trim() || "2592000");
  if (!Number.isFinite(v) || v <= 0) return 60 * 60 * 24 * 30;
  return Math.max(60 * 60, Math.min(v, 60 * 60 * 24 * 180));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  let q: z.infer<typeof listSchema>;
  try {
    q = listSchema.parse({
      limit: url.searchParams.get("limit") ?? undefined,
      market_id: url.searchParams.get("market_id") ?? undefined,
    });
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const sql = getSql();
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("unauthorized", { status: 401 });

  try {
    const activeErr = await retryOnceOnTransientDbError(() => requireActiveUser(sql, actingUserId));
    if (activeErr) return apiError(activeErr);

    const limit = q.limit ?? 50;
    const rows = await retryOnceOnTransientDbError(async () => {
      return await (sql as any)<any[]>`
        SELECT
          p.id::text AS id,
          p.status,
          p.market_id::text AS market_id,
          m.symbol AS market_symbol,
          p.side,
          p.total_quantity::text AS total_quantity,
          p.remaining_quantity::text AS remaining_quantity,
          p.slice_quantity::text AS slice_quantity,
          p.interval_sec,
          p.next_run_at::text AS next_run_at,
          p.last_run_at::text AS last_run_at,
          p.auth_expires_at::text AS auth_expires_at,
          p.last_run_status,
          p.last_run_error,
          p.created_at::text AS created_at,
          p.updated_at::text AS updated_at
        FROM app_twap_plan p
        JOIN ex_market m ON m.id = p.market_id
        WHERE p.user_id = ${actingUserId}::uuid
          ${q.market_id ? sql`AND p.market_id = ${q.market_id}::uuid` : sql``}
        ORDER BY p.created_at DESC
        LIMIT ${limit}
      `;
    });

    return Response.json({ plans: rows, limit });
  } catch (e) {
    const resp = responseForDbError("exchange.twap.list", e);
    if (resp) return resp;
    throw e;
  }
}

export async function POST(request: Request) {
  const sql = getSql();
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const rl = await enforceAccountSecurityRateLimit({
    sql: sql as any,
    request,
    limiterName: "exchange.twap.create",
    windowMs: 60_000,
    max: 12,
    userId: actingUserId,
  });
  if (rl) return rl;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_input");
  }

  let input: z.infer<typeof createSchema>;
  try {
    input = createSchema.parse(body);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  try {
    const activeErr = await retryOnceOnTransientDbError(() => requireActiveUser(sql, actingUserId));
    if (activeErr) return apiError(activeErr);

    const totpResp = await enforceTotpIfEnabled(sql, actingUserId, input.totp_code);
    if (totpResp) return totpResp;

    // Load market + lot size for quantization.
    const marketRows = await retryOnceOnTransientDbError(async () => {
      return await (sql as any)<{ id: string; lot_size: string }[]>`
        SELECT id::text AS id, lot_size::text AS lot_size
        FROM ex_market
        WHERE id = ${input.market_id}::uuid
          AND status = 'enabled'
        LIMIT 1
      `;
    });
    const m = marketRows[0];
    if (!m) return apiError("market_not_found", { status: 404 });

    const lot = String(m.lot_size ?? "0.00000001");
    let totalQty: string;
    let sliceQty: string;
    try {
      totalQty = quantizeDownToStep3818(String(input.total_quantity), lot);
      if (toBigInt3818(totalQty) <= 0n) return apiError("invalid_input", { status: 400, details: "quantity_too_small" });

      const totalI = toBigInt3818(totalQty);
      const count = BigInt(input.slice_count);
      const sliceI = totalI / count;
      if (sliceI <= 0n) return apiError("invalid_input", { status: 400, details: "slice_too_small" });
      sliceQty = quantizeDownToStep3818(fromBigInt3818(sliceI), lot);
      if (toBigInt3818(sliceQty) <= 0n) return apiError("invalid_input", { status: 400, details: "slice_too_small" });
    } catch {
      return apiError("invalid_input", { status: 400, details: "invalid_quantity" });
    }

    const userRows = await retryOnceOnTransientDbError(async () => {
      return await (sql as any)<{ totp_enabled: boolean }[]>`
        SELECT totp_enabled
        FROM app_user
        WHERE id = ${actingUserId}::uuid
        LIMIT 1
      `;
    });
    const totpEnabled = !!userRows[0]?.totp_enabled;
    const authExpiresAt = totpEnabled ? new Date(Date.now() + ttlForAutomationSeconds() * 1000) : null;

    const firstRunAt = new Date(Date.now() + Math.max(1, input.first_run_in_sec) * 1000);

    const created = await sql.begin(async (tx) => {
      const txSql = tx as any;
      const rows = await txSql<{ id: string }[]>`
        INSERT INTO app_twap_plan (
          user_id,
          market_id,
          side,
          status,
          total_quantity,
          remaining_quantity,
          slice_quantity,
          interval_sec,
          next_run_at,
          auth_expires_at
        )
        VALUES (
          ${actingUserId}::uuid,
          ${input.market_id}::uuid,
          ${input.side},
          'active',
          ${totalQty}::numeric(38,18),
          ${totalQty}::numeric(38,18),
          ${sliceQty}::numeric(38,18),
          ${input.interval_sec},
          ${firstRunAt.toISOString()}::timestamptz,
          ${authExpiresAt ? authExpiresAt.toISOString() : null}::timestamptz
        )
        RETURNING id::text AS id
      `;
      return { status: 201 as const, body: { ok: true, id: rows[0]!.id } };
    });

    return Response.json(created.body, { status: created.status });
  } catch (e) {
    const resp = responseForDbError("exchange.twap.create", e);
    if (resp) return resp;
    throw e;
  }
}

export async function PATCH(request: Request) {
  const sql = getSql();
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const rl = await enforceAccountSecurityRateLimit({
    sql: sql as any,
    request,
    limiterName: "exchange.twap.patch",
    windowMs: 60_000,
    max: 20,
    userId: actingUserId,
  });
  if (rl) return rl;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_input");
  }

  let input: z.infer<typeof patchSchema>;
  try {
    input = patchSchema.parse(body);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  try {
    const activeErr = await retryOnceOnTransientDbError(() => requireActiveUser(sql, actingUserId));
    if (activeErr) return apiError(activeErr);

    if (input.status === "active") {
      const totpResp = await enforceTotpIfEnabled(sql, actingUserId, input.totp_code);
      if (totpResp) return totpResp;
    }

    const result = await sql.begin(async (tx) => {
      const txSql = tx as any;
      const rows = await txSql<{ user_id: string; totp_enabled: boolean }[]>`
        SELECT p.user_id::text AS user_id, u.totp_enabled
        FROM app_twap_plan p
        JOIN app_user u ON u.id = p.user_id
        WHERE p.id = ${input.id}::uuid
        LIMIT 1
        FOR UPDATE
      `;
      if (!rows.length) return { status: 404 as const, body: { error: "not_found" } };
      if (rows[0]!.user_id !== actingUserId) return { status: 403 as const, body: { error: "actor_not_allowed" } };

      let authExpiresAt: string | null = null;
      if (input.status === "active" && !!rows[0]!.totp_enabled) {
        authExpiresAt = new Date(Date.now() + ttlForAutomationSeconds() * 1000).toISOString();
      }

      await txSql`
        UPDATE app_twap_plan
        SET status = ${input.status},
            auth_expires_at = ${authExpiresAt}::timestamptz,
            updated_at = now()
        WHERE id = ${input.id}::uuid
      `;
      return { status: 200 as const, body: { ok: true } };
    });

    const err = result.body as any;
    if (err?.error) return apiError(err.error, { status: result.status });
    return Response.json(result.body, { status: result.status });
  } catch (e) {
    const resp = responseForDbError("exchange.twap.patch", e);
    if (resp) return resp;
    throw e;
  }
}
