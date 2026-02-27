import { fromBigInt3818, toBigInt3818 } from "@/lib/exchange/fixed3818";
import { retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { upsertServiceHeartbeat } from "@/lib/system/heartbeat";
import type { Sql } from "postgres";

import { POST as placeOrder } from "@/app/api/exchange/orders/route";

export type ConditionalEvalResult = {
  ok: true;
  scanned: number;
  triggered: number;
  attempted: number;
  placed: number;
  failed: number;
};

type ConditionalRow = {
  id: string;
  user_id: string;
  market_id: string;
  kind: "stop_limit" | "oco" | "trailing_stop";
  side: "buy" | "sell";
  trigger_price: string;
  limit_price: string;
  take_profit_price: string | null;
  trail_bps: number | null;
  trailing_ref_price: string | null;
  trailing_stop_price: string | null;
  activated_at: string | null;
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
  return side === "sell" ? currentPrice >= takeProfitPrice : currentPrice <= takeProfitPrice;
}

function shouldActivateTrailing(side: "buy" | "sell", current: number, activation: number): boolean {
  if (!Number.isFinite(current) || !Number.isFinite(activation) || activation <= 0) return false;
  return side === "sell" ? current >= activation : current <= activation;
}

function shouldTriggerTrailing(side: "buy" | "sell", current: number, stop: number): boolean {
  if (!Number.isFinite(current) || !Number.isFinite(stop) || stop <= 0) return false;
  return side === "sell" ? current <= stop : current >= stop;
}

function toFixed18(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toFixed(18);
}

function computeTrailingStopPriceScaled(refScaled: bigint, trailBps: number, side: "buy" | "sell"): bigint {
  const denom = 10_000n;
  const bps = BigInt(Math.max(1, Math.min(10_000, Math.trunc(trailBps))));
  const num = side === "sell" ? denom - bps : denom + bps;

  const mul = refScaled * num;
  if (side === "buy") return (mul + denom - 1n) / denom;
  return mul / denom;
}

export async function runConditionalOrdersOnce(
  sql: Sql,
  opts?: {
    limit?: number;
    serviceName?: string;
  },
): Promise<ConditionalEvalResult> {
  const limit = Math.max(1, Math.min(500, Math.floor(opts?.limit ?? 50)));
  const serviceName = opts?.serviceName ?? "exchange:conditional-orders";

  const candidates = await retryOnceOnTransientDbError(async () => {
    return (await (sql as any)`
      SELECT
        id::text,
        user_id::text,
        market_id::text,
        kind,
        side,
        trigger_price::text,
        limit_price::text,
        take_profit_price::text,
        trail_bps,
        trailing_ref_price::text,
        trailing_stop_price::text,
        activated_at,
        quantity::text,
        status,
        attempt_count,
        last_attempt_at
      FROM ex_conditional_order
      WHERE kind IN ('stop_limit','oco','trailing_stop')
        AND (
          status = 'active'
          OR (
            status = 'triggering'
            AND (last_attempt_at IS NULL OR last_attempt_at < now() - interval '2 minutes')
            AND attempt_count < 10
          )
        )
      ORDER BY created_at ASC
      LIMIT ${limit}
    `) as ConditionalRow[];
  });

  const marketIds = Array.from(new Set(candidates.map((c) => c.market_id)));
  const marketPrices = new Map<string, number>();

  if (marketIds.length > 0) {
    const rows = await retryOnceOnTransientDbError(async () => {
      return (await (sql as any)`
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
          WHERE m.id = ANY(${(sql as any).array(marketIds)}::uuid[])
        )
        SELECT
          market_id,
          COALESCE(
            last_exec_price,
            CASE WHEN bid IS NOT NULL AND ask IS NOT NULL THEN (bid + ask) / 2 ELSE NULL END
          )::text AS price
        FROM mids
      `) as { market_id: string; price: string | null }[];
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

    if (c.kind === "trailing_stop") {
      const activation = Number(c.trigger_price);
      const trailBps = c.trail_bps ?? 0;
      if (!Number.isFinite(activation) || activation <= 0) continue;
      if (!Number.isInteger(trailBps) || trailBps <= 0 || trailBps > 10000) continue;

      const activated = c.activated_at != null;
      if (!activated) {
        if (!shouldActivateTrailing(c.side, current, activation)) continue;

        const refScaled = toBigInt3818(toFixed18(current));
        const stopScaled = computeTrailingStopPriceScaled(refScaled, trailBps, c.side);
        const ref = fromBigInt3818(refScaled);
        const stop = fromBigInt3818(stopScaled);

        await retryOnceOnTransientDbError(async () => {
          await (sql as any)`
            UPDATE ex_conditional_order
            SET activated_at = now(),
                trailing_ref_price = ${ref}::numeric,
                trailing_stop_price = ${stop}::numeric,
                updated_at = now()
            WHERE id = ${c.id}::uuid
              AND status = 'active'
          `;
        });
        continue;
      }

      if (!c.trailing_ref_price || !c.trailing_stop_price) continue;
      const ref = Number(c.trailing_ref_price);
      const stop = Number(c.trailing_stop_price);
      if (!Number.isFinite(ref) || ref <= 0) continue;
      if (!Number.isFinite(stop) || stop <= 0) continue;

      const favorable = c.side === "sell" ? current > ref : current < ref;
      if (favorable) {
        const refScaled = toBigInt3818(toFixed18(current));
        const stopScaled = computeTrailingStopPriceScaled(refScaled, trailBps, c.side);
        const newRef = fromBigInt3818(refScaled);
        const newStop = fromBigInt3818(stopScaled);

        await retryOnceOnTransientDbError(async () => {
          await (sql as any)`
            UPDATE ex_conditional_order
            SET trailing_ref_price = ${newRef}::numeric,
                trailing_stop_price = ${newStop}::numeric,
                updated_at = now()
            WHERE id = ${c.id}::uuid
              AND status = 'active'
          `;
        });
        continue;
      }

      if (!shouldTriggerTrailing(c.side, current, stop)) continue;
      triggerLeg = "stop";
      placePrice = c.limit_price;
    } else if (c.kind === "oco") {
      const tp = c.take_profit_price != null ? Number(c.take_profit_price) : NaN;
      const stopTrig = Number(c.trigger_price);
      const stopHit = shouldTrigger(c.side, current, stopTrig);
      const tpHit = shouldTakeProfit(c.side, current, tp);
      if (!stopHit && !tpHit) continue;

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

    triggered += 1;
    attempted += 1;

    await retryOnceOnTransientDbError(async () => {
      await (sql as any)`
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

    const req = new Request("http://internal/api/exchange/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": c.user_id,
        "x-idempotency-key": `cond:${c.id}:${triggerLeg}`,
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

      placed += 1;

      await retryOnceOnTransientDbError(async () => {
        await (sql as any)`
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
      failed += 1;
      const reason = e?.message ? String(e.message) : "place_failed";
      await retryOnceOnTransientDbError(async () => {
        await (sql as any)`
          UPDATE ex_conditional_order
          SET status = CASE WHEN attempt_count >= 10 THEN 'failed' ELSE 'active' END,
              failure_reason = ${reason},
              updated_at = now()
          WHERE id = ${c.id}::uuid
        `;
      });
    }
  }

  try {
    await upsertServiceHeartbeat(sql as any, {
      service: serviceName,
      status: failed > 0 ? "degraded" : "ok",
      details: { scanned: candidates.length, triggered, attempted, placed, failed },
    });
  } catch {
    // ignore
  }

  return { ok: true, scanned: candidates.length, triggered, attempted, placed, failed };
}
