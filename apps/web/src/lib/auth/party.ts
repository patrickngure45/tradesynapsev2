import { getSessionTokenFromRequest, verifySessionToken } from "@/lib/auth/session";

const isProd = process.env.NODE_ENV === "production";
const enforceAuth = isProd || process.env.ENFORCE_AUTH === "1";

/**
 * Resolve the acting user identity from the request.
 *
 * In production (or when ENFORCE_AUTH=1), **only** the signed session cookie is trusted.
 * In development, the `x-user-id` header is also accepted
 * (convenience for scripts/smoke tests).
 */
export function getActingUserId(request: Request): string | null {
  // 1. Try signed session cookie first (always trusted).
  const secret = process.env.PROOFPACK_SESSION_SECRET ?? "";
  if (secret) {
    const token = getSessionTokenFromRequest(request);
    if (token) {
      const verified = verifySessionToken({ token, secret });
      if (verified.ok) return verified.payload.uid;
    }
  }

  // 2. In dev only (without ENFORCE_AUTH), fall back to the x-user-id header.
  if (!enforceAuth) {
    const header = request.headers.get("x-user-id");
    if (header) return header;
  }

  return null;
}

export function requireActingUserIdInProd(actingUserId: string | null): string | null {
  if (enforceAuth && !actingUserId) {
    return "missing_x_user_id";
  }
  return null;
}

export function isParty(actingUserId: string | null, trade: { buyer_user_id: string; seller_user_id: string }): boolean {
  if (!actingUserId) return false;
  return actingUserId === trade.buyer_user_id || actingUserId === trade.seller_user_id;
}
