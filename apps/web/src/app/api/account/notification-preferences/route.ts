import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { enforceAccountSecurityRateLimit } from "@/lib/auth/securityRateLimit";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KNOWN_TYPES = [
  "order_placed",
  "order_filled",
  "order_partially_filled",
  "order_canceled",
  "order_rejected",
  "deposit_credited",
  "withdrawal_approved",
  "withdrawal_rejected",
  "withdrawal_completed",
  "trade_won",
  "trade_lost",
  "p2p_order_created",
  "p2p_order_expiring",
  "p2p_payment_confirmed",
  "p2p_order_completed",
  "p2p_order_cancelled",
  "p2p_dispute_opened",
  "p2p_dispute_resolved",
  "p2p_feedback_received",
  "arcade_ready",
  "arcade_hint_ready",
  "price_alert",
  "system",
] as const;

const channelPrefsSchema = z.object({
  in_app: z.boolean(),
  email: z.boolean(),
});

const putSchema = z.object({
  // Backward compatible: old clients send boolean; new clients send { in_app, email }.
  prefs: z.record(z.enum(KNOWN_TYPES), z.union([z.boolean(), channelPrefsSchema])),
});

/**
 * GET /api/account/notification-preferences
 * PUT /api/account/notification-preferences
 */
export async function GET(request: Request) {
  const sql = getSql();
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("unauthorized", { status: 401 });

  try {
    const activeErr = await retryOnceOnTransientDbError(() => requireActiveUser(sql, actingUserId));
    if (activeErr) return apiError(activeErr);

    const rows = await retryOnceOnTransientDbError(async () => {
      return await (sql as any)<{ type: string; in_app_enabled: boolean; email_enabled: boolean; updated_at: string }[]>`
        SELECT
          type,
          coalesce(in_app_enabled, enabled) AS in_app_enabled,
          coalesce(email_enabled, false) AS email_enabled,
          updated_at
        FROM app_notification_preference
        WHERE user_id = ${actingUserId}::uuid
      `;
    });

    const prefs: Record<string, { in_app: boolean; email: boolean }> = Object.fromEntries(
      KNOWN_TYPES.map((t) => [t, { in_app: true, email: false }]),
    );
    for (const r of rows) {
      if (typeof r.type === "string" && r.type in prefs) {
        prefs[r.type] = { in_app: !!r.in_app_enabled, email: !!r.email_enabled };
      }
    }

    return Response.json({ prefs, known_types: KNOWN_TYPES });
  } catch (e) {
    const resp = responseForDbError("account.notification-preferences.get", e);
    if (resp) return resp;
    throw e;
  }
}

export async function PUT(request: Request) {
  const sql = getSql();
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("unauthorized", { status: 401 });

  const rl = await enforceAccountSecurityRateLimit({
    sql: sql as any,
    request,
    limiterName: "account.notification_preferences.put",
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

  let input: z.infer<typeof putSchema>;
  try {
    input = putSchema.parse(body);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  try {
    const activeErr = await retryOnceOnTransientDbError(() => requireActiveUser(sql, actingUserId));
    if (activeErr) return apiError(activeErr);

    await sql.begin(async (tx) => {
      const txSql = tx as any;
      for (const [type, enabled] of Object.entries(input.prefs)) {
        const next = typeof enabled === "boolean"
          ? { in_app: enabled, email: false }
          : { in_app: !!(enabled as any).in_app, email: !!(enabled as any).email };
        await txSql`
          INSERT INTO app_notification_preference (user_id, type, enabled, in_app_enabled, email_enabled, updated_at)
          VALUES (${actingUserId}::uuid, ${type}, ${next.in_app}, ${next.in_app}, ${next.email}, now())
          ON CONFLICT (user_id, type)
          DO UPDATE SET
            enabled = EXCLUDED.enabled,
            in_app_enabled = EXCLUDED.in_app_enabled,
            email_enabled = EXCLUDED.email_enabled,
            updated_at = now()
        `;
      }
    });

    return Response.json({ ok: true });
  } catch (e) {
    const resp = responseForDbError("account.notification-preferences.put", e);
    if (resp) return resp;
    throw e;
  }
}
