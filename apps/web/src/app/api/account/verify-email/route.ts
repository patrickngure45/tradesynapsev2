import { z } from "zod";
import { getSql } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { createVerificationToken, consumeVerificationToken } from "@/lib/auth/emailVerification";
import { createNotification } from "@/lib/notifications";
import { responseForDbError } from "@/lib/dbTransient";
import { sendMail } from "@/lib/email/transport";
import { verificationEmail } from "@/lib/email/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const verifySchema = z.object({ token: z.string().min(1) });
const resendSchema = z.object({ action: z.literal("resend") });

/**
 * POST /api/account/verify-email
 *
 * Two modes:
 *  1. { token: "..." }    — consume a verification token
 *  2. { action: "resend" } — generate a new verification token and send via email (falls back to console + in-response URL in demo mode)
 */
export async function POST(request: Request) {
  const sql = getSql();
  const body = await request.json().catch(() => ({}));

  // ── Mode 1: Consume token ──
  const tokenParsed = verifySchema.safeParse(body);
  if (tokenParsed.success) {
    try {
      const result = await consumeVerificationToken(sql, tokenParsed.data.token);
      if (!result) {
        return apiError("invalid_or_expired_token", { status: 400 });
      }

      await createNotification(sql, {
        userId: result.userId,
        type: "system",
        title: "Email Verified",
        body: "Your email address has been verified. You now have Basic KYC access.",
      });

      // Auto-upgrade KYC from none → basic on email verification
      await sql`
        UPDATE app_user
        SET kyc_level = CASE WHEN kyc_level = 'none' THEN 'basic' ELSE kyc_level END,
            updated_at = now()
        WHERE id = ${result.userId}::uuid
      `;

      return Response.json({ ok: true, verified: true });
    } catch (e) {
      const resp = responseForDbError("account.verify-email.consume", e);
      if (resp) return resp;
      throw e;
    }
  }

  // ── Mode 2: Resend token ──
  const resendParsed = resendSchema.safeParse(body);
  if (resendParsed.success) {
    const actingUserId = getActingUserId(request);
    const authErr = requireActingUserIdInProd(actingUserId);
    if (authErr) return apiError(authErr);
    if (!actingUserId) return apiError("unauthorized", { status: 401 });

    try {
      // Check if already verified
      const rows = await sql<{ email_verified: boolean; email: string | null }[]>`
        SELECT email_verified, email FROM app_user WHERE id = ${actingUserId} LIMIT 1
      `;
      if (rows.length === 0) return apiError("user_not_found");
      if (rows[0]!.email_verified) return apiError("already_verified", { status: 409 });

      const token = await createVerificationToken(sql, actingUserId);

      const baseUrl = request.headers.get("origin") ?? "http://localhost:3010";
      const verifyUrl = `${baseUrl}/verify-email?token=${token}`;

      // Send verification email (falls back to console in demo mode)
      const email = rows[0]!.email;
      const tpl = verificationEmail(verifyUrl);
      let mailResult: { sent: boolean; demo: boolean };
      try {
        mailResult = await sendMail({ to: email!, subject: tpl.subject, text: tpl.text, html: tpl.html });
      } catch (mailErr) {
        console.error("[verify-email] Failed to send verification email:", mailErr instanceof Error ? mailErr.message : mailErr);
        return apiError("upstream_unavailable", { details: "Email delivery failed. Please try again later." });
      }

      const isProd = process.env.NODE_ENV === "production";
      return Response.json({
        ok: true,
        message: mailResult.sent ? "Verification email sent" : "Verification email sent (demo: link below)",
        // Only expose verify_url in dev demo mode — never in production
        ...(!isProd && mailResult.demo ? { verify_url: verifyUrl } : {}),
        email,
      });
    } catch (e) {
      const resp = responseForDbError("account.verify-email.resend", e);
      if (resp) return resp;
      throw e;
    }
  }

  return apiError("invalid_input");
}
