import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { requireAdminForApi } from "@/lib/auth/admin";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  user_id: z.string().uuid(),
  limit: z
    .string()
    .optional()
    .transform((v) => (v == null ? 200 : Math.max(50, Math.min(2000, Number(v) || 200)))),
});

/**
 * GET /api/admin/account-timeline?user_id=<uuid>&limit=200
 * Admin-only. Returns a JSON export of the user's activity across rails.
 */
export async function GET(request: Request) {
  const sql = getSql();

  const admin = await requireAdminForApi(sql as any, request);
  if (!admin.ok) return admin.response;

  const url = new URL(request.url);
  let q: z.infer<typeof querySchema>;
  try {
    q = querySchema.parse({
      user_id: url.searchParams.get("user_id") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  try {
    const [deposits, withdrawals, orders, journal] = await retryOnceOnTransientDbError(async () => {
      const depositsP = sql<
        Array<{
          id: number;
          chain: string;
          tx_hash: string;
          log_index: number;
          block_number: number;
          from_address: string | null;
          to_address: string;
          asset_id: string;
          amount: string;
          journal_entry_id: string | null;
          status: string | null;
          created_at: string;
          credited_at: string | null;
          confirmed_at: string | null;
        }>
      >`
        SELECT
          id,
          chain,
          tx_hash,
          log_index,
          block_number,
          from_address,
          to_address,
          asset_id::text AS asset_id,
          amount::text AS amount,
          journal_entry_id::text AS journal_entry_id,
          (status)::text AS status,
          created_at::text AS created_at,
          credited_at::text AS credited_at,
          confirmed_at::text AS confirmed_at
        FROM ex_chain_deposit_event
        WHERE user_id = ${q.user_id}::uuid
        ORDER BY created_at DESC
        LIMIT ${q.limit}
      `;

      const withdrawalsP = sql<
        Array<{
          id: string;
          asset_id: string;
          amount: string;
          destination_address: string;
          status: string;
          reference: string | null;
          tx_hash: string | null;
          failure_reason: string | null;
          hold_id: string | null;
          created_at: string;
          updated_at: string;
          approved_by: string | null;
          approved_at: string | null;
        }>
      >`
        SELECT
          id::text AS id,
          asset_id::text AS asset_id,
          amount::text AS amount,
          destination_address,
          status,
          reference,
          tx_hash,
          failure_reason,
          hold_id::text AS hold_id,
          created_at::text AS created_at,
          updated_at::text AS updated_at,
          approved_by,
          approved_at::text AS approved_at
        FROM ex_withdrawal_request
        WHERE user_id = ${q.user_id}::uuid
        ORDER BY created_at DESC
        LIMIT ${q.limit}
      `;

      const ordersP = sql<
        Array<{
          id: string;
          market_id: string;
          side: string;
          type: string;
          price: string;
          quantity: string;
          remaining_quantity: string;
          status: string;
          hold_id: string | null;
          created_at: string;
          updated_at: string;
        }>
      >`
        SELECT
          id::text AS id,
          market_id::text AS market_id,
          side,
          type,
          price::text AS price,
          quantity::text AS quantity,
          remaining_quantity::text AS remaining_quantity,
          status,
          hold_id::text AS hold_id,
          created_at::text AS created_at,
          updated_at::text AS updated_at
        FROM ex_order
        WHERE user_id = ${q.user_id}::uuid
        ORDER BY created_at DESC
        LIMIT ${q.limit}
      `;

      const journalP = sql<
        Array<{
          entry_id: string;
          type: string;
          reference: string | null;
          created_at: string;
          metadata_json: unknown;
          line_id: string;
          account_id: string;
          asset_id: string;
          amount: string;
        }>
      >`
        SELECT
          je.id::text AS entry_id,
          je.type,
          je.reference,
          je.created_at::text AS created_at,
          je.metadata_json,
          jl.id::text AS line_id,
          jl.account_id::text AS account_id,
          jl.asset_id::text AS asset_id,
          jl.amount::text AS amount
        FROM ex_journal_entry je
        JOIN ex_journal_line jl ON jl.entry_id = je.id
        JOIN ex_ledger_account acct ON acct.id = jl.account_id
        WHERE acct.user_id = ${q.user_id}::uuid
        ORDER BY je.created_at DESC, jl.created_at DESC
        LIMIT ${q.limit * 4}
      `;

      return await Promise.all([depositsP, withdrawalsP, ordersP, journalP]);
    });

    return Response.json({
      ok: true,
      requested_by: admin.userId,
      user_id: q.user_id,
      limit: q.limit,
      deposits,
      withdrawals,
      orders,
      journal,
    });
  } catch (e) {
    const resp = responseForDbError("admin.account-timeline", e);
    if (resp) return resp;
    throw e;
  }
}
