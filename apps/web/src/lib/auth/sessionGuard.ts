import type { Sql } from "postgres";

import { apiError } from "@/lib/api/errors";
import { getSessionTokenFromRequest, verifySessionToken } from "@/lib/auth/session";

export async function requireSessionUserId(
  sql: Sql,
  request: Request,
): Promise<{ ok: true; userId: string } | { ok: false; response: Response }> {
  const secret = String(process.env.PROOFPACK_SESSION_SECRET ?? "").trim();
  if (!secret) return { ok: false, response: apiError("session_secret_not_configured") };

  const token = getSessionTokenFromRequest(request);
  if (!token) return { ok: false, response: apiError("unauthorized", { status: 401 }) };

  const verified = verifySessionToken({ token, secret });
  if (!verified.ok) return { ok: false, response: apiError("unauthorized", { status: 401 }) };

  const userId = verified.payload.uid;
  const tokenSv = Math.max(0, Math.trunc(Number(verified.payload.sv ?? 0) || 0));

  try {
    const rows = await sql<Array<{ session_version: number }>>`
      SELECT session_version
      FROM app_user
      WHERE id = ${userId}::uuid
      LIMIT 1
    `;
    if (!rows[0]) return { ok: false, response: apiError("unauthorized", { status: 401 }) };
    const dbSv = Math.max(0, Math.trunc(Number(rows[0].session_version ?? 0) || 0));
    if (dbSv !== tokenSv) {
      return { ok: false, response: apiError("session_revoked", { status: 401 }) };
    }
  } catch {
    return { ok: false, response: apiError("unauthorized", { status: 401 }) };
  }

  return { ok: true, userId };
}
