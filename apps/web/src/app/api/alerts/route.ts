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

const fiatSchema = z
  .string()
  .optional()
  .transform((v) => (v ?? "USD").trim().toUpperCase())
  .refine((v) => /^[A-Z]{2,5}$/.test(v), "invalid_fiat");

const createSchema = z.object({
  template: z
    .string()
    .optional()
    .transform((v) => (v ?? "threshold").trim().toLowerCase())
    .refine((v) => ["threshold", "pct_change", "volatility_spike", "spread_widening"].includes(v), "invalid_template"),
  base_symbol: symbolSchema,
  fiat: fiatSchema,
  direction: z.enum(["above", "below"]).optional().default("above"),
  threshold: z
    .union([z.number(), z.string()])
    .optional()
    .transform((v) => (v == null ? null : Number(v)))
    .refine((v) => v == null || (Number.isFinite(v) && v > 0), "invalid_threshold"),
  window_sec: z
    .union([z.number().int(), z.string()])
    .optional()
    .transform((v) => (v == null ? null : Math.trunc(Number(v))))
    .refine((v) => v == null || (Number.isFinite(v) && v >= 60 && v <= 24 * 3600), "invalid_window_sec"),
  pct_change: z
    .union([z.number(), z.string()])
    .optional()
    .transform((v) => (v == null ? null : Number(v)))
    .refine((v) => v == null || (Number.isFinite(v) && v > 0 && v <= 100), "invalid_pct_change"),
  spread_bps: z
    .union([z.number(), z.string()])
    .optional()
    .transform((v) => (v == null ? null : Number(v)))
    .refine((v) => v == null || (Number.isFinite(v) && v > 0 && v <= 50_000), "invalid_spread_bps"),
  volatility_pct: z
    .union([z.number(), z.string()])
    .optional()
    .transform((v) => (v == null ? null : Number(v)))
    .refine((v) => v == null || (Number.isFinite(v) && v > 0 && v <= 100), "invalid_volatility_pct"),
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

  const scopeRes = await retryOnceOnTransientDbError(() => resolveReadOnlyUserScope(sql, request, actingUserId));
  if (!scopeRes.ok) return apiError(scopeRes.error);
  const userId = scopeRes.scope.userId;

  try {
    const activeErr = await requireActiveUser(sql, userId);
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
          template,
          direction,
          threshold::text,
          window_sec,
          pct_change::text AS pct_change,
          spread_bps::text AS spread_bps,
          volatility_pct::text AS volatility_pct,
          status,
          cooldown_sec,
          last_triggered_at,
          created_at
        FROM app_price_alert
        WHERE user_id = ${userId}::uuid
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

    const template = parsed.data.template as "threshold" | "pct_change" | "volatility_spike" | "spread_widening";
    if (template === "threshold") {
      if (!parsed.data.threshold || !parsed.data.direction) return apiError("invalid_input");
    }
    if (template === "pct_change") {
      if (!parsed.data.window_sec || !parsed.data.pct_change) return apiError("invalid_input");
    }
    if (template === "volatility_spike") {
      if (!parsed.data.window_sec || !parsed.data.volatility_pct) return apiError("invalid_input");
    }
    if (template === "spread_widening") {
      if (!parsed.data.spread_bps) return apiError("invalid_input");
    }

    const created = await retryOnceOnTransientDbError(async () => {
      const rows = await sql<{ id: string }[]>`
        INSERT INTO app_price_alert (
          user_id,
          base_symbol,
          fiat,
          template,
          direction,
          threshold,
          window_sec,
          pct_change,
          spread_bps,
          volatility_pct,
          cooldown_sec,
          status
        )
        VALUES (
          ${actingUserId}::uuid,
          ${parsed.data.base_symbol},
          ${parsed.data.fiat},
          ${template},
          ${parsed.data.direction},
          ${parsed.data.threshold == null ? null : String(parsed.data.threshold)},
          ${parsed.data.window_sec},
          ${parsed.data.pct_change == null ? null : String(parsed.data.pct_change)},
          ${parsed.data.spread_bps == null ? null : String(parsed.data.spread_bps)},
          ${parsed.data.volatility_pct == null ? null : String(parsed.data.volatility_pct)},
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
