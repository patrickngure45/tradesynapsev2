import { z } from "zod";

import { getSql } from "@/lib/db";
import { apiError, apiZodError } from "@/lib/api/errors";
import { enforceAccountSecurityRateLimit } from "@/lib/auth/securityRateLimit";
import { createSessionToken, serializeClearSessionCookie, serializeSessionCookie } from "@/lib/auth/session";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { requireBootstrapKeyIfProd } from "@/lib/auth/keys";
import { logRouteResponse } from "@/lib/routeLog";
import { writeAuditLog, auditContextFromRequest } from "@/lib/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  user_id: z.string().uuid(),
  ttl_seconds: z.number().int().positive().max(60 * 60 * 24 * 30).optional(),
});

export async function POST(request: Request) {
  const start = Date.now();
  const bootstrapErr = requireBootstrapKeyIfProd(request);
  if (bootstrapErr) return apiError(bootstrapErr);

  const secret = process.env.PROOFPACK_SESSION_SECRET ?? "";
  if (!secret) return apiError("session_secret_not_configured");

  const json = await request.json().catch(() => ({}));
  let input: z.infer<typeof postSchema>;
  try {
    input = postSchema.parse(json);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const sql = getSql();
  const rateLimitRes = await enforceAccountSecurityRateLimit({
    sql,
    request,
    limiterName: "auth.session.create",
    windowMs: 60_000,
    max: 20,
    includeIp: true,
  });
  if (rateLimitRes) return rateLimitRes;

  let rows: { id: string; status: string; session_version: number }[];
  try {
    rows = await retryOnceOnTransientDbError(async () => {
      return await sql<{ id: string; status: string; session_version: number }[]>`
        SELECT id, status, coalesce(session_version, 0) AS session_version
        FROM app_user
        WHERE id = ${input.user_id}
        LIMIT 1
      `;
    });
  } catch (e) {
    const resp = responseForDbError("auth.session.create", e);
    if (resp) return resp;
    throw e;
  }

  if (rows.length === 0) return apiError("user_not_found");
  if (rows[0]!.status !== "active") return apiError("user_not_active");

  const ttl = input.ttl_seconds ?? 60 * 60 * 24 * 7;
  const token = createSessionToken({
    userId: input.user_id,
    secret,
    ttlSeconds: ttl,
    sessionVersion: Number(rows[0]!.session_version ?? 0) || 0,
  });
  const secure = process.env.NODE_ENV === "production";

  const res = new Response(JSON.stringify({ ok: true, user_id: input.user_id, ttl_seconds: ttl }) + "\n", {
    status: 201,
    headers: {
      "content-type": "application/json",
      "set-cookie": serializeSessionCookie({ token, maxAgeSeconds: ttl, secure }),
    },
  });

  logRouteResponse(request, res, { startMs: start, userId: input.user_id });

  try {
    await writeAuditLog(sql, {
      actorId: input.user_id,
      actorType: "user",
      action: "auth.session.created",
      resourceType: "session",
      resourceId: input.user_id,
      ...auditContextFromRequest(request),
      detail: { ttl_seconds: ttl },
    });
  } catch { /* audit log failure must not block auth */ }

  return res;
}

export async function DELETE(request: Request) {
  const sql = getSql();
  const rateLimitRes = await enforceAccountSecurityRateLimit({
    sql,
    request,
    limiterName: "auth.session.delete",
    windowMs: 60_000,
    max: 20,
    includeIp: true,
  });
  if (rateLimitRes) return rateLimitRes;

  const secure = process.env.NODE_ENV === "production";

  try {
    await writeAuditLog(sql, {
      actorId: null,
      actorType: "user",
      action: "auth.session.deleted",
      resourceType: "session",
      resourceId: null,
      ...auditContextFromRequest(request),
    });
  } catch { /* audit log failure must not block sign-out */ }

  return new Response(JSON.stringify({ ok: true }) + "\n", {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": serializeClearSessionCookie({ secure }),
    },
  });
}
