import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { createPgRateLimiter } from "@/lib/rateLimitPg";
import { consumePasswordResetToken } from "@/lib/auth/passwordReset";
import { hashPassword } from "@/lib/auth/password";
import { sendMail } from "@/lib/email/transport";
import { securityAlertEmail } from "@/lib/email/templates";
import { auditContextFromRequest, writeAuditLog } from "@/lib/auditLog";
import { responseForDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  token: z.string().min(16).max(2000),
  newPassword: z.string().min(8).max(128),
});

function getIp(request: Request): string {
  const xf = request.headers.get("x-forwarded-for") ?? "";
  const ip = xf.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown";
  return ip.slice(0, 120);
}

export async function POST(request: Request) {
  const sql = getSql();
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiZodError(parsed.error) ?? apiError("invalid_input");

  const ip = getIp(request);

  // Rate limit confirm attempts by IP (best-effort).
  try {
    const limiter = createPgRateLimiter(sql as any, { name: "auth.pwreset.confirm.ip", windowMs: 10 * 60_000, max: 30 });
    const r = await limiter.consume(ip);
    if (!r.allowed) return apiError("rate_limited", { status: 429 });
  } catch {
    // ignore
  }

  try {
    const consumed = await consumePasswordResetToken(sql as any, parsed.data.token.trim());
    if (!consumed) return apiError("invalid_or_expired_token", { status: 400 });

    const newHash = await hashPassword(parsed.data.newPassword);
    await sql`
      UPDATE app_user
      SET password_hash = ${newHash}, updated_at = now()
      WHERE id = ${consumed.userId}::uuid
    `;

    // Audit log (best-effort)
    try {
      const auditCtx = auditContextFromRequest(request);
      await writeAuditLog(sql as any, {
        actorId: consumed.userId,
        actorType: "user",
        action: "account.password.reset",
        resourceType: "user",
        resourceId: consumed.userId,
        ip: auditCtx.ip,
        userAgent: auditCtx.userAgent,
        requestId: auditCtx.requestId,
      });
    } catch {
      // ignore
    }

    // Security alert (best-effort)
    try {
      const rows = await sql<Array<{ email: string | null }>>`
        SELECT email FROM app_user WHERE id = ${consumed.userId}::uuid LIMIT 1
      `;
      const email = rows[0]?.email;
      if (email) {
        const tpl = securityAlertEmail("Password reset", ip, new Date().toISOString());
        await sendMail({ to: email, subject: tpl.subject, text: tpl.text, html: tpl.html });
      }
    } catch {
      // ignore
    }

    return Response.json({ ok: true });
  } catch (e) {
    return responseForDbError("auth.password_reset.confirm", e) ?? apiError("internal_error");
  }
}
