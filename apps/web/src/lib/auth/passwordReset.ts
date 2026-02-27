import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Sql } from "postgres";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function getPepper(): string {
  return String(process.env.PROOFPACK_SESSION_SECRET ?? process.env.SECRET_KEY ?? "");
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function hashResetToken(rawToken: string): string {
  // Hash token with a server-side pepper so DB leaks do not expose usable reset links.
  return sha256Hex(`${rawToken}.${getPepper()}`);
}

export async function createPasswordResetToken(
  sql: Sql,
  opts: { userId: string; requestIp?: string | null },
): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  const tokenHash = hashResetToken(raw);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  const requestIp = opts.requestIp ? String(opts.requestIp).slice(0, 200) : null;

  await sql`
    INSERT INTO app_password_reset_token (user_id, token_hash, expires_at, request_ip)
    VALUES (${opts.userId}::uuid, ${tokenHash}, ${expiresAt.toISOString()}::timestamptz, ${requestIp})
  `;

  return raw;
}

export async function consumePasswordResetToken(
  sql: Sql,
  rawToken: string,
): Promise<{ userId: string } | null> {
  const candidateHash = hashResetToken(rawToken);
  const rows = await sql<
    Array<{ id: string; user_id: string; token_hash: string; expires_at: string; used_at: string | null }>
  >`
    SELECT id, user_id::text AS user_id, token_hash, expires_at, used_at
    FROM app_password_reset_token
    WHERE token_hash = ${candidateHash}
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) return null;
  if (row.used_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;

  // Defensive: ensure DB token_hash matches computed hash.
  try {
    const a = Buffer.from(String(row.token_hash), "utf8");
    const b = Buffer.from(String(candidateHash), "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  await sql`
    UPDATE app_password_reset_token
    SET used_at = now()
    WHERE id = ${row.id}::uuid
  `;

  return { userId: row.user_id };
}
