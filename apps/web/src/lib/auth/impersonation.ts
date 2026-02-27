import type { Sql } from "postgres";

export type ReadOnlyUserScope = {
  actorUserId: string;
  userId: string;
  impersonating: boolean;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(String(value ?? "").trim());
}

/**
 * Resolve a read-only scoped user.
 *
 * Rules:
 * - Only applies to GET/HEAD requests.
 * - Candidate scope can be provided as `x-impersonate-user-id` header or `user_id` query param.
 * - Only honored when the actor is an admin (DB-verified).
 */
export async function resolveReadOnlyUserScope(
  sql: Sql,
  request: Request,
  actorUserId: string,
): Promise<{ ok: true; scope: ReadOnlyUserScope } | { ok: false; error: string }> {
  const method = (request.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return { ok: true, scope: { actorUserId, userId: actorUserId, impersonating: false } };
  }

  const headerUserId = (request.headers.get("x-impersonate-user-id") ?? "").trim();
  let queryUserId = "";
  try {
    const url = new URL(request.url);
    queryUserId = (url.searchParams.get("user_id") ?? "").trim();
  } catch {
    // ignore
  }

  const desiredUserId = headerUserId || queryUserId;
  if (!desiredUserId || desiredUserId === actorUserId) {
    return { ok: true, scope: { actorUserId, userId: actorUserId, impersonating: false } };
  }

  if (!isUuid(desiredUserId)) return { ok: false, error: "invalid_input" };

  const roleRows = await sql<{ role: string }[]>`
    SELECT role FROM app_user WHERE id = ${actorUserId}::uuid LIMIT 1
  `;
  if (roleRows.length === 0) return { ok: false, error: "user_not_found" };
  if (roleRows[0]!.role !== "admin") {
    return { ok: true, scope: { actorUserId, userId: actorUserId, impersonating: false } };
  }

  const targetRows = await sql<{ ok: boolean }[]>`
    SELECT true AS ok FROM app_user WHERE id = ${desiredUserId}::uuid LIMIT 1
  `;
  if (targetRows.length === 0) return { ok: false, error: "user_not_found" };

  return { ok: true, scope: { actorUserId, userId: desiredUserId, impersonating: true } };
}
