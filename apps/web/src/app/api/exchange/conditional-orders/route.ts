import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stopLimitSchema = z.object({
  kind: z.literal("stop_limit"),
  market_id: z.string().uuid(),
  side: z.enum(["buy", "sell"]),
  trigger_price: z.string().min(1),
  limit_price: z.string().min(1),
  quantity: z.string().min(1),
});

const ocoSchema = z.object({
  kind: z.literal("oco"),
  market_id: z.string().uuid(),
  side: z.enum(["buy", "sell"]),
  take_profit_price: z.string().min(1),
  stop_trigger_price: z.string().min(1),
  stop_limit_price: z.string().min(1),
  quantity: z.string().min(1),
});

const createSchema = z.union([stopLimitSchema, ocoSchema]);

const querySchema = z.object({
  market_id: z.string().uuid().optional(),
  status: z.enum(["active", "triggering", "triggered", "canceled", "failed", "all"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
});

export async function GET(request: Request) {
  const sql = getSql();
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const url = new URL(request.url);
  let q: z.infer<typeof querySchema>;
  try {
    q = querySchema.parse({
      market_id: url.searchParams.get("market_id") ?? undefined,
      status: (url.searchParams.get("status") as any) ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return apiError(activeErr);

    const rows = await retryOnceOnTransientDbError(async () => {
      return await sql<
        {
          id: string;
          kind: string;
          side: string;
          market_id: string;
          market_symbol: string;
          trigger_price: string;
          limit_price: string;
            take_profit_price: string | null;
            triggered_leg: string | null;
          quantity: string;
          status: string;
          attempt_count: number;
          last_attempt_at: string | null;
          triggered_at: string | null;
          placed_order_id: string | null;
          failure_reason: string | null;
          created_at: string;
        }[]
      >`
        SELECT
          c.id::text,
          c.kind,
          c.side,
          c.market_id::text,
          m.symbol AS market_symbol,
          c.trigger_price::text,
          c.limit_price::text,
          c.take_profit_price::text,
          c.triggered_leg,
          c.quantity::text,
          c.status,
          c.attempt_count,
          c.last_attempt_at,
          c.triggered_at,
          c.placed_order_id::text,
          c.failure_reason,
          c.created_at
        FROM ex_conditional_order c
        JOIN ex_market m ON m.id = c.market_id
        WHERE c.user_id = ${actingUserId}::uuid
          AND (${q.market_id ?? null}::uuid IS NULL OR c.market_id = ${q.market_id ?? null}::uuid)
          AND (${q.status ?? "all"} = 'all' OR c.status = ${q.status ?? "all"})
        ORDER BY c.created_at DESC
        LIMIT ${q.limit}
      `;
    });

    return Response.json({ conditional_orders: rows });
  } catch (e) {
    const resp = responseForDbError("exchange.conditional-orders.list", e);
    if (resp) return resp;
    throw e;
  }
}

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
    let input: z.infer<typeof createSchema>;
    try {
      input = createSchema.parse(body);
    } catch (e) {
      return apiZodError(e) ?? apiError("invalid_input");
    }

    const row = await retryOnceOnTransientDbError(async () => {
      const stopTrigger = input.kind === "oco" ? input.stop_trigger_price : input.trigger_price;
      const stopLimit = input.kind === "oco" ? input.stop_limit_price : input.limit_price;
      const takeProfit = input.kind === "oco" ? input.take_profit_price : null;

      const rows = await sql<{ id: string }[]>`
        INSERT INTO ex_conditional_order (
          user_id,
          market_id,
          kind,
          side,
          trigger_price,
          limit_price,
          take_profit_price,
          quantity,
          status
        )
        VALUES (
          ${actingUserId}::uuid,
          ${input.market_id}::uuid,
          ${input.kind},
          ${input.side},
          ${stopTrigger}::numeric,
          ${stopLimit}::numeric,
          ${takeProfit}::numeric,
          ${input.quantity}::numeric,
          'active'
        )
        RETURNING id::text
      `;
      return rows[0] ?? null;
    });

    return Response.json({ ok: true, id: row?.id ?? null }, { status: 201 });
  } catch (e) {
    const resp = responseForDbError("exchange.conditional-orders.create", e);
    if (resp) return resp;
    throw e;
  }
}

export async function DELETE(request: Request) {
  const sql = getSql();
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  if (!z.string().uuid().safeParse(id).success) return apiError("invalid_input");

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return apiError(activeErr);

    const updated = await retryOnceOnTransientDbError(async () => {
      const rows = await sql<{ n: number }[]>`
        WITH u AS (
          UPDATE ex_conditional_order
          SET status = 'canceled', updated_at = now()
          WHERE id = ${id}::uuid
            AND user_id = ${actingUserId}::uuid
            AND status IN ('active','triggering')
          RETURNING 1
        )
        SELECT count(*)::int AS n FROM u
      `;
      return rows[0]?.n ?? 0;
    });

    return Response.json({ ok: true, canceled: updated });
  } catch (e) {
    const resp = responseForDbError("exchange.conditional-orders.cancel", e);
    if (resp) return resp;
    throw e;
  }
}
