import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { requireAdminForApi } from "@/lib/auth/admin";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DeferredRow = {
  id: string;
  user_id: string;
  email: string | null;
  type: string;
  title: string;
  body: string;
  metadata_json: unknown;
  created_at: string;
};

type DeferredUserSummaryRow = {
  user_id: string;
  email: string | null;
  count: number;
  oldest_at: string;
  newest_at: string;
  types_json: unknown;
};

const querySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((v) => Math.max(1, Math.min(50, Number(v) || 10))),
  user_id: z.string().uuid().optional(),
});

export async function GET(request: Request) {
  const sql = getSql();
  const admin = await requireAdminForApi(sql, request);
  if (!admin.ok) return admin.response;

  const url = new URL(request.url);
  let q: z.infer<typeof querySchema>;
  try {
    q = querySchema.parse({
      limit: url.searchParams.get("limit") ?? undefined,
      user_id: url.searchParams.get("user_id") ?? undefined,
    });
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  try {
    if (q.user_id) {
      const rows = await retryOnceOnTransientDbError(async () => {
        const res = await (sql as any)<DeferredRow[]>`
          SELECT
            d.id::text AS id,
            d.user_id::text AS user_id,
            u.email,
            d.type,
            d.title,
            d.body,
            d.metadata_json,
            d.created_at::text AS created_at
          FROM ex_notification_deferred d
          JOIN app_user u ON u.id = d.user_id
          WHERE d.user_id = ${q.user_id}::uuid
          ORDER BY d.created_at ASC
          LIMIT 200
        `;

        // Materialize into a plain array (postgres.js results are thenables; keep async typing clean).
        return (res as DeferredRow[]).map((r: DeferredRow) => ({ ...r }));
      });

      return Response.json({ user_id: q.user_id, deferred: rows });
    }

    const out = await retryOnceOnTransientDbError(async () => {
      const totalsRes = await (sql as any)<{ total: string }[]>`
        SELECT count(*)::text AS total FROM ex_notification_deferred
      `;
      const totals = [...totalsRes];
      const total = Number(totals[0]?.total ?? "0") || 0;

      const usersRes = await (sql as any)<
        DeferredUserSummaryRow[]
      >`
        WITH per_type AS (
          SELECT user_id, type, count(*)::int AS cnt
          FROM ex_notification_deferred
          GROUP BY user_id, type
        ),
        per_user AS (
          SELECT
            d.user_id,
            count(*)::int AS count,
            min(d.created_at)::timestamptz AS oldest_at,
            max(d.created_at)::timestamptz AS newest_at
          FROM ex_notification_deferred d
          GROUP BY d.user_id
        ),
        types AS (
          SELECT user_id, jsonb_object_agg(type, cnt) AS types_json
          FROM per_type
          GROUP BY user_id
        )
        SELECT
          pu.user_id::text AS user_id,
          u.email,
          pu.count,
          pu.oldest_at::text AS oldest_at,
          pu.newest_at::text AS newest_at,
          t.types_json
        FROM per_user pu
        JOIN app_user u ON u.id = pu.user_id
        LEFT JOIN types t ON t.user_id = pu.user_id
        ORDER BY pu.count DESC, pu.oldest_at ASC
        LIMIT ${q.limit}
      `;

      const users = (usersRes as DeferredUserSummaryRow[]).map((u: DeferredUserSummaryRow) => ({ ...u }));
      return { total, users };
    });

    return Response.json(out);
  } catch (e) {
    const resp = responseForDbError("admin.notifications-deferred.get", e);
    if (resp) return resp;
    throw e;
  }
}

export async function DELETE(request: Request) {
  const sql = getSql();
  const admin = await requireAdminForApi(sql, request);
  if (!admin.ok) return admin.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_input");
  }

  const parsed = z.object({ user_id: z.string().uuid() }).safeParse(body);
  if (!parsed.success) return apiError("invalid_input");

  try {
    const result = await retryOnceOnTransientDbError(async () => {
      const r = await sql`
        DELETE FROM ex_notification_deferred
        WHERE user_id = ${parsed.data.user_id}::uuid
      `;
      return { deleted: r.count };
    });

    return Response.json({ ok: true, ...result });
  } catch (e) {
    const resp = responseForDbError("admin.notifications-deferred.delete", e);
    if (resp) return resp;
    throw e;
  }
}
