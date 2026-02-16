import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { verifyTOTP, generateBackupCodes } from "@/lib/auth/totp";
import { writeAuditLog, auditContextFromRequest } from "@/lib/auditLog";
import { sendMail } from "@/lib/email/transport";
import { securityAlertEmail } from "@/lib/email/templates";
import { apiError } from "@/lib/api/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/account/totp/enable
 * Verify a TOTP code and enable 2FA for this account.
 * Body: { code: string }
 */
export async function POST(request: Request) {
  const sql = getSql();
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr || !actingUserId) {
    return apiError(authErr ?? "unauthorized", { status: 401 });
  }

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
  if (rows[0]!.totp_enabled) {
    return apiError("totp_already_enabled", { status: 409 });
  }
  if (!rows[0]!.totp_secret) {
    return apiError("totp_not_set_up");
  }

  // Verify the code
  if (!verifyTOTP(rows[0]!.totp_secret, code)) {
    return apiError("invalid_totp_code", { status: 403 });
  }

  // Generate backup codes
  const backupCodes = generateBackupCodes();

  // Enable 2FA
  await sql.begin(async (tx) => {
    const txSql = tx as unknown as typeof sql;
    await txSql`
      UPDATE app_user
      SET totp_enabled = true, totp_backup_codes = ${backupCodes}
      WHERE id = ${actingUserId}
    `;
    await writeAuditLog(txSql, {
      actorId: actingUserId,
      actorType: "user",
      action: "auth.totp.enabled",
      resourceType: "user",
      resourceId: actingUserId,
      ...auditContextFromRequest(request),
    });
  });

  // Security alert email (best-effort)
  try {
    const userRows = await sql<{ email: string | null }[]>`SELECT email FROM app_user WHERE id = ${actingUserId} LIMIT 1`;
    const email = userRows[0]?.email;
    if (email) {
      const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown";
      const tpl = securityAlertEmail("Two-factor authentication enabled", ip, new Date().toISOString());
      await sendMail({ to: email, subject: tpl.subject, text: tpl.text, html: tpl.html });
    }
  } catch (emailErr) {
    console.error("[totp/enable] Failed to send security alert email:", emailErr instanceof Error ? emailErr.message : emailErr);
  }

  return Response.json({ ok: true, backup_codes: backupCodes });
}
