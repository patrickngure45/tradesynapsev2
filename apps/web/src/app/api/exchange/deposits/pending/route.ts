import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { apiError } from "@/lib/api/errors";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { getBscProvider } from "@/lib/blockchain/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function envInt(name: string, fallback: number): number {
  const raw = String(process.env[name] ?? "").trim();
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export async function GET(request: Request) {
  const sql = getSql();
  const actingUserId = getActingUserId(request);

  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const confirmationsRequired = clamp(envInt("BSC_DEPOSIT_CONFIRMATIONS", 2), 0, 200);
  const limit = clamp(envInt("PENDING_DEPOSITS_LIMIT", 20), 1, 200);

  try {
    const activeErr = await retryOnceOnTransientDbError(() => requireActiveUser(sql, actingUserId));
    if (activeErr) return apiError(activeErr);

    const rows = await retryOnceOnTransientDbError(async () => {
      return await sql<
        {
          id: number;
          chain: string;
          tx_hash: string;
          log_index: number;
          block_number: number;
          to_address: string;
          amount: string;
          created_at: string;
          asset_symbol: string;
          asset_decimals: number;
        }[]
      >`
        SELECT
          e.id,
          e.chain,
          e.tx_hash,
          e.log_index,
          e.block_number,
          e.to_address,
          e.amount::text AS amount,
          e.created_at::text AS created_at,
          a.symbol AS asset_symbol,
          a.decimals AS asset_decimals
        FROM ex_chain_deposit_event e
        JOIN ex_asset a ON a.id = e.asset_id
        WHERE e.user_id = ${actingUserId}::uuid
          AND e.chain = 'bsc'
          AND e.journal_entry_id IS NULL
        ORDER BY e.block_number DESC, e.id DESC
        LIMIT ${limit}
      `;
    });

    // Best-effort: confirmations are derived from tip. If RPC is flaky, still return
    // the pending rows so the UI can show the tx hashes and amounts.
    let tip: number | null = null;
    let tip_error: string | null = null;
    try {
      const provider = getBscProvider();
      tip = await provider.getBlockNumber();
    } catch (e) {
      tip_error = e instanceof Error ? e.message : String(e);
    }

    const deposits = rows.map((r) => {
      const blockNumber = Number(r.block_number);
      const confirmations =
        tip != null && Number.isFinite(blockNumber) && blockNumber > 0 ? Math.max(0, tip - blockNumber + 1) : 0;
      return {
        id: r.id,
        chain: r.chain,
        tx_hash: r.tx_hash,
        log_index: r.log_index,
        block_number: blockNumber,
        to_address: r.to_address,
        asset_symbol: r.asset_symbol,
        asset_decimals: r.asset_decimals,
        amount: r.amount,
        confirmations,
        confirmations_required: confirmationsRequired,
        status: confirmations >= confirmationsRequired ? "detected" : "pending_confirmations",
        created_at: r.created_at,
      } as const;
    });

    return Response.json({
      user_id: actingUserId,
      chain: "bsc",
      tip,
      tip_error,
      confirmations_required: confirmationsRequired,
      deposits,
    });
  } catch (e) {
    const resp = responseForDbError("exchange.deposits.pending", e);
    if (resp) return resp;
    const message = e instanceof Error ? e.message : String(e);
    return Response.json(
      {
        error: "internal_error",
        details: { message },
      },
      { status: 500 },
    );
  }
}
