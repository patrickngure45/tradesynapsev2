import type { Sql } from "postgres";

export type NotificationSeverity = "info" | "success" | "warning" | "danger";

export type NotificationType =
  | "order_placed"
  | "order_filled"
  | "order_partially_filled"
  | "order_canceled"
  | "order_rejected"
  | "deposit_credited"
  | "withdrawal_approved"
  | "withdrawal_rejected"
  | "withdrawal_completed"
  | "trade_won"
  | "trade_lost"
  | "p2p_order_created"
  | "p2p_order_expiring"
  | "p2p_payment_confirmed"
  | "p2p_order_completed"
  | "p2p_order_cancelled"
  | "p2p_dispute_opened"
  | "p2p_dispute_resolved"
  | "p2p_feedback_received"
  | "arcade_ready"
  | "arcade_hint_ready"
  | "price_alert"
  | "system";

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

function getString(meta: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = meta[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

function getSeverityForType(type: NotificationType): NotificationSeverity {
  switch (type) {
    case "order_placed":
      return "info";
    case "deposit_credited":
    case "withdrawal_completed":
    case "order_filled":
    case "p2p_order_completed":
    case "p2p_feedback_received":
      return "success";
    case "p2p_order_expiring":
    case "p2p_payment_confirmed":
    case "withdrawal_approved":
    case "order_partially_filled":
      return "warning";
    case "withdrawal_rejected":
    case "order_canceled":
    case "order_rejected":
    case "p2p_order_cancelled":
    case "p2p_dispute_opened":
      return "danger";
    case "arcade_ready":
    case "arcade_hint_ready":
      return "info";
    case "price_alert":
      return "warning";
    case "p2p_dispute_resolved":
    case "p2p_order_created":
    case "trade_won":
    case "trade_lost":
    case "system":
    default:
      return "info";
  }
}

function deriveHref(type: NotificationType, meta: Record<string, unknown>): string | null {
  const orderId = getString(meta, "order_id", "orderId");
  const withdrawalId = getString(meta, "withdrawal_id", "withdrawalId");
  const assetSymbol = getString(meta, "asset_symbol", "assetSymbol", "symbol");

  if (orderId && type.startsWith("p2p_")) return `/p2p/orders/${orderId}`;

  if (withdrawalId && type.startsWith("withdrawal_")) return "/wallet";

  switch (type) {
    case "arcade_ready":
    case "arcade_hint_ready":
      return "/arcade";
    case "price_alert":
      return "/home";
    case "deposit_credited":
      // Nudge users toward offloading via P2P (no fiat specified so it auto-selects from /api/whoami).
      return assetSymbol ? `/p2p?side=SELL&asset=${encodeURIComponent(assetSymbol)}&src=deposit` : "/wallet";
    case "order_filled":
    case "order_partially_filled":
    case "order_canceled":
    case "order_placed":
    case "order_rejected":
      return "/order-history";
    default:
      return null;
  }
}

function applyNotificationPolicy(type: NotificationType, metadata: Record<string, unknown> | undefined) {
  const meta = { ...(metadata ?? {}) } as Record<string, unknown>;

  // Canonicalize common ids into snake_case so UI can be simple.
  const orderId = getString(meta, "order_id", "orderId");
  if (orderId) meta.order_id = orderId;

  const withdrawalId = getString(meta, "withdrawal_id", "withdrawalId");
  if (withdrawalId) meta.withdrawal_id = withdrawalId;

  const txHash = getString(meta, "tx_hash", "txHash");
  if (txHash) meta.tx_hash = txHash;

  if (!getString(meta, "severity")) meta.severity = getSeverityForType(type);

  const href = getString(meta, "href") ?? deriveHref(type, meta);
  if (href && href.startsWith("/")) meta.href = href;

  return meta;
}

type NotificationSchedule = {
  quiet_enabled: boolean;
  quiet_start_min: number;
  quiet_end_min: number;
  tz_offset_min: number;
  digest_enabled: boolean;
} | null;

function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(String(v ?? ""));
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  return Math.max(lo, Math.min(hi, i));
}

function isInQuietHours(schedule: NotificationSchedule, nowUtc = new Date()): boolean {
  if (!schedule?.quiet_enabled) return false;

  const offsetMin = clampInt(schedule.tz_offset_min, -840, 840, 0);
  const localMs = nowUtc.getTime() + offsetMin * 60_000;
  const local = new Date(localMs);
  const localMin = local.getUTCHours() * 60 + local.getUTCMinutes();

  const start = clampInt(schedule.quiet_start_min, 0, 1439, 1320);
  const end = clampInt(schedule.quiet_end_min, 0, 1439, 480);

  if (start === end) return true; // interpret as "always quiet"
  if (start < end) return localMin >= start && localMin < end;
  return localMin >= start || localMin < end; // wraps midnight
}

async function getSchedule(sql: Sql, userId: string): Promise<NotificationSchedule> {
  try {
    const rows = await sql<
      Array<{
        quiet_enabled: boolean;
        quiet_start_min: number;
        quiet_end_min: number;
        tz_offset_min: number;
        digest_enabled: boolean;
      }>
    >`
      SELECT quiet_enabled, quiet_start_min, quiet_end_min, tz_offset_min, digest_enabled
      FROM app_notification_schedule
      WHERE user_id = ${userId}::uuid
      LIMIT 1
    `;
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function createNotification(
  sql: Sql,
  params: {
    userId: string;
    type: NotificationType;
    title: string;
    body?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<string> {
  try {
    const prefRows = await sql<{ enabled: boolean }[]>`
      SELECT enabled
      FROM app_notification_preference
      WHERE user_id = ${params.userId}::uuid
        AND type = ${params.type}
      LIMIT 1
    `;
    if (prefRows.length > 0 && prefRows[0]!.enabled === false) return "";
  } catch {
    // Preference checks must never break core flows.
  }

  const title = String(params.title ?? "").trim() || "Notification";
  const body = String(params.body ?? "");
  const metadata = applyNotificationPolicy(params.type, params.metadata);

  // Quiet hours (best-effort): defer non-system notifications into a queue.
  // Digest flushing is handled by a cron endpoint.
  if (params.type !== "system") {
    const schedule = await getSchedule(sql, params.userId);
    if (schedule?.digest_enabled && isInQuietHours(schedule)) {
      try {
        const rows = await sql<{ id: string }[]>`
          INSERT INTO ex_notification_deferred (user_id, type, title, body, metadata_json)
          VALUES (${params.userId}::uuid, ${params.type}, ${title}, ${body}, ${metadata as any}::jsonb)
          RETURNING id::text AS id
        `;
        return rows[0]?.id ?? "";
      } catch {
        // If deferral fails, fall through to immediate notification.
      }
    }
  }

  const rows = await sql<{ id: string; created_at: string }[]>`
    INSERT INTO ex_notification (user_id, type, title, body, metadata_json)
    VALUES (
      ${params.userId}::uuid,
      ${params.type},
      ${title},
      ${body},
      ${metadata as any}::jsonb
    )
    RETURNING id::text AS id, created_at::text AS created_at
  `;

  const row = rows[0]!;

  // Realtime push (SSE/WebSocket listeners): fires on COMMIT if inside a transaction.
  // Keep payload small (Postgres NOTIFY is ~8KB).
  try {
    const payload = JSON.stringify({
      id: row.id,
      user_id: params.userId,
      type: params.type,
      title,
      body,
      metadata_json: metadata,
      created_at: row.created_at,
    });
    await sql`SELECT pg_notify('ex_notification', ${payload})`;
  } catch {
    // ignore realtime failures
  }

  return row.id;
}

export async function listNotifications(
  sql: Sql,
  params: { userId: string; limit?: number; unreadOnly?: boolean },
): Promise<
  Array<{
    id: string;
    type: string;
    title: string;
    body: string;
    metadata_json: unknown;
    read: boolean;
    created_at: string;
  }>
> {
  const limit = Math.max(1, Math.min(200, params.limit ?? 50));
  return await sql`
    SELECT id, type, title, body, metadata_json, read, created_at
    FROM ex_notification
    WHERE user_id = ${params.userId}::uuid
      ${params.unreadOnly ? sql`AND read = false` : sql``}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}

export async function countUnread(sql: Sql, userId: string): Promise<number> {
  const rows = await sql<{ count: string }[]>`
    SELECT count(*)::text AS count
    FROM ex_notification
    WHERE user_id = ${userId}::uuid AND read = false
  `;
  return Number(rows[0]?.count ?? "0");
}

export async function markRead(sql: Sql, params: { userId: string; ids: string[] }): Promise<number> {
  if (params.ids.length === 0) return 0;
  const result = await sql`
    UPDATE ex_notification
    SET read = true
    WHERE user_id = ${params.userId}::uuid
      AND id = ANY(${params.ids}::uuid[])
      AND read = false
  `;
  return result.count;
}

export async function markAllRead(sql: Sql, userId: string): Promise<number> {
  const result = await sql`
    UPDATE ex_notification
    SET read = true
    WHERE user_id = ${userId}::uuid AND read = false
  `;
  return result.count;
}
