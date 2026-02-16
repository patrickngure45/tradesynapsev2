import type { Sql } from "postgres";

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
  | "p2p_payment_confirmed"
  | "p2p_order_completed"
  | "p2p_order_cancelled"
  | "p2p_dispute_opened"
  | "p2p_dispute_resolved"
  | "p2p_feedback_received"
  | "system";

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
  const rows = await sql<{ id: string }[]>`
    INSERT INTO ex_notification (user_id, type, title, body, metadata_json)
    VALUES (
      ${params.userId}::uuid,
      ${params.type},
      ${params.title},
      ${params.body ?? ""},
      ${(params.metadata ?? {}) as any}::jsonb
    )
    RETURNING id
  `;
  return rows[0]!.id;
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
