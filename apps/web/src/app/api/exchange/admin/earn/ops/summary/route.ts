import { NextResponse } from "next/server";

import { apiError } from "@/lib/api/errors";
import { requireAdminForApi } from "@/lib/auth/admin";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_TREASURY_USER_ID = "00000000-0000-0000-0000-000000000001";
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

export async function GET(request: Request) {
  const sql = getSql();
  const admin = await requireAdminForApi(sql, request);
  if (!admin.ok) return admin.response;

  try {
    const [treasury, recentPayouts] = await Promise.all([
      retryOnceOnTransientDbError(async () => {
        return await sql<
          {
            asset_id: string;
            asset_symbol: string;
            asset_decimals: number;
            treasury_posted: string;
            treasury_held: string;
            treasury_available: string;
            accrued_interest: string;
            deficit: string;
          }[]
        >`
          WITH earn_assets AS (
            SELECT DISTINCT a.id AS asset_id, a.symbol AS asset_symbol, a.decimals AS asset_decimals
            FROM earn_product p
            JOIN ex_asset a ON a.id = p.asset_id
          ),
          treasury_accounts AS (
            SELECT la.asset_id, la.id AS account_id
            FROM ex_ledger_account la
            WHERE la.user_id = ${SYSTEM_TREASURY_USER_ID}::uuid
          ),
          treasury_posted AS (
            SELECT ta.asset_id, coalesce(sum(jl.amount), 0)::numeric AS posted
            FROM treasury_accounts ta
            LEFT JOIN ex_journal_line jl ON jl.account_id = ta.account_id
            GROUP BY ta.asset_id
          ),
          treasury_held AS (
            SELECT ta.asset_id, coalesce(sum(h.remaining_amount), 0)::numeric AS held
            FROM treasury_accounts ta
            LEFT JOIN ex_hold h ON h.account_id = ta.account_id AND h.status = 'active'
            GROUP BY ta.asset_id
          ),
          accrued AS (
            SELECT
              p.asset_id,
              coalesce(
                sum(
                  (pos.principal_amount::numeric(38,18))
                    * (pos.apr_bps::numeric / 10000)
                    * (
                      greatest(0, extract(epoch from (now() - coalesce(pos.last_claim_at, pos.started_at))))::numeric
                      / ${SECONDS_PER_YEAR}::numeric
                    )
                ),
                0
              )::numeric(38,18) AS accrued_interest
            FROM earn_position pos
            JOIN earn_product p ON p.id = pos.product_id
            WHERE pos.status = 'active'
            GROUP BY p.asset_id
          )
          SELECT
            ea.asset_id::text AS asset_id,
            ea.asset_symbol,
            ea.asset_decimals,
            coalesce(tp.posted, 0)::text AS treasury_posted,
            coalesce(th.held, 0)::text AS treasury_held,
            (coalesce(tp.posted, 0) - coalesce(th.held, 0))::text AS treasury_available,
            coalesce(ac.accrued_interest, 0)::text AS accrued_interest,
            greatest(coalesce(ac.accrued_interest, 0) - (coalesce(tp.posted, 0) - coalesce(th.held, 0)), 0)::text AS deficit
          FROM earn_assets ea
          LEFT JOIN treasury_posted tp ON tp.asset_id = ea.asset_id
          LEFT JOIN treasury_held th ON th.asset_id = ea.asset_id
          LEFT JOIN accrued ac ON ac.asset_id = ea.asset_id
          ORDER BY ea.asset_symbol ASC
        `;
      }),
      retryOnceOnTransientDbError(async () => {
        return await sql<
          {
            entry_id: string;
            created_at: string;
            user_id: string | null;
            position_id: string | null;
            asset: string | null;
            amount: string | null;
            tx_hash: string | null;
            block_height: number | null;
          }[]
        >`
          SELECT
            je.id::text AS entry_id,
            je.created_at::text AS created_at,
            nullif(je.metadata_json->>'user_id', '') AS user_id,
            nullif(je.metadata_json->>'position_id', '') AS position_id,
            nullif(je.metadata_json->>'asset', '') AS asset,
            nullif(je.metadata_json->>'amount', '') AS amount,
            ctx.tx_hash,
            cb.height AS block_height
          FROM ex_journal_entry je
          LEFT JOIN ex_chain_tx ctx ON ctx.entry_id = je.id
          LEFT JOIN ex_chain_block cb ON cb.id = ctx.block_id
          WHERE je.type = 'earn_interest'
          ORDER BY je.created_at DESC
          LIMIT 25
        `;
      }),
    ]);

    const anyDeficit = treasury.some((r) => {
      const deficit = Number(r.deficit);
      return Number.isFinite(deficit) && deficit > 0;
    });

    return NextResponse.json(
      {
        ok: true,
        treasury,
        recent_payouts: recentPayouts,
        coverage_ok: !anyDeficit,
      },
      { status: 200 },
    );
  } catch (e) {
    const resp = responseForDbError("exchange.admin.earn.ops.summary", e);
    if (resp) return resp;
    return apiError("internal_error");
  }
}
