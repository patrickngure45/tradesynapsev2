import { z } from "zod";
import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionToken, serializeSessionCookie } from "@/lib/auth/session";
import { writeAuditLog, auditContextFromRequest } from "@/lib/auditLog";
import { logRouteResponse } from "@/lib/routeLog";

export const runtime = "nodejs";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * POST /api/auth/login
 * Authenticates with email + password, returns a session cookie.
 */
export async function POST(request: Request) {
  const startMs = Date.now();
  const body = await request.json().catch(() => ({}));

  let input: z.infer<typeof loginSchema>;
  try {
    input = loginSchema.parse(body);
  } catch {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  const sql = getSql();
  const emailLower = input.email.toLowerCase().trim();

  const rows = await sql`
    SELECT id, password_hash, status, display_name, email
    FROM app_user
    WHERE email = ${emailLower}
    LIMIT 1
  `;

  if (rows.length === 0) {
    // Audit failed login (unknown email)
    try {
      await writeAuditLog(sql, {
        actorId: null,
        actorType: "user",
        action: "auth.login.failed",
        resourceType: "user",
        resourceId: null,
        ...auditContextFromRequest(request),
        detail: { reason: "unknown_email" },
      });
    } catch (auditErr) {
      console.error("[login] Failed to write audit log:", auditErr instanceof Error ? auditErr.message : auditErr);
    }
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const user = rows[0]!;
  if (!user.password_hash) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  if (user.status !== "active") {
    return NextResponse.json({ error: "account_not_active" }, { status: 403 });
  }

  const valid = await verifyPassword(input.password, user.password_hash as string);
  if (!valid) {
    // Audit failed login (wrong password)
    try {
      await writeAuditLog(sql, {
        actorId: user.id as string,
        actorType: "user",
        action: "auth.login.failed",
        resourceType: "user",
        resourceId: user.id as string,
        ...auditContextFromRequest(request),
        detail: { reason: "invalid_password" },
      });
    } catch (auditErr) {
      console.error("[login] Failed to write audit log:", auditErr instanceof Error ? auditErr.message : auditErr);
    }
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const secret = process.env.PROOFPACK_SESSION_SECRET ?? "";
  if (!secret) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const ttl = 60 * 60 * 24 * 7; // 7 days
  const token = createSessionToken({ userId: user.id as string, secret, ttlSeconds: ttl });
  const secure = process.env.NODE_ENV === "production";

  // Audit successful login (best-effort, before returning response)
  try {
    await writeAuditLog(sql, {
      actorId: user.id as string,
      actorType: "user",
      action: "auth.login.success",
      resourceType: "user",
      resourceId: user.id as string,
      ...auditContextFromRequest(request),
    });
  } catch (auditErr) {
    console.error("[login] Failed to write audit log:", auditErr instanceof Error ? auditErr.message : auditErr);
  }

  const response = new NextResponse(
    JSON.stringify({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
      },
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": serializeSessionCookie({ token, maxAgeSeconds: ttl, secure }),
      },
    },
  );
  logRouteResponse(request, response, { startMs, userId: user.id as string });
  return response;
}
