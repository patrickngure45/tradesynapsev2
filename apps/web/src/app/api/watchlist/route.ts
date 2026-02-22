import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { resolveReadOnlyUserScope } from "@/lib/auth/impersonation";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const symbolSchema = z
  .string()
  .transform((v) => v.trim().toUpperCase())
  .refine((v) => /^[A-Z0-9]{2,12}$/.test(v), "invalid_symbol");

/**
 * GET /api/watchlist
 */
export async function GET(request: Request) {
  const sql = getSql();

  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const scopeRes = await retryOnceOnTransientDbError(() => resolveReadOnlyUserScope(sql, request, actingUserId));
  if (!scopeRes.ok) return apiError(scopeRes.error);
  const userId = scopeRes.scope.userId;

  try {
    const activeErr = await requireActiveUser(sql, userId);
    if (activeErr) return apiError(activeErr);

    const items = await retryOnceOnTransientDbError(async () => {
      return await sql<{ id: string; base_symbol: string; created_at: string }[]>`
        SELECT id::text, base_symbol, created_at
        FROM app_watchlist_item
        WHERE user_id = ${userId}::uuid
        ORDER BY created_at DESC
        LIMIT 200
      `;
    });

    return Response.json({ items });
  } catch (e) {
    const resp = responseForDbError("watchlist.list", e);
    if (resp) return resp;
    throw e;
  }
}

/**
 * POST /api/watchlist
 * Body: { base_symbol: string }
 */
export async function POST(request: Request) {
  const sql = getSql();

  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return apiError(activeErr);

    const body = await request.json().catch(() => ({}));
    const parsed = z.object({ base_symbol: symbolSchema }).safeParse(body);
    if (!parsed.success) return apiError("invalid_input");

    const row = await retryOnceOnTransientDbError(async () => {
      const rows = await sql<{ id: string; base_symbol: string; created_at: string }[]>`
        INSERT INTO app_watchlist_item (user_id, base_symbol)
        VALUES (${actingUserId}::uuid, ${parsed.data.base_symbol})
        ON CONFLICT (user_id, base_symbol) DO UPDATE
          SET base_symbol = EXCLUDED.base_symbol
        RETURNING id::text, base_symbol, created_at
      `;
      return rows[0] ?? null;
    });

    return Response.json({ ok: true, item: row });
  } catch (e) {
    const resp = responseForDbError("watchlist.add", e);
    if (resp) return resp;
    throw e;
  }
}

/**
 * DELETE /api/watchlist?base_symbol=BTC
 */
export async function DELETE(request: Request) {
  const sql = getSql();

  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return apiError(activeErr);

    const url = new URL(request.url);
    const base_symbol_raw = url.searchParams.get("base_symbol") ?? "";
    const parsed = symbolSchema.safeParse(base_symbol_raw);
    if (!parsed.success) return apiError("invalid_input");

    const deleted = await retryOnceOnTransientDbError(async () => {
      const rows = await sql<{ n: number }[]>`
        WITH d AS (
          DELETE FROM app_watchlist_item
          WHERE user_id = ${actingUserId}::uuid
            AND base_symbol = ${parsed.data}
          RETURNING 1
        )
        SELECT count(*)::int AS n FROM d
      `;
      return rows[0]?.n ?? 0;
    });

    return Response.json({ ok: true, deleted });
  } catch (e) {
    const resp = responseForDbError("watchlist.remove", e);
    if (resp) return resp;
    throw e;
  }
}
