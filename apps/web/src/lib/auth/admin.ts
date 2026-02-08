import type { Sql } from "postgres";
import { getActingUserId } from "@/lib/auth/party";

export type AdminCheckResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

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
