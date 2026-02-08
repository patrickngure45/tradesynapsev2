/**
 * Append-only audit log writer.
 *
 * All security-sensitive operations (auth, withdrawals, admin actions,
 * order lifecycle) should call `writeAuditLog` to create a tamper-evident
 * record in the `audit_log` table.
 *
 * The table has triggers that prevent UPDATE and DELETE, so records are
 * truly immutable once written.
 */

import type postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

export type AuditEntry = {
  /** Who performed the action (null for system). */
  actorId?: string | null;
  /** 'user' | 'admin' | 'system' | 'outbox' */
  actorType?: string;
  /** Dot-delimited action name, e.g. 'auth.session.created'. */
  action: string;
  /** Resource category, e.g. 'withdrawal', 'order'. */
  resourceType?: string | null;
  /** Primary key of the target resource. */
  resourceId?: string | null;
  /** Client IP address. */
  ip?: string | null;
  /** User-Agent header. */
  userAgent?: string | null;
  /** Request correlation ID. */
  requestId?: string | null;
  /** Arbitrary structured payload. */
  detail?: Record<string, unknown>;
};

/**
 * Insert one audit log row.
 *
 * This is designed to be called within an existing transaction so the
 * audit record is committed atomically with the business operation.
 * It can also be called outside a transaction for fire-and-forget logging.
 */
export async function writeAuditLog(sql: Sql, entry: AuditEntry): Promise<void> {
  await sql`
    INSERT INTO audit_log (
      actor_id,
      actor_type,
      action,
      resource_type,
      resource_id,
      ip,
      user_agent,
      request_id,
      detail
    ) VALUES (
      ${entry.actorId ?? null},
      ${entry.actorType ?? "user"},
      ${entry.action},
      ${entry.resourceType ?? null},
      ${entry.resourceId ?? null},
      ${entry.ip ?? null},
      ${entry.userAgent ?? null},
      ${entry.requestId ?? null},
      ${JSON.stringify(entry.detail ?? {})}::jsonb
    )
  `;
}

/**
 * Extract standard audit context from a Request object.
 */
export function auditContextFromRequest(request: Request): {
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
} {
  return {
    ip:
      request.headers.get("x-real-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null,
    userAgent: request.headers.get("user-agent"),
    requestId: request.headers.get("x-request-id"),
  };
}
