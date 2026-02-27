import { randomBytes } from "node:crypto";
import type { Sql } from "postgres";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Create a verification token for a user.
 * Returns the raw token string (to embed in a link).
 */
export async function createVerificationToken(
  sql: Sql,
  userId: string,
): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await sql`
    INSERT INTO email_verification_token (user_id, token, expires_at)
    VALUES (${userId}::uuid, ${token}, ${expiresAt.toISOString()}::timestamptz)
  `;

  return token;
}

/**
 * Verify a token:
 *  - Must exist, not be expired, and not already used.
 *  - Marks the token as used and sets email_verified = true on the user.
 *
 * Returns the user_id on success, null on failure.
 */
export async function consumeVerificationToken(
  sql: Sql,
  token: string,
): Promise<{ userId: string } | null> {
  const rows = await sql<{ id: string; user_id: string; expires_at: string; used_at: string | null }[]>`
    SELECT id, user_id::text AS user_id, expires_at, used_at
    FROM email_verification_token
    WHERE token = ${token}
    LIMIT 1
  `;

  if (rows.length === 0) return null;

  const row = rows[0]!;
  if (row.used_at) return null; // already consumed
  if (new Date(row.expires_at).getTime() < Date.now()) return null; // expired

  await sql`
    UPDATE email_verification_token
    SET used_at = now()
    WHERE id = ${row.id}::uuid
  `;

  await sql`
    UPDATE app_user
    SET email_verified = true, updated_at = now()
    WHERE id = ${row.user_id}::uuid
  `;

  return { userId: row.user_id };
}
