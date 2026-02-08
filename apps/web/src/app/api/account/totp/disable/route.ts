import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { verifyTOTP } from "@/lib/auth/totp";
import { writeAuditLog, auditContextFromRequest } from "@/lib/auditLog";

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
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { code?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const code = String(body.code ?? "").trim();
  if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
    return Response.json({ error: "invalid_code" }, { status: 400 });
  }

  // Fetch stored secret
  const rows = await sql`
    SELECT totp_secret, totp_enabled FROM app_user WHERE id = ${actingUserId}
  `;
  if (rows.length === 0) {
    return Response.json({ error: "user_not_found" }, { status: 404 });
  }
  if (!rows[0]!.totp_enabled) {
    return Response.json({ error: "totp_not_enabled" }, { status: 400 });
  }
  if (!rows[0]!.totp_secret) {
    return Response.json({ error: "totp_not_set_up" }, { status: 400 });
  }

  // Verify the code
  if (!verifyTOTP(rows[0]!.totp_secret, code)) {
    return Response.json({ error: "invalid_totp_code" }, { status: 403 });
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
