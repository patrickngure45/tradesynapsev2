import type { Sql } from "postgres";

import { apiError } from "@/lib/api/errors";
import { getSessionTokenFromRequest, verifySessionToken } from "@/lib/auth/session";

const isProd = process.env.NODE_ENV === "production";
const enforceAuth = isProd || process.env.ENFORCE_AUTH === "1";

function looksLikeUuid(v: string): boolean {
  // Good-enough validation for internal/dev header usage.
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v);
}

export async function requireSessionUserId(
  sql: Sql,
  request: Request,
): Promise<{ ok: true; userId: string } | { ok: false; response: Response }> {
  const secret = String(process.env.PROOFPACK_SESSION_SECRET ?? "").trim();

  // 1) Prefer signed session cookie when present (enforces session_version).
  if (secret) {
    const token = getSessionTokenFromRequest(request);
    if (token) {
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
  } else if (enforceAuth) {
    // In production, refuse to operate without a session secret.
    return { ok: false, response: apiError("session_secret_not_configured") };
  }

  // 2) Internal service-to-service calls (trusted when token matches).
  const internalSecret = String(process.env.INTERNAL_SERVICE_SECRET ?? "").trim();
  if (internalSecret) {
    const headerSecret = String(request.headers.get("x-internal-service-token") ?? "").trim();
    if (headerSecret && headerSecret === internalSecret) {
      const uid = String(request.headers.get("x-user-id") ?? "").trim();
      if (uid && looksLikeUuid(uid)) return { ok: true, userId: uid };
    }
  }

  // 3) Dev-only fallback (when auth isn't enforced): accept x-user-id.
  if (!enforceAuth) {
    const uid = String(request.headers.get("x-user-id") ?? "").trim();
    if (uid && looksLikeUuid(uid)) return { ok: true, userId: uid };
  }

  return { ok: false, response: apiError("unauthorized", { status: 401 }) };
}
