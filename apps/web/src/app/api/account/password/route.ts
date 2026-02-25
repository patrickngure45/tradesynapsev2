import { z } from "zod";
import { getSql } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { requireSessionUserId } from "@/lib/auth/sessionGuard";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { enforceTotpIfEnabled } from "@/lib/auth/requireTotp";
import { sendMail } from "@/lib/email/transport";
import { securityAlertEmail } from "@/lib/email/templates";
import { writeAuditLog, auditContextFromRequest } from "@/lib/auditLog";
import { enforceAccountSecurityRateLimit } from "@/lib/auth/securityRateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
  totp_code: z.string().length(6).regex(/^\d{6}$/).optional(),
});

/**
 * POST /api/account/password — change password for the authenticated user
 */
export async function POST(request: Request) {
  const sql = getSql();
  const authed = await requireSessionUserId(sql as any, request);
  if (!authed.ok) return authed.response;
  const actingUserId = authed.userId;

  const rl = await enforceAccountSecurityRateLimit({
    sql: sql as any,
    request,
    limiterName: "account.password.change",
    windowMs: 60_000,
    max: 8,
    userId: actingUserId,
  });
  if (rl) return rl;

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError("invalid_input");

  const { currentPassword, newPassword } = parsed.data;

  try {
    // ── TOTP enforcement (if user has 2FA enabled) ────────────────
    const totpResp = await enforceTotpIfEnabled(sql, actingUserId, parsed.data.totp_code);
    if (totpResp) return totpResp;

    const activeErr = await retryOnceOnTransientDbError(() => requireActiveUser(sql, actingUserId));
    if (activeErr) return apiError(activeErr);

    const rows = await sql<{ password_hash: string | null }[]>`
      SELECT password_hash FROM app_user WHERE id = ${actingUserId} LIMIT 1
    `;
    if (rows.length === 0) return apiError("user_not_found");

    const storedHash = rows[0]!.password_hash;
    if (!storedHash) return apiError("password_not_set");

    const valid = await verifyPassword(currentPassword, storedHash);
    if (!valid) return apiError("invalid_current_password", { status: 403 });

    const newHash = await hashPassword(newPassword);
    await sql`
      UPDATE app_user
      SET password_hash = ${newHash}, session_version = coalesce(session_version, 0) + 1, updated_at = now()
      WHERE id = ${actingUserId}::uuid
    `;

    // Audit log (best-effort)
    try {
      await writeAuditLog(sql, {
        actorId: actingUserId,
        actorType: "user",
        action: "account.password.changed",
        resourceType: "user",
        resourceId: actingUserId,
        ...auditContextFromRequest(request),
      });
    } catch (auditErr) {
      console.error("[password] Failed to write audit log:", auditErr instanceof Error ? auditErr.message : auditErr);
    }

    // Send security alert email (best-effort)
    try {
      const userRows = await sql<{ email: string | null }[]>`SELECT email FROM app_user WHERE id = ${actingUserId} LIMIT 1`;
      const email = userRows[0]?.email;
      if (email) {
        const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown";
        const tpl = securityAlertEmail("Password changed", ip, new Date().toISOString());
        await sendMail({ to: email, subject: tpl.subject, text: tpl.text, html: tpl.html });
      }
    } catch (emailErr) {
      console.error("[password] Failed to send security alert email:", emailErr instanceof Error ? emailErr.message : emailErr);
    }

    return Response.json({ ok: true });
  } catch (e) {
    const resp = responseForDbError("account.password", e);
    if (resp) return resp;
    throw e;
  }
}
