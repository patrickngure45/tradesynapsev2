import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { enforceTotpIfEnabled } from "@/lib/auth/requireTotp";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const createSchema = z.object({
  from_symbol: z.string().min(1).max(12),
  to_symbol: z.string().min(1).max(12),
  amount_in: z.string().min(1).max(80),
  cadence: z.enum(["daily", "weekly"]),
  first_run_in_min: z.coerce.number().int().min(1).max(24 * 60).optional().default(5),
  totp_code: z.string().length(6).regex(/^\d{6}$/).optional(),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["active", "paused", "canceled"]),
  totp_code: z.string().length(6).regex(/^\d{6}$/).optional(),
});

function normalizeSymbol(s: string): string {
  return String(s ?? "").trim().toUpperCase();
}

function safeAmountText(s: string): string {
  const t = String(s ?? "").trim();
  if (!t || t.length > 80) return "";
  if (!/^[0-9]+(\.[0-9]+)?$/.test(t)) return "";
  return t;
}

function ttlForAutomationSeconds(): number {
  const v = Number(String(process.env.EXCHANGE_AUTOMATION_AUTH_TTL_SEC ?? "").trim() || "2592000");
  if (!Number.isFinite(v) || v <= 0) return 60 * 60 * 24 * 30;
  return Math.max(60 * 60, Math.min(v, 60 * 60 * 24 * 180));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  let q: z.infer<typeof listSchema>;
  try {
    q = listSchema.parse({ limit: url.searchParams.get("limit") ?? undefined });
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
          id::text AS id,
          status,
          from_symbol,
          to_symbol,
          amount_in::text AS amount_in,
          cadence,
          next_run_at::text AS next_run_at,
          last_run_at::text AS last_run_at,
          auth_expires_at::text AS auth_expires_at,
          last_run_status,
          last_run_error,
          last_entry_id::text AS last_entry_id,
          created_at::text AS created_at,
          updated_at::text AS updated_at
        FROM app_recurring_buy_plan
        WHERE user_id = ${actingUserId}::uuid
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    });

    return Response.json({ plans: rows, limit });
  } catch (e) {
    const resp = responseForDbError("exchange.recurring-buys.list", e);
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

  const fromSym = normalizeSymbol(input.from_symbol);
  const toSym = normalizeSymbol(input.to_symbol);
  const amountIn = safeAmountText(input.amount_in);
  if (!fromSym || !toSym || !amountIn) return apiError("invalid_input");
  if (fromSym === toSym) return apiError("same_asset", { status: 409 });

  try {
    const activeErr = await retryOnceOnTransientDbError(() => requireActiveUser(sql, actingUserId));
    if (activeErr) return apiError(activeErr);

    const totpResp = await enforceTotpIfEnabled(sql, actingUserId, input.totp_code);
    if (totpResp) return totpResp;

    const ttlSec = ttlForAutomationSeconds();
    let authExpiresAt: Date | null = null;

    const userRows = await retryOnceOnTransientDbError(async () => {
      return await (sql as any)<{ totp_enabled: boolean }[]>`
        SELECT totp_enabled
        FROM app_user
        WHERE id = ${actingUserId}::uuid
        LIMIT 1
      `;
    });
    const totpEnabled = !!userRows[0]?.totp_enabled;
    if (totpEnabled) authExpiresAt = new Date(Date.now() + ttlSec * 1000);

    const firstRunAt = new Date(Date.now() + Math.max(1, input.first_run_in_min) * 60_000);

    const created = await sql.begin(async (tx) => {
      const txSql = tx as any;

      const assets: Array<{ symbol: string }> = await txSql`
        SELECT symbol
        FROM ex_asset
        WHERE chain = 'bsc'
          AND is_enabled = true
          AND symbol = ANY(${[fromSym, toSym]})
      `;
      const found = new Set(assets.map((a) => String(a.symbol ?? "").toUpperCase()));
      if (!found.has(fromSym) || !found.has(toSym)) {
        return { status: 404 as const, body: { error: "asset_not_found" } };
      }

      const rows = await txSql<{ id: string }[]>`
        INSERT INTO app_recurring_buy_plan (
          user_id,
          status,
          from_symbol,
          to_symbol,
          amount_in,
          cadence,
          next_run_at,
          auth_expires_at
        )
        VALUES (
          ${actingUserId}::uuid,
          'active',
          ${fromSym},
          ${toSym},
          ${amountIn}::numeric(38,18),
          ${input.cadence},
          ${firstRunAt.toISOString()}::timestamptz,
          ${authExpiresAt ? authExpiresAt.toISOString() : null}::timestamptz
        )
        RETURNING id::text AS id
      `;
      return { status: 201 as const, body: { ok: true, id: rows[0]!.id } };
    });

    const err = created.body as any;
    if (err?.error) return apiError(err.error, { status: created.status });
    return Response.json(created.body, { status: created.status });
  } catch (e) {
    const resp = responseForDbError("exchange.recurring-buys.create", e);
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
        FROM app_recurring_buy_plan p
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
        UPDATE app_recurring_buy_plan
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
    const resp = responseForDbError("exchange.recurring-buys.patch", e);
    if (resp) return resp;
    throw e;
  }
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";

  try {
    z.string().uuid().parse(id);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const sql = getSql();
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  try {
    const activeErr = await retryOnceOnTransientDbError(() => requireActiveUser(sql, actingUserId));
    if (activeErr) return apiError(activeErr);

    const result = await sql.begin(async (tx) => {
      const txSql = tx as any;
      const rows = await txSql<{ user_id: string }[]>`
        SELECT user_id::text AS user_id
        FROM app_recurring_buy_plan
        WHERE id = ${id}::uuid
        LIMIT 1
        FOR UPDATE
      `;
      if (!rows.length) return { status: 404 as const, body: { error: "not_found" } };
      if (rows[0]!.user_id !== actingUserId) return { status: 403 as const, body: { error: "actor_not_allowed" } };

      await txSql`
        UPDATE app_recurring_buy_plan
        SET status = 'canceled', updated_at = now()
        WHERE id = ${id}::uuid
      `;
      return { status: 200 as const, body: { ok: true } };
    });

    const err = result.body as any;
    if (err?.error) return apiError(err.error, { status: result.status });
    return Response.json(result.body, { status: result.status });
  } catch (e) {
    const resp = responseForDbError("exchange.recurring-buys.delete", e);
    if (resp) return resp;
    throw e;
  }
}
