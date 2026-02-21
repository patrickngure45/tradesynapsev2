import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { POST as placeOrder } from "@/app/api/exchange/orders/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((v) => (v == null ? 50 : Math.max(1, Math.min(500, Number(v) || 50)))),
});

function isProd() {
  return String(process.env.NODE_ENV ?? "").toLowerCase() === "production";
}

function isEnabledInProd(): boolean {
  return String(process.env.EXCHANGE_ENABLE_CONDITIONAL_ORDERS ?? "").trim() === "1";
}

function checkCronSecret(request: Request): boolean {
  const expected = String(process.env.EXCHANGE_CRON_SECRET ?? process.env.CRON_SECRET ?? "").trim();
  if (!expected) return false;
  const got = request.headers.get("x-cron-secret") ?? new URL(request.url).searchParams.get("secret") ?? "";
  return got === expected;
}

type ConditionalRow = {
  id: string;
  user_id: string;
  market_id: string;
  kind: "stop_limit" | "oco";
  side: "buy" | "sell";
  trigger_price: string;
  limit_price: string;
  take_profit_price: string | null;
  quantity: string;
  status: "active" | "triggering";
  attempt_count: number;
  last_attempt_at: string | null;
};

function shouldTrigger(side: "buy" | "sell", currentPrice: number, triggerPrice: number): boolean {
  if (!Number.isFinite(currentPrice) || !Number.isFinite(triggerPrice) || triggerPrice <= 0) return false;
  return side === "buy" ? currentPrice >= triggerPrice : currentPrice <= triggerPrice;
}

function shouldTakeProfit(side: "buy" | "sell", currentPrice: number, takeProfitPrice: number): boolean {
  if (!Number.isFinite(currentPrice) || !Number.isFinite(takeProfitPrice) || takeProfitPrice <= 0) return false;
  // Favorable direction: sell TP when price rises; buy TP when price falls.
  return side === "sell" ? currentPrice >= takeProfitPrice : currentPrice <= takeProfitPrice;
}

/**
 * POST /api/exchange/cron/conditional-orders
 * Secured with x-cron-secret. Disabled by default in production.
 */
