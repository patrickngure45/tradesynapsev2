import { apiError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { requireSessionUserId } from "@/lib/auth/sessionGuard";
import { serializeClearSessionCookie } from "@/lib/auth/session";
import { auditContextFromRequest, writeAuditLog } from "@/lib/auditLog";
import { responseForDbError } from "@/lib/dbTransient";
import { enforceAccountSecurityRateLimit } from "@/lib/auth/securityRateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sql = getSql();
  const authed = await requireSessionUserId(sql as any, request);
  if (!authed.ok) return authed.response;

  const rl = await enforceAccountSecurityRateLimit({
    sql: sql as any,
    request,
    limiterName: "account.sessions.logout_all",
    windowMs: 60_000,
    max: 10,
    userId: authed.userId,
  });
  if (rl) return rl;

  try {
    await sql`
      UPDATE app_user
      SET session_version = coalesce(session_version, 0) + 1, updated_at = now()
      WHERE id = ${authed.userId}::uuid
    `;

    try {
      await writeAuditLog(sql as any, {
        actorId: authed.userId,
        actorType: "user",
        action: "auth.sessions.logout_all",
        resourceType: "user",
        resourceId: authed.userId,
        ...auditContextFromRequest(request),
      });
    } catch {
      // ignore
    }

    const secure = process.env.NODE_ENV === "production";
    return new Response(JSON.stringify({ ok: true }) + "\n", {
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": serializeClearSessionCookie({ secure }),
      },
    });
  } catch (e) {
    return responseForDbError("account.sessions.logout_all", e) ?? apiError("internal_error");
  }
}
