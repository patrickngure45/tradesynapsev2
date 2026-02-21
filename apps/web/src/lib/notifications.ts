import type { Sql } from "postgres";

export type NotificationSeverity = "info" | "success" | "warning" | "danger";

export type NotificationType =
  | "order_filled"
  | "order_partially_filled"
  | "order_canceled"
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
  const title = String(params.title ?? "").trim() || "Notification";
  const body = String(params.body ?? "");
  const metadata = applyNotificationPolicy(params.type, params.metadata);

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
