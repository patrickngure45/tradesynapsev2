import type postgres from "postgres";

export type Sql = ReturnType<typeof postgres>;

export async function requireActiveUser(
  sql: Sql,
  actingUserId: string | null
): Promise<string | null> {
  if (!actingUserId) return null;

  const rows = await sql<{ status: string }[]>`
    SELECT status
    FROM app_user
    WHERE id = ${actingUserId}
    LIMIT 1
  `;

  if (rows.length === 0) return "user_not_found";
  if (rows[0]!.status !== "active") return "user_not_active";
  return null;
}
