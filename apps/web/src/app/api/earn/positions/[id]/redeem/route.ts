import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { enforceAccountSecurityRateLimit } from "@/lib/auth/securityRateLimit";
import { enforceTotpIfEnabled } from "@/lib/auth/requireTotp";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  totp_code: z.string().length(6).regex(/^\d{6}$/).optional(),
});

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const sql = getSql();

  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const rateLimitRes = await enforceAccountSecurityRateLimit({
    sql,
    request,
    limiterName: "earn.positions.redeem",
    windowMs: 60_000,
    max: 20,
    userId: actingUserId,
  });
  if (rateLimitRes) return rateLimitRes;

  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return apiError("invalid_input");

  const body = await request.json().catch(() => ({}));
  let input: z.infer<typeof bodySchema>;
  try {
    input = bodySchema.parse(body);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  try {
    const activeErr = await retryOnceOnTransientDbError(() => requireActiveUser(sql, actingUserId));
    if (activeErr) return apiError(activeErr);

    const totpResp = await enforceTotpIfEnabled(sql, actingUserId, input.totp_code);
    if (totpResp) return totpResp;

    const result = await sql.begin(async (tx) => {
      const txSql = tx as unknown as typeof sql;

      const rows = await txSql<
        {
          id: string;
          user_id: string;
          status: string;
          kind: string;
          ends_at: string | null;
          hold_id: string | null;
        }[]
      >`
        SELECT
          id::text AS id,
          user_id::text AS user_id,
          status,
          kind,
          ends_at::text AS ends_at,
          hold_id::text AS hold_id
        FROM earn_position
        WHERE id = ${id}::uuid
        LIMIT 1
        FOR UPDATE
      `;

      const pos = rows[0];
      if (!pos) return { status: 404 as const, body: { error: "not_found" } };
      if (pos.user_id !== actingUserId) return { status: 403 as const, body: { error: "actor_not_allowed" } };
      if (pos.status !== "active") return { status: 409 as const, body: { error: "not_active" } };

      if (pos.kind === "locked") {
        if (!pos.ends_at) return { status: 409 as const, body: { error: "locked" } };
        const ends = new Date(pos.ends_at);
        if (!Number.isFinite(ends.getTime()) || Date.now() < ends.getTime()) {
          return { status: 409 as const, body: { error: "locked", details: { ends_at: pos.ends_at } } };
        }
      }

      if (pos.hold_id) {
        await txSql`
          UPDATE ex_hold
          SET status = 'released', released_at = now()
          WHERE id = ${pos.hold_id}::uuid AND status = 'active'
        `;
      }

      await txSql`
        UPDATE earn_position
        SET status = 'closed', closed_at = now(), updated_at = now()
        WHERE id = ${id}::uuid
      `;

      return { status: 200 as const, body: { ok: true } };
    });

    const err = result.body as any;
    if (err?.error) return apiError(err.error, { status: result.status, details: err.details });

    return Response.json(result.body, { status: result.status });
  } catch (e) {
    const resp = responseForDbError("earn.positions.redeem", e);
    if (resp) return resp;
    throw e;
  }
}
