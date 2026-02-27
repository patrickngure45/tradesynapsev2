import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { verifyTOTP } from "@/lib/auth/totp";
import { apiError } from "@/lib/api/errors";
import { enforceAccountSecurityRateLimit } from "@/lib/auth/securityRateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/account/totp/verify
 * Verify a TOTP code without changing state.
 * Used as a gate before sensitive operations (withdrawals, password change).
 * Body: { code: string }
 * Returns: { valid: boolean }
 */
export async function POST(request: Request) {
  const sql = getSql();
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr || !actingUserId) {
    return apiError(authErr ?? "unauthorized", { status: 401 });
  }

  const rl = await enforceAccountSecurityRateLimit({
    sql: sql as any,
    request,
    limiterName: "account.totp.verify",
    windowMs: 60_000,
    max: 20,
    userId: actingUserId,
  });
  if (rl) return rl;

  let body: { code?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_input");
  }

  const code = String(body.code ?? "").trim();
  if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
    return apiError("invalid_input", { details: { message: "Invalid 2FA code format" } });
  }

  const rows = await sql`
    SELECT totp_secret, totp_enabled FROM app_user WHERE id = ${actingUserId}
  `;
  if (rows.length === 0) {
    return apiError("user_not_found", { status: 404 });
  }
  if (!rows[0]!.totp_enabled || !rows[0]!.totp_secret) {
    // 2FA not enabled, treat as valid (no 2FA gate)
    return Response.json({ valid: true, totp_required: false });
  }

  const valid = verifyTOTP(rows[0]!.totp_secret, code);
  return Response.json({ valid, totp_required: true });
}
