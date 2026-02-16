import { z } from "zod";
import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionToken, serializeSessionCookie } from "@/lib/auth/session";
import { verifyTOTP } from "@/lib/auth/totp";
import { writeAuditLog, auditContextFromRequest } from "@/lib/auditLog";
import { logRouteResponse } from "@/lib/routeLog";

export const runtime = "nodejs";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totp_code: z.string().optional(),
  backup_code: z.string().optional(),
});

function normalizeBackupCode(raw: string | null | undefined): string {
  const cleaned = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length !== 8) return "";
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
}

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
    SELECT id, password_hash, status, display_name, email, totp_enabled, totp_secret, totp_backup_codes
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

  // 2FA gate for accounts with TOTP enabled
  if (user.totp_enabled && user.totp_secret) {
    const totpCode = String(input.totp_code ?? "").trim();
    const backupCode = normalizeBackupCode(input.backup_code);

    let passed2fa = false;
    let usedBackupCode = false;

    if (/^\d{6}$/.test(totpCode) && verifyTOTP(String(user.totp_secret), totpCode)) {
      passed2fa = true;
    }

    if (!passed2fa && backupCode) {
      const consumed = await sql.begin(async (tx) => {
        const txSql = tx as unknown as typeof sql;
        const consumeRows = await txSql<{ id: string }[]>`
          UPDATE app_user
          SET totp_backup_codes = array_remove(totp_backup_codes, ${backupCode})
          WHERE id = ${user.id}::uuid
            AND totp_backup_codes IS NOT NULL
            AND ${backupCode} = ANY(totp_backup_codes)
          RETURNING id
        `;
        return consumeRows.length > 0;
      });

      if (consumed) {
        passed2fa = true;
        usedBackupCode = true;
      }
    }

    if (!passed2fa) {
      try {
        await writeAuditLog(sql, {
          actorId: user.id as string,
          actorType: "user",
          action: "auth.login.failed",
          resourceType: "user",
          resourceId: user.id as string,
          ...auditContextFromRequest(request),
          detail: {
            reason: totpCode || backupCode ? "invalid_2fa" : "totp_required",
          },
        });
      } catch (auditErr) {
        console.error("[login] Failed to write audit log:", auditErr instanceof Error ? auditErr.message : auditErr);
      }

      return NextResponse.json(
        {
          error: totpCode || backupCode ? "invalid_totp_code" : "totp_required",
          totp_required: true,
        },
        { status: 401 },
      );
    }

    if (usedBackupCode) {
      try {
        await writeAuditLog(sql, {
          actorId: user.id as string,
          actorType: "user",
          action: "auth.totp.backup_code.used",
          resourceType: "user",
          resourceId: user.id as string,
          ...auditContextFromRequest(request),
        });
      } catch (auditErr) {
        console.error("[login] Failed to write audit log:", auditErr instanceof Error ? auditErr.message : auditErr);
      }
    }
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
      detail: {
        totp_enabled: Boolean(user.totp_enabled),
      },
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
