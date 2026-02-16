import { z } from "zod";

import { getSql } from "@/lib/db";
import { apiError, apiZodError } from "@/lib/api/errors";
import { amount3818PositiveSchema } from "@/lib/exchange/amount";
import { quoteConvert } from "@/lib/exchange/convert";
import { toBigInt3818 } from "@/lib/exchange/fixed3818";
import { responseForDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_LIQUIDITY_USER_ID = "00000000-0000-0000-0000-000000000002";

const querySchema = z.object({
  from: z.string().min(1).max(12),
  to: z.string().min(1).max(12),
  amount_in: amount3818PositiveSchema,
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  let q: z.infer<typeof querySchema>;
  try {
    q = querySchema.parse({
      from: url.searchParams.get("from") ?? "",
      to: url.searchParams.get("to") ?? "",
      amount_in: url.searchParams.get("amount_in") ?? "",
    });
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const sql = getSql();

  try {
    const fromSym = q.from.trim().toUpperCase();
    const toSym = q.to.trim().toUpperCase();
    if (fromSym === toSym) return apiError("same_asset", { status: 409 });

    const assets = await sql<{ id: string; symbol: string }[]>`
      SELECT id::text AS id, symbol
      FROM ex_asset
      WHERE chain = 'bsc'
        AND is_enabled = true
        AND symbol = ANY(${[fromSym, toSym]})
    `;
    const fromAsset = assets.find((a) => a.symbol.toUpperCase() === fromSym) ?? null;
    const toAsset = assets.find((a) => a.symbol.toUpperCase() === toSym) ?? null;
    if (!fromAsset || !toAsset) return apiError("asset_not_found", { status: 404 });

    const quote = await quoteConvert(sql as any, {
      fromSymbol: fromSym,
      toSymbol: toSym,
      amountIn: q.amount_in,
    });
    if (!quote) return apiError("quote_unavailable", { status: 409 });

    // Liquidity-backed quotes (Binance-style): don't show a fillable quote unless we can deliver.
    const acctRows = await sql<{ id: string }[]>`
      SELECT id::text AS id
      FROM ex_ledger_account
      WHERE user_id = ${SYSTEM_LIQUIDITY_USER_ID}::uuid
        AND asset_id = ${toAsset.id}::uuid
      LIMIT 1
    `;
    const liquidityAcct = acctRows[0]?.id ?? null;
    if (!liquidityAcct) return apiError("liquidity_unavailable", { status: 409 });

    const availRows = await sql<{ available: string }[]>`
      WITH posted AS (
        SELECT coalesce(sum(amount), 0)::numeric AS posted
        FROM ex_journal_line
        WHERE account_id = ${liquidityAcct}::uuid
      ),
      held AS (
        SELECT coalesce(sum(remaining_amount), 0)::numeric AS held
        FROM ex_hold
        WHERE account_id = ${liquidityAcct}::uuid AND status = 'active'
      )
      SELECT (posted.posted - held.held)::text AS available
      FROM posted, held
    `;
    const available = (availRows[0]?.available ?? "0").trim();
    let availableBig: bigint;
    try {
      availableBig = toBigInt3818(available);
    } catch {
      return apiError("liquidity_unavailable", { status: 409 });
    }
    if (availableBig < toBigInt3818(quote.amountOut)) {
      return apiError("liquidity_unavailable", {
        status: 409,
        details: { available, required: quote.amountOut, asset: toSym },
      });
    }

    return Response.json({ ok: true, quote }, { status: 200 });
  } catch (e) {
    const resp = responseForDbError("exchange.convert.quote", e);
    if (resp) return resp;
    console.error("exchange.convert.quote failed:", e);
    return apiError("internal_error", {
      details: { message: e instanceof Error ? e.message : String(e) },
    });
  }
}
