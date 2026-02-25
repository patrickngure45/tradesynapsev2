import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { verifyTOTP } from "@/lib/auth/totp";
import { writeAuditLog, auditContextFromRequest } from "@/lib/auditLog";
import { apiError } from "@/lib/api/errors";
import { enforceAccountSecurityRateLimit } from "@/lib/auth/securityRateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/account/totp/disable
 * Disable 2FA. Requires a valid TOTP code for confirmation.
 * Body: { code: string }
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
    limiterName: "account.totp.disable",
    windowMs: 60_000,
    max: 8,
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

  // Fetch stored secret
  const rows = await sql`
    SELECT totp_secret, totp_enabled FROM app_user WHERE id = ${actingUserId}
  `;
  if (rows.length === 0) {
    return apiError("user_not_found", { status: 404 });
  }
  if (!rows[0]!.totp_enabled) {
    return apiError("totp_not_enabled");
  }
  if (!rows[0]!.totp_secret) {
    return apiError("totp_not_set_up");
  }

  // Verify the code
  if (!verifyTOTP(rows[0]!.totp_secret, code)) {
    return apiError("invalid_totp_code", { status: 403 });
  }

  // Disable 2FA
  await sql.begin(async (tx) => {
    const txSql = tx as unknown as typeof sql;
    await txSql`
      UPDATE app_user
      SET totp_enabled = false, totp_secret = NULL, totp_backup_codes = NULL
      WHERE id = ${actingUserId}
    `;
    await writeAuditLog(txSql, {
      actorId: actingUserId,
      actorType: "user",
      action: "auth.totp.disabled",
      resourceType: "user",
      resourceId: actingUserId,
      ...auditContextFromRequest(request),
    });
  });

  return Response.json({ ok: true });
}
