import { z } from "zod";

import { getSql } from "@/lib/db";
import { apiError, apiZodError } from "@/lib/api/errors";
import { responseForDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  market_id: z.string().uuid(),
  price: z.coerce.string(),
  quantity: z.coerce.string(),
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

      const users = await txSql<{ id: string }[]>`
        INSERT INTO app_user (status, kyc_level, country)
        VALUES ('active','none',NULL), ('active','none',NULL)
        RETURNING id
      `;

      const sellerId = users[0]!.id;
      const buyerId = users[1]!.id;

      const orders = await txSql<
        { id: string; side: string; type: string; price: string; quantity: string; remaining_quantity: string; status: string }[]
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
        VALUES
          (
            ${input.market_id}::uuid,
            ${sellerId}::uuid,
            'sell',
            'limit',
            (${input.price}::numeric),
            (${input.quantity}::numeric),
            0,
            'filled',
            NULL
          ),
          (
            ${input.market_id}::uuid,
            ${buyerId}::uuid,
            'buy',
            'limit',
            (${input.price}::numeric),
            (${input.quantity}::numeric),
            0,
            'filled',
            NULL
          )
        RETURNING
          id,
          side,
          type,
          price::text AS price,
          quantity::text AS quantity,
          remaining_quantity::text AS remaining_quantity,
          status
      `;

      const maker = orders.find((o) => o.side === "sell")!;
      const taker = orders.find((o) => o.side === "buy")!;

      const execs = await txSql<{ id: string; created_at: string }[]>`
        INSERT INTO ex_execution (market_id, price, quantity, maker_order_id, taker_order_id)
        VALUES (
          ${input.market_id}::uuid,
          (${input.price}::numeric),
          (${input.quantity}::numeric),
          ${maker.id}::uuid,
          ${taker.id}::uuid
        )
        RETURNING id, created_at
      `;

      return {
        status: 201 as const,
        body: {
          ok: true,
          market_id: input.market_id,
          price: input.price,
          quantity: input.quantity,
          maker_order_id: maker.id,
          taker_order_id: taker.id,
          execution_id: execs[0]!.id,
          created_at: execs[0]!.created_at,
        },
      };
    });
  } catch (e) {
    return responseForDbError("exchange.dev.seed_execution", e) ?? apiError("upstream_unavailable");
  }

  const err = result.body as { error?: string; details?: unknown };
  if (typeof err.error === "string") {
    return apiError(err.error, { status: result.status, details: err.details });
  }

  return Response.json(result.body, { status: result.status });
}
