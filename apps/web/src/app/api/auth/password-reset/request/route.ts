import { z } from "zod";
import { NextResponse } from "next/server";

import { apiError, apiZodError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { createPgRateLimiter } from "@/lib/rateLimitPg";
import { createPasswordResetToken } from "@/lib/auth/passwordReset";
import { sendMail } from "@/lib/email/transport";
import { passwordResetEmail } from "@/lib/email/templates";
import { logRouteResponse } from "@/lib/routeLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email().max(255),
});

function getIp(request: Request): string {
  const xf = request.headers.get("x-forwarded-for") ?? "";
  const ip = xf.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown";
  return ip.slice(0, 120);
}

export async function POST(request: Request) {
  const startMs = Date.now();
  const sql = getSql();

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiZodError(parsed.error) ?? apiError("invalid_input");

  const emailLower = parsed.data.email.trim().toLowerCase();
  const ip = getIp(request);

  // Rate limit by IP and by email (best-effort).
  try {
    const byIp = createPgRateLimiter(sql as any, { name: "auth.pwreset.ip", windowMs: 10 * 60_000, max: 20 });
    const byEmail = createPgRateLimiter(sql as any, { name: "auth.pwreset.email", windowMs: 60 * 60_000, max: 8 });
    const r1 = await byIp.consume(ip);
    const r2 = await byEmail.consume(emailLower);
    if (!r1.allowed || !r2.allowed) {
      const res = NextResponse.json({ ok: true });
      logRouteResponse(request, res, { startMs });
      return res;
    }
  } catch {
    // Rate limiting must never hard-fail the route.
  }

  // Never leak whether the email exists.
  let resetToken: string | null = null;
  let userId: string | null = null;
  try {
    const users = await sql<Array<{ id: string; email_verified: boolean | null }>>`
      SELECT id::text AS id, email_verified
      FROM app_user
      WHERE email = ${emailLower}
      LIMIT 1
    `;
    if (users.length > 0) {
      userId = users[0]!.id;
      resetToken = await createPasswordResetToken(sql as any, { userId, requestIp: ip });
    }
  } catch {
    // ignore
  }

  let resetUrl: string | null = null;
  let mailDemo = true;
  try {
    if (resetToken) {
      const baseUrl = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
      resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
      const tpl = passwordResetEmail(resetUrl);
      const mailResult = await sendMail({ to: emailLower, subject: tpl.subject, text: tpl.text, html: tpl.html });
      mailDemo = mailResult.demo;
    }
  } catch (e) {
    console.error("[password-reset] send failed:", e instanceof Error ? e.message : e);
  }

  const secure = process.env.NODE_ENV === "production";
  const res = NextResponse.json({
    ok: true,
    // Dev convenience only (same pattern as signup verification)
    resetUrl: !secure && mailDemo && resetUrl ? `/reset-password?token=${resetToken}` : null,
  });
  logRouteResponse(request, res, { startMs, userId: userId ?? undefined });
  return res;
}
