import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { requireAdminForApi } from "@/lib/auth/admin";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z
  .object({
    user_id: z.string().uuid().optional(),
    email: z.string().email().optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  })
  .refine((v) => Boolean(v.user_id || v.email), { message: "user_id_or_email_required" });

/**
 * GET /api/exchange/admin/account-timeline?user_id=<uuid>&limit=200
 * GET /api/exchange/admin/account-timeline?email=user@example.com&limit=200
 *
 * Admin-key gated support endpoint that returns a single JSON payload with the
 * most relevant account activity to debug user issues.
 */
export async function GET(request: Request) {
  const sql = getSql();
  const admin = await requireAdminForApi(sql, request);
  if (!admin.ok) return admin.response;

  const url = new URL(request.url);
  const raw = {
    user_id: url.searchParams.get("user_id") ?? undefined,
    email: url.searchParams.get("email") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  };

  let q: z.infer<typeof querySchema>;
  try {
    q = querySchema.parse(raw);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const limit = q.limit ?? 200;

  try {
    const userRow = await retryOnceOnTransientDbError(async () => {
      const rows = await (sql as any)<{ id: string; email: string | null; display_name: string | null }[]>`
        SELECT id, email, display_name
        FROM app_user
        WHERE 1 = 1
          ${q.user_id ? sql`AND id = ${q.user_id}::uuid` : sql``}
          ${q.email ? sql`AND lower(email) = lower(${q.email})` : sql``}
        LIMIT 1
      `;
      return rows[0] ?? null;
    });

    if (!userRow) return apiError("not_found", { status: 404, details: "user_not_found" });
    const userId = userRow.id;

    const [orders, executions, withdrawals, notifications, ledgerEntries, audit] = await Promise.all([
      retryOnceOnTransientDbError(async () => {
        return await (sql as any)<any[]>`
          SELECT
            o.id,
            m.symbol AS market,
            o.side,
            o.type,
            o.status,
            o.price::text AS price,
            o.quantity::text AS quantity,
            o.remaining_quantity::text AS remaining_quantity,
            o.hold_id,
            o.created_at,
            o.updated_at
          FROM ex_order o
          JOIN ex_market m ON m.id = o.market_id
          WHERE o.user_id = ${userId}::uuid
          ORDER BY o.created_at DESC
          LIMIT ${limit}
        `;
      }),
      retryOnceOnTransientDbError(async () => {
        return await (sql as any)<any[]>`
          SELECT
            e.id,
            m.symbol AS market,
            e.price::text AS price,
            e.quantity::text AS quantity,
            e.maker_order_id,
            e.taker_order_id,
            e.created_at
          FROM ex_execution e
          JOIN ex_market m ON m.id = e.market_id
          WHERE
            EXISTS (SELECT 1 FROM ex_order o WHERE o.id = e.maker_order_id AND o.user_id = ${userId}::uuid)
            OR EXISTS (SELECT 1 FROM ex_order o WHERE o.id = e.taker_order_id AND o.user_id = ${userId}::uuid)
          ORDER BY e.created_at DESC
          LIMIT ${limit}
        `;
      }),
      retryOnceOnTransientDbError(async () => {
        return await (sql as any)<any[]>`
          SELECT
            w.id,
            a.symbol AS asset,
            w.amount::text AS amount,
            w.destination_address,
            w.status,
            w.reference,
            w.tx_hash,
            w.failure_reason,
            w.created_at,
            w.updated_at,
            w.approved_by,
            w.approved_at
          FROM ex_withdrawal_request w
          JOIN ex_asset a ON a.id = w.asset_id
          WHERE w.user_id = ${userId}::uuid
          ORDER BY w.created_at DESC
          LIMIT ${limit}
        `;
      }),
      retryOnceOnTransientDbError(async () => {
        return await (sql as any)<any[]>`
          SELECT
            n.id,
            n.type,
            n.title,
            n.body,
            n.read,
            n.metadata_json,
            n.created_at
          FROM ex_notification n
          WHERE n.user_id = ${userId}::uuid
          ORDER BY n.created_at DESC
          LIMIT ${limit}
        `;
      }),
      retryOnceOnTransientDbError(async () => {
        return await (sql as any)<any[]>`
          SELECT
            je.id,
            je.type,
            je.reference,
            je.metadata_json,
            je.created_at,
            COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'line_id', jl.id,
                  'asset', a.symbol,
                  'amount', jl.amount::text,
                  'account_id', jl.account_id
                )
                ORDER BY jl.created_at ASC
              ) FILTER (WHERE jl.id IS NOT NULL),
              '[]'::jsonb
            ) AS lines
          FROM ex_journal_entry je
          JOIN ex_journal_line jl ON jl.entry_id = je.id
          JOIN ex_ledger_account la ON la.id = jl.account_id
          JOIN ex_asset a ON a.id = jl.asset_id
          WHERE la.user_id = ${userId}::uuid
          GROUP BY je.id
          ORDER BY je.created_at DESC
          LIMIT ${limit}
        `;
      }),
      retryOnceOnTransientDbError(async () => {
        return await (sql as any)<any[]>`
          SELECT
            id,
            actor_id,
            actor_type,
            action,
            resource_type,
            resource_id,
            ip,
            user_agent,
            request_id,
            detail,
            ts::text AS created_at
          FROM audit_log
          WHERE actor_id = ${userId}::uuid
          ORDER BY ts DESC
          LIMIT ${limit}
        `;
      }),
    ]);

    return Response.json({
      user: userRow,
      limit,
      orders,
      executions,
      withdrawals,
      notifications,
      ledger_entries: ledgerEntries,
      audit,
    });
  } catch (e) {
    const resp = responseForDbError("admin.account-timeline", e);
    if (resp) return resp;
    throw e;
  }
}