export async function POST(request: Request) {
  if (isProd() && !isEnabledInProd()) return apiError("forbidden");
  if (!checkCronSecret(request)) return apiError("forbidden");

  const url = new URL(request.url);
  let q: z.infer<typeof querySchema>;
  try {
    q = querySchema.parse({ limit: url.searchParams.get("limit") ?? undefined });
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const sql = getSql();

  try {
    const candidates = await retryOnceOnTransientDbError(async () => {
      return await sql<ConditionalRow[]>`
        SELECT
          id::text,
          user_id::text,
          market_id::text,
          kind,
          side,
          trigger_price::text,
          limit_price::text,
          take_profit_price::text,
          quantity::text,
          status,
          attempt_count,
          last_attempt_at
        FROM ex_conditional_order
        WHERE kind IN ('stop_limit','oco')
          AND (
            status = 'active'
            OR (
              status = 'triggering'
              AND (last_attempt_at IS NULL OR last_attempt_at < now() - interval '2 minutes')
              AND attempt_count < 10
            )
          )
        ORDER BY created_at ASC
        LIMIT ${q.limit}
      `;
    });

    const marketIds = Array.from(new Set(candidates.map((c) => c.market_id)));
    const marketPrices = new Map<string, number>();

    if (marketIds.length > 0) {
      const rows = await retryOnceOnTransientDbError(async () => {
        return await sql<{ market_id: string; price: string | null }[]>`
          WITH mids AS (
            SELECT
              m.id::text AS market_id,
              (
                SELECT e.price
                FROM ex_execution e
                WHERE e.market_id = m.id
                ORDER BY e.created_at DESC
                LIMIT 1
              ) AS last_exec_price,
              (
                SELECT o.price
                FROM ex_order o
                WHERE o.market_id = m.id
                  AND o.side = 'buy'
                  AND o.status IN ('open','partially_filled')
                ORDER BY o.price DESC, o.created_at ASC
                LIMIT 1
              ) AS bid,
              (
                SELECT o.price
                FROM ex_order o
                WHERE o.market_id = m.id
                  AND o.side = 'sell'
                  AND o.status IN ('open','partially_filled')
                ORDER BY o.price ASC, o.created_at ASC
                LIMIT 1
              ) AS ask
            FROM ex_market m
            WHERE m.id = ANY(${sql.array(marketIds)}::uuid[])
          )
          SELECT
            market_id,
            COALESCE(
              last_exec_price,
              CASE WHEN bid IS NOT NULL AND ask IS NOT NULL THEN (bid + ask) / 2 ELSE NULL END
            )::text AS price
          FROM mids
        `;
      });

      for (const r of rows) {
        const p = r.price != null ? Number(r.price) : NaN;
        if (Number.isFinite(p)) marketPrices.set(r.market_id, p);
      }
    }

    let triggered = 0;
    let attempted = 0;
    let placed = 0;
    let failed = 0;

    for (const c of candidates) {
      const current = marketPrices.get(c.market_id);
      if (current == null) continue;

      let triggerLeg: "stop" | "take_profit" = "stop";
      let placePrice = c.limit_price;

      if (c.kind === "oco") {
        const tp = c.take_profit_price != null ? Number(c.take_profit_price) : NaN;
        const stopTrig = Number(c.trigger_price);
        const stopHit = shouldTrigger(c.side, current, stopTrig);
        const tpHit = shouldTakeProfit(c.side, current, tp);
        if (!stopHit && !tpHit) continue;

        // If both appear true due to a price gap / sparse sampling, prioritize STOP (risk protection).
        if (tpHit && !stopHit) {
          triggerLeg = "take_profit";
          placePrice = String(tp);
        } else {
          triggerLeg = "stop";
          placePrice = c.limit_price;
        }
      } else {
        const triggerPrice = Number(c.trigger_price);
        if (!shouldTrigger(c.side, current, triggerPrice)) continue;
        triggerLeg = "stop";
        placePrice = c.limit_price;
      }

      triggered++;
      attempted++;

      // Mark as triggering (best-effort) to avoid parallel triggers.
      await retryOnceOnTransientDbError(async () => {
        await sql`
          UPDATE ex_conditional_order
          SET status = 'triggering',
              attempt_count = attempt_count + 1,
              last_attempt_at = now(),
              updated_at = now(),
              failure_reason = NULL
          WHERE id = ${c.id}::uuid
            AND status IN ('active','triggering')
        `;
      });

      // Place the underlying LIMIT order using the existing exchange orders handler.
      const req = new Request("http://internal/api/exchange/orders", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": c.user_id,
        },
        body: JSON.stringify({
          market_id: c.market_id,
          side: c.side,
          type: "limit",
          price: placePrice,
          quantity: c.quantity,
        }),
      });

      let placedOrderId: string | null = null;
      try {
        const resp = await placeOrder(req);
        const json = await resp.json().catch(() => null);
        placedOrderId = json?.order?.id ?? null;

        if (!resp.ok || !placedOrderId) {
          const msg = (json?.error as string) || `place_failed_${resp.status}`;
          throw new Error(msg);
        }

        placed++;

        await retryOnceOnTransientDbError(async () => {
          await sql`
            UPDATE ex_conditional_order
            SET status = 'triggered',
                triggered_at = now(),
                triggered_leg = ${triggerLeg},
                placed_order_id = ${placedOrderId}::uuid,
                updated_at = now()
            WHERE id = ${c.id}::uuid
          `;
        });
      } catch (e: any) {
        failed++;
        const reason = e?.message ? String(e.message) : "place_failed";
        // Retry later by returning to active state unless attempts exhausted.
        await retryOnceOnTransientDbError(async () => {
          await sql`
            UPDATE ex_conditional_order
            SET status = CASE WHEN attempt_count >= 10 THEN 'failed' ELSE 'active' END,
                failure_reason = ${reason},
                updated_at = now()
            WHERE id = ${c.id}::uuid
          `;
        });
      }
    }

    return Response.json({ ok: true, scanned: candidates.length, triggered, attempted, placed, failed });
  } catch (e) {
    const resp = responseForDbError("exchange.cron.conditional-orders", e);
    if (resp) return resp;
    throw e;
  }
}
