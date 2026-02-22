import { z } from "zod";
import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createSessionToken, serializeSessionCookie } from "@/lib/auth/session";
import { createVerificationToken } from "@/lib/auth/emailVerification";
import { sendMail } from "@/lib/email/transport";
import { verificationEmail } from "@/lib/email/templates";
import { logRouteResponse } from "@/lib/routeLog";

export const runtime = "nodejs";

const signupSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  displayName: z.string().min(2).max(60).optional(),
  // ISO-3166 alpha-2 preferred. Use 'ZZ' for unknown.
  country: z.string().trim().min(2).max(2),
  acceptTerms: z.literal(true),
  acceptRisk: z.literal(true),
});

/**
 * POST /api/auth/signup
 * Creates a new user with email + password, returns a session cookie.
 */
export async function POST(request: Request) {
  const startMs = Date.now();
  const body = await request.json().catch(() => ({}));

  let input: z.infer<typeof signupSchema>;
  try {
    input = signupSchema.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid input. Email required, password min 8 chars." }, { status: 400 });
  }

  const sql = getSql();
  const emailLower = input.email.toLowerCase().trim();

  // Check if email already taken
  const existing = await sql`
    SELECT id FROM app_user WHERE email = ${emailLower} LIMIT 1
  `;
  if (existing.length > 0) {
    return NextResponse.json({ error: "email_taken" }, { status: 409 });
  }

  const passwordHash = await hashPassword(input.password);
  const country = input.country.toUpperCase();

  const [user] = await sql`
    INSERT INTO app_user (email, password_hash, display_name, status, kyc_level, country)
    VALUES (${emailLower}, ${passwordHash}, ${input.displayName ?? null}, 'active', 'none', ${country})
    RETURNING id, email, display_name, status, created_at
  `;

  const secret = process.env.PROOFPACK_SESSION_SECRET ?? "";
  if (!secret) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // Auto-create email verification token so user can verify from day-one
  let verifyToken: string | null = null;
  let mailDemo = true;
  try {
    verifyToken = await createVerificationToken(sql, user!.id as string);
    if (verifyToken) {
      const baseUrl = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3010";
      const verifyUrl = `${baseUrl}/verify-email?token=${verifyToken}`;
      const tpl = verificationEmail(verifyUrl);
      const mailResult = await sendMail({ to: emailLower, subject: tpl.subject, text: tpl.text, html: tpl.html });
      mailDemo = mailResult.demo;
    }
  } catch (emailErr) {
    // non-fatal — user can resend later from account page
    console.error("[signup] Failed to send verification email:", emailErr instanceof Error ? emailErr.message : emailErr);
  }

  const ttl = 60 * 60 * 24 * 7; // 7 days
  const token = createSessionToken({ userId: user!.id as string, secret, ttlSeconds: ttl, sessionVersion: 0 });
  const secure = process.env.NODE_ENV === "production";

  const response = new NextResponse(
    JSON.stringify({
      ok: true,
      user: {
        id: user!.id,
        email: user!.email,
        displayName: user!.display_name,
      },
      // Only expose verifyUrl in dev demo mode — never in production
      verifyUrl: !secure && mailDemo && verifyToken ? `/verify-email?token=${verifyToken}` : null,
    }),
    {
      status: 201,
      headers: {
        "content-type": "application/json",
        "set-cookie": serializeSessionCookie({ token, maxAgeSeconds: ttl, secure }),
      },
    },
  );
  logRouteResponse(request, response, { startMs, userId: user!.id as string });
  return response;
}
