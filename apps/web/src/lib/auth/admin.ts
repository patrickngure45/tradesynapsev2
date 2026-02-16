import type { Sql } from "postgres";
import { getActingUserId } from "@/lib/auth/party";
import { apiError } from "@/lib/api/errors";
import { getSessionTokenFromRequest, serializeClearSessionCookie } from "@/lib/auth/session";

export type AdminCheckResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

export type AdminApiCheckResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response };

/**
 * Require the request to come from a signed-in user with `role = 'admin'`.
 *
 * Returns the admin user ID on success (useful for audit trails).
 * In dev mode without ENFORCE_AUTH, falls back to the header identity
 * but still checks the DB role column.
 */
export async function requireAdmin(
  sql: Sql,
  request: Request,
): Promise<AdminCheckResult> {
  const userId = getActingUserId(request);
  if (!userId) return { ok: false, error: "auth_required" };

  const rows = await sql<{ role: string }[]>`
    SELECT role FROM app_user WHERE id = ${userId}::uuid LIMIT 1
  `;

  if (rows.length === 0) return { ok: false, error: "user_not_found" };
  if (rows[0]!.role !== "admin") return { ok: false, error: "admin_required" };

  return { ok: true, userId };
}

/**
 * Wrapper for API route handlers.
 *
 * If the request has a session cookie that verifies but its uid no longer exists
 * (common after user cleanup), we clear the cookie and return `auth_required`
 * so the UI can re-login cleanly.
 */
export async function requireAdminForApi(
  sql: Sql,
  request: Request,
): Promise<AdminApiCheckResult> {
  const sessionToken = getSessionTokenFromRequest(request);
  const secure = process.env.NODE_ENV === "production";

  const admin = await requireAdmin(sql, request);
  if (admin.ok) return admin;

  if (admin.error === "user_not_found" || admin.error === "auth_required") {
    const headers: HeadersInit | undefined = sessionToken
      ? { "set-cookie": serializeClearSessionCookie({ secure }) }
      : undefined;
    return { ok: false, response: apiError("auth_required", { headers }) };
  }

  return { ok: false, response: apiError(admin.error) };
}
