import { apiError } from "@/lib/api/errors";
import { requireAdminForApi } from "@/lib/auth/admin";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/exchange/admin/audit-log
 *
 * Paginated, filterable audit log viewer. Admin-key gated.
 *
 * Query params:
 *   limit  — number of rows (default 50, max 200)
 *   offset — pagination offset (default 0)
 *   action — filter by action prefix (e.g. "auth.totp")
 *   actor  — filter by actor_id
 *   resource_type — filter by resource type
 */
export async function GET(request: Request) {
  const sql = getSql();
  const admin = await requireAdminForApi(sql, request);
  if (!admin.ok) return admin.response;
  const url = new URL(request.url);

  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
  const action = url.searchParams.get("action") ?? null;
  const actorId = url.searchParams.get("actor") ?? null;
  const resourceType = url.searchParams.get("resource_type") ?? null;

  try {
    const rows = await retryOnceOnTransientDbError(async () => {
      return await (sql as any)`
        SELECT
          id, actor_id, actor_type, action, resource_type, resource_id,
          ip, user_agent, request_id, detail, created_at
        FROM audit_log
        WHERE 1 = 1
          ${action ? sql`AND action LIKE ${action + "%"}` : sql``}
          ${actorId ? sql`AND actor_id = ${actorId}` : sql``}
          ${resourceType ? sql`AND resource_type = ${resourceType}` : sql``}
        ORDER BY created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `;
    });

    // Get total count for pagination
    const countRows = await retryOnceOnTransientDbError(async () => {
      return await (sql as any)`
        SELECT count(*)::int AS total
        FROM audit_log
        WHERE 1 = 1
          ${action ? sql`AND action LIKE ${action + "%"}` : sql``}
          ${actorId ? sql`AND actor_id = ${actorId}` : sql``}
          ${resourceType ? sql`AND resource_type = ${resourceType}` : sql``}
      `;
    });

    return Response.json({
      rows,
      total: countRows[0]?.total ?? 0,
      limit,
      offset,
    });
  } catch (e) {
    const resp = responseForDbError("admin.audit-log", e);
    if (resp) return resp;
    throw e;
  }
}
