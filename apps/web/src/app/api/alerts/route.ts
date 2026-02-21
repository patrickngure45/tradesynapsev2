import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const symbolSchema = z
  .string()
  .transform((v) => v.trim().toUpperCase())
  .refine((v) => /^[A-Z0-9]{2,12}$/.test(v), "invalid_symbol");

const fiatSchema = z
  .string()
  .optional()
  .transform((v) => (v ?? "USD").trim().toUpperCase())
  .refine((v) => /^[A-Z]{2,5}$/.test(v), "invalid_fiat");

const createSchema = z.object({
  base_symbol: symbolSchema,
  fiat: fiatSchema,
  direction: z.enum(["above", "below"]),
  threshold: z
    .union([z.number(), z.string()])
    .transform((v) => Number(v))
    .refine((v) => Number.isFinite(v) && v > 0, "invalid_threshold"),
  cooldown_sec: z
    .union([z.number().int(), z.string()])
    .optional()
    .transform((v) => (v == null ? 3600 : Number(v)))
    .refine((v) => Number.isFinite(v) && v >= 60 && v <= 7 * 24 * 3600, "invalid_cooldown"),
});

/**
 * GET /api/alerts
 */
export async function GET(request: Request) {
  const sql = getSql();

  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return apiError(activeErr);

    const rows = await retryOnceOnTransientDbError(async () => {
      return await sql<
        {
          id: string;
          base_symbol: string;
          fiat: string;
          direction: string;
          threshold: string;
          status: string;
          cooldown_sec: number;
          last_triggered_at: string | null;
          created_at: string;
        }[]
      >`
        SELECT
          id::text,
          base_symbol,
          fiat,
          direction,
          threshold::text,
          status,
          cooldown_sec,
          last_triggered_at,
          created_at
        FROM app_price_alert
        WHERE user_id = ${actingUserId}::uuid
          AND status <> 'deleted'
        ORDER BY created_at DESC
        LIMIT 200
      `;
    });

    return Response.json({ alerts: rows });
  } catch (e) {
    const resp = responseForDbError("alerts.list", e);
    if (resp) return resp;
    throw e;
  }
}

/**
 * POST /api/alerts
 * Body: { base_symbol, fiat, direction, threshold, cooldown_sec? }
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
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return apiError("invalid_input");

    const created = await retryOnceOnTransientDbError(async () => {
      const rows = await sql<{ id: string }[]>`
        INSERT INTO app_price_alert (
          user_id,
          base_symbol,
          fiat,
          direction,
          threshold,
          cooldown_sec,
          status
        )
        VALUES (
          ${actingUserId}::uuid,
          ${parsed.data.base_symbol},
          ${parsed.data.fiat},
          ${parsed.data.direction},
          ${String(parsed.data.threshold)},
          ${Math.floor(parsed.data.cooldown_sec)},
          'active'
        )
        RETURNING id::text
      `;
      return rows[0]?.id ?? null;
    });

    return Response.json({ ok: true, id: created });
  } catch (e) {
    const resp = responseForDbError("alerts.create", e);
    if (resp) return resp;
    throw e;
  }
}

/**
 * DELETE /api/alerts?id=<uuid>
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
    const id = url.searchParams.get("id") ?? "";
    const parsed = z.string().uuid().safeParse(id);
    if (!parsed.success) return apiError("invalid_input");

    const updated = await retryOnceOnTransientDbError(async () => {
      const rows = await sql<{ n: number }[]>`
        WITH u AS (
          UPDATE app_price_alert
          SET status = 'deleted'
          WHERE id = ${parsed.data}::uuid
            AND user_id = ${actingUserId}::uuid
            AND status <> 'deleted'
          RETURNING 1
        )
        SELECT count(*)::int AS n FROM u
      `;
      return rows[0]?.n ?? 0;
    });

    return Response.json({ ok: true, deleted: updated });
  } catch (e) {
    const resp = responseForDbError("alerts.delete", e);
    if (resp) return resp;
    throw e;
  }
}
