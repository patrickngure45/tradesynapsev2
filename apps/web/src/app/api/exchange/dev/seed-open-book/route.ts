import { z } from "zod";

import { getSql } from "@/lib/db";
import { apiError, apiZodError } from "@/lib/api/errors";
import { responseForDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const levelSchema = z.object({
  price: z.string().min(1),
  quantities: z.array(z.string().min(1)).min(1),
});

const bodySchema = z.object({
  market_id: z.string().uuid(),
  bids: z.array(levelSchema).optional().default([]),
  asks: z.array(levelSchema).optional().default([]),
});

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return apiError("not_found");

  const sql = getSql();

  const body = await request.json().catch(() => ({}));
  let input: z.infer<typeof bodySchema>;
  try {
    input = bodySchema.parse(body);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const totalOrders =
    input.bids.reduce((n, l) => n + l.quantities.length, 0) +
    input.asks.reduce((n, l) => n + l.quantities.length, 0);

  if (totalOrders <= 0) {
    return apiError("invalid_input", { details: "must_provide_bids_or_asks" });
  }

  let result: { status: number; body: unknown };

  try {
    result = await sql.begin(async (tx) => {
      const txSql = tx as unknown as typeof sql;

      const markets = await txSql<{ id: string }[]>`
        SELECT id
        FROM ex_market
        WHERE id = ${input.market_id}::uuid
        LIMIT 1
      `;
      if (markets.length === 0) return { status: 404 as const, body: { error: "market_not_found" } };

      // Clear existing open book so smoke is deterministic.
      // Must release holds first to satisfy terminal-order hold invariants.
      await txSql`
        WITH target_holds AS (
          SELECT distinct hold_id
          FROM ex_order
          WHERE market_id = ${input.market_id}::uuid
            AND status IN ('open','partially_filled')
            AND hold_id IS NOT NULL
        )
        UPDATE ex_hold h
        SET status = 'released', released_at = now()
        FROM target_holds t
        WHERE h.id = t.hold_id
          AND h.status = 'active'
      `;

      await txSql`
        UPDATE ex_order
        SET status = 'canceled', remaining_quantity = 0, updated_at = now()
        WHERE market_id = ${input.market_id}::uuid
          AND status IN ('open','partially_filled')
      `;

      const users = await txSql<{ id: string }[]>`
        INSERT INTO app_user (status, kyc_level, country)
        SELECT 'active', 'none', NULL
        FROM generate_series(1, ${totalOrders}::int)
        RETURNING id
      `;

      let userIdx = 0;
      const created: Array<{ id: string; side: string; price: string; remaining_quantity: string; status: string }> = [];

      const insertOrder = async (side: "buy" | "sell", price: string, qty: string) => {
        const uid = users[userIdx++]!.id;
        const rows = await txSql<
          { id: string; side: string; price: string; remaining_quantity: string; status: string }[]
        >`
          INSERT INTO ex_order (
            market_id,
            user_id,
            side,
            type,
            price,
            quantity,
            remaining_quantity,
            status,
            hold_id
          )
          VALUES (
            ${input.market_id}::uuid,
            ${uid}::uuid,
            ${side},
            'limit',
            (${price}::numeric),
            (${qty}::numeric),
            (${qty}::numeric),
            'open',
            NULL
          )
          RETURNING id, side, price::text AS price, remaining_quantity::text AS remaining_quantity, status
        `;
        created.push(rows[0]!);
      };

      for (const l of input.bids) {
        for (const qty of l.quantities) {
          await insertOrder("buy", l.price, qty);
        }
      }

      for (const l of input.asks) {
        for (const qty of l.quantities) {
          await insertOrder("sell", l.price, qty);
        }
      }

      const bidRows = await txSql<{ price: string; quantity: string; order_count: number }[]>`
        SELECT
          price::text AS price,
          sum(remaining_quantity)::text AS quantity,
          count(*)::int AS order_count
        FROM ex_order
        WHERE market_id = ${input.market_id}::uuid
          AND side = 'buy'
          AND status IN ('open','partially_filled')
          AND remaining_quantity > 0
        GROUP BY price
        ORDER BY price DESC
        LIMIT 1
      `;

      const askRows = await txSql<{ price: string; quantity: string; order_count: number }[]>`
        SELECT
          price::text AS price,
          sum(remaining_quantity)::text AS quantity,
          count(*)::int AS order_count
        FROM ex_order
        WHERE market_id = ${input.market_id}::uuid
          AND side = 'sell'
          AND status IN ('open','partially_filled')
          AND remaining_quantity > 0
        GROUP BY price
        ORDER BY price ASC
        LIMIT 1
      `;

      return {
        status: 201 as const,
        body: {
          ok: true,
          market_id: input.market_id,
          orders: created,
          top: {
            bid: bidRows[0] ?? null,
            ask: askRows[0] ?? null,
          },
        },
      };
    });
  } catch (e) {
    return responseForDbError("exchange.dev.seed_open_book", e) ?? apiError("upstream_unavailable");
  }

  const err = result.body as { error?: string; details?: unknown };
  if (typeof err.error === "string") {
    return apiError(err.error, { status: result.status, details: err.details });
  }

  return Response.json(result.body, { status: result.status });
}
