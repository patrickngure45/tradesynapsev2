import { getSql } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ hash: string }> },
) {
  const { hash } = await ctx.params;
  const txHash = (hash ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(txHash)) return apiError("invalid_input", { status: 400 });

  const sql = getSql();

  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  try {
    const activeErr = await retryOnceOnTransientDbError(() => requireActiveUser(sql as any, actingUserId));
    if (activeErr) return apiError(activeErr);

    const rows = await retryOnceOnTransientDbError(async () => {
      return await sql<
        {
          tx_hash: string;
          type: string;
          user_id: string | null;
          block_id: string | null;
          block_height: number | null;
          block_created_at: string | null;
          created_at: string;
          entry_id: string;
          entry_type: string;
          entry_reference: string | null;
          entry_created_at: string;
          metadata_json: unknown;
          requester_is_admin: boolean;
        }[]
      >`
        WITH requester AS (
          SELECT id, role
          FROM app_user
          WHERE id = ${actingUserId}::uuid
          LIMIT 1
        )
        SELECT
          tx.tx_hash,
          tx.type,
          tx.user_id::text AS user_id,
          tx.block_id::text AS block_id,
          b.height AS block_height,
          b.created_at::text AS block_created_at,
          tx.created_at::text AS created_at,
          je.id::text AS entry_id,
          je.type AS entry_type,
          je.reference AS entry_reference,
          je.created_at::text AS entry_created_at,
          je.metadata_json,
          (SELECT role = 'admin' FROM requester)::boolean AS requester_is_admin
        FROM ex_chain_tx tx
        LEFT JOIN ex_chain_block b ON b.id = tx.block_id
        JOIN ex_journal_entry je ON je.id = tx.entry_id
        WHERE tx.tx_hash = ${txHash}
        LIMIT 1
      `;
    });

    const row = rows[0];
    if (!row) return apiError("not_found", { status: 404 });

    const canView = row.requester_is_admin || (row.user_id && row.user_id === actingUserId);
    if (!canView) return apiError("forbidden", { status: 403 });

    return Response.json(
      {
        ok: true,
        tx: {
          tx_hash: row.tx_hash,
          type: row.type,
          user_id: row.user_id,
          created_at: row.created_at,
        },
        block: row.block_id
          ? {
              id: row.block_id,
              height: row.block_height,
              created_at: row.block_created_at,
            }
          : null,
        entry: {
          id: row.entry_id,
          type: row.entry_type,
          reference: row.entry_reference,
          created_at: row.entry_created_at,
          metadata_json: row.metadata_json,
        },
      },
      { status: 200 },
    );
  } catch (e) {
    const resp = responseForDbError("exchange.tx.get", e);
    if (resp) return resp;
    console.error("exchange.tx.get failed:", e);
    return apiError("internal_error", {
      details: { message: e instanceof Error ? e.message : String(e) },
    });
  }
}
