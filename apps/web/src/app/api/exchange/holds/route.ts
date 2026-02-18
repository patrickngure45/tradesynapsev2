import { z } from "zod";

import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { apiError, apiZodError } from "@/lib/api/errors";
import { amount3818PositiveSchema } from "@/lib/exchange/amount";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const holdStatusSchema = z.enum(["active", "released", "consumed", "all"]);

export async function GET(request: Request) {
  const sql = getSql();

  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  try {
    const activeErr = await retryOnceOnTransientDbError(() => requireActiveUser(sql, actingUserId));
    if (activeErr) return apiError(activeErr);

    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status") ?? "active";
    let status: z.infer<typeof holdStatusSchema>;
    try {
      status = holdStatusSchema.parse(statusParam);
    } catch (e) {
      return apiZodError(e) ?? apiError("invalid_input");
    }

    const rows = await retryOnceOnTransientDbError(async () => {
      return await sql<
        {
          id: string;
          asset_id: string;
          chain: string;
          symbol: string;
          amount: string;
          remaining_amount: string;
          reason: string;
          status: "active" | "released" | "consumed";
          created_at: string;
          released_at: string | null;
        }[]
      >`
        SELECT
          h.id,
          h.asset_id,
          a.chain,
          a.symbol,
          h.amount::text AS amount,
          h.remaining_amount::text AS remaining_amount,
          h.reason,
          h.status,
          h.created_at,
          h.released_at
        FROM ex_hold h
        JOIN ex_ledger_account acct ON acct.id = h.account_id
        JOIN ex_asset a ON a.id = h.asset_id
        WHERE acct.user_id = ${actingUserId}
          AND (
            ${status} = 'all'
            OR h.status = ${status}
          )
        ORDER BY h.created_at DESC
        LIMIT 100
      `;
    });

    return Response.json({ user_id: actingUserId, holds: rows });
  } catch (e) {
    const resp = responseForDbError("exchange.holds.list", e);
    if (resp) return resp;
    throw e;
  }
}

const createHoldSchema = z.object({
  asset_id: z.string().uuid(),
  amount: amount3818PositiveSchema,
  reason: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  const sql = getSql();

  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return apiError(activeErr);

    const body = await request.json().catch(() => ({}));
    let input: z.infer<typeof createHoldSchema>;
    try {
      input = createHoldSchema.parse(body);
    } catch (e) {
      return apiZodError(e) ?? apiError("invalid_input");
    }

    const result = await sql.begin(async (tx) => {
      const txSql = tx as unknown as typeof sql;

    const assets = await txSql<{ id: string }[]>`
      SELECT id
      FROM ex_asset
      WHERE id = ${input.asset_id} AND is_enabled = true
      LIMIT 1
    `;
    if (assets.length === 0) {
      return { status: 404 as const, body: { error: "not_found" } };
    }

    const accounts = await txSql<{ id: string }[]>`
      INSERT INTO ex_ledger_account (user_id, asset_id)
      VALUES (${actingUserId}, ${input.asset_id})
      ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
      RETURNING id
    `;

    const accountId = accounts[0]!.id;

    const balRows = await txSql<
      { posted: string; held: string; available: string; ok: boolean }[]
    >`
      WITH posted AS (
        SELECT coalesce(sum(amount), 0)::numeric AS posted
        FROM ex_journal_line
        WHERE account_id = ${accountId}
      ),
      held AS (
        SELECT coalesce(sum(remaining_amount), 0)::numeric AS held
        FROM ex_hold
        WHERE account_id = ${accountId} AND status = 'active'
      )
      SELECT
        posted.posted::text AS posted,
        held.held::text AS held,
        (posted.posted - held.held)::text AS available,
        ((posted.posted - held.held) >= (${input.amount}::numeric)) AS ok
      FROM posted, held
    `;

    const bal = balRows[0];
    if (!bal?.ok) {
      return {
        status: 409 as const,
        body: {
          error: "insufficient_balance",
          details: {
            posted: bal?.posted ?? "0",
            held: bal?.held ?? "0",
            available: bal?.available ?? "0",
            requested: input.amount,
          },
        },
      };
    }

    const holds = await txSql<
      {
        id: string;
        account_id: string;
        asset_id: string;
        amount: string;
        reason: string;
        status: string;
        created_at: string;
      }[]
    >`
      INSERT INTO ex_hold (account_id, asset_id, amount, reason)
      VALUES (${accountId}, ${input.asset_id}, (${input.amount}::numeric), ${input.reason})
      RETURNING id, account_id, asset_id, amount::text AS amount, reason, status, created_at
    `;

    return { status: 201 as const, body: { hold: holds[0] } };
    });

    const err = result.body as { error?: string; details?: unknown };
    if (typeof err.error === "string") {
      return apiError(err.error, { status: result.status, details: err.details });
    }

    return Response.json(result.body, { status: result.status });
  } catch (e) {
    const resp = responseForDbError("exchange.holds.create", e);
    if (resp) return resp;
    throw e;
  }
}
