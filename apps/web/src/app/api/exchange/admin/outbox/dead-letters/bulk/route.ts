import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { requireAdminForApi } from "@/lib/auth/admin";
import { auditContextFromRequest, writeAuditLog } from "@/lib/auditLog";
import { getSql } from "@/lib/db";
import { responseForDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  topic: z.string().trim().min(1).max(200),
  action: z.enum(["retry", "resolve"]),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function POST(request: Request) {
  const sql = getSql();
  const admin = await requireAdminForApi(sql, request);
  if (!admin.ok) return admin.response;

  const json = await request.json().catch(() => ({}));
  let input: z.infer<typeof postSchema>;
  try {
    input = postSchema.parse(json);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  try {
    const result = await sql.begin(async (tx) => {
      const txSql = tx as unknown as typeof sql;

      const ids = input.action === "resolve"
        ? await txSql<{ id: string }[]>`
            WITH target AS (
              SELECT id
              FROM app_outbox_event
              WHERE dead_lettered_at IS NOT NULL
                AND processed_at IS NULL
                AND topic = ${input.topic}
              ORDER BY dead_lettered_at DESC
              LIMIT ${input.limit}
            )
            UPDATE app_outbox_event e
            SET processed_at = now(), locked_at = NULL, lock_id = NULL
            WHERE e.id IN (SELECT id FROM target)
            RETURNING e.id::text AS id
          `
        : await txSql<{ id: string }[]>`
            WITH target AS (
              SELECT id
              FROM app_outbox_event
              WHERE dead_lettered_at IS NOT NULL
                AND processed_at IS NULL
                AND topic = ${input.topic}
              ORDER BY dead_lettered_at DESC
              LIMIT ${input.limit}
            )
            UPDATE app_outbox_event e
            SET
              dead_lettered_at = NULL,
              locked_at = NULL,
              lock_id = NULL,
              visible_at = now(),
              attempts = 0,
              last_error = NULL
            WHERE e.id IN (SELECT id FROM target)
            RETURNING e.id::text AS id
          `;

      const ctx = auditContextFromRequest(request);
      await writeAuditLog(txSql as any, {
        actorId: admin.userId,
        actorType: "admin",
        action: input.action === "resolve" ? "admin.outbox.dead_letter.bulk_resolve" : "admin.outbox.dead_letter.bulk_retry",
        resourceType: "outbox_topic",
        resourceId: input.topic,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
        detail: {
          topic: input.topic,
          action: input.action,
          limit: input.limit,
          affected: ids.length,
          ids,
        },
      });

      return { affected: ids.length, ids };
    });

    return Response.json({ ok: true, ...result }, { status: 200 });
  } catch (e) {
    const resp = responseForDbError("admin.outbox.dead-letters.bulk", e);
    if (resp) return resp;
    throw e;
  }
}
