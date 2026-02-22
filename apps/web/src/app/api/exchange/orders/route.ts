import { z } from "zod";
import { createHash } from "node:crypto";

import { apiError, apiZodError } from "@/lib/api/errors";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { logRouteResponse } from "@/lib/routeLog";
import { amount3818PositiveSchema } from "@/lib/exchange/amount";
import { bpsFeeCeil3818, fromBigInt3818, isZeroOrLess3818, toBigInt3818 } from "@/lib/exchange/fixed3818";
import { planLimitMatches, planMarketMatches } from "@/lib/exchange/matcher";
import { consumeAmountForHold, estimateMarketBuyReserve, quoteAmountForFill, reserveAmountForLimitOrder } from "@/lib/exchange/orderMath";
import { isMultipleOfStep3818 } from "@/lib/exchange/steps";
import { enqueueOutbox } from "@/lib/outbox";
import { writeAuditLog, auditContextFromRequest } from "@/lib/auditLog";
import { createNotification } from "@/lib/notifications";
import { propagateLeaderOrder } from "@/lib/exchange/copyTrading";
import { chargeGasFee } from "@/lib/exchange/gas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_FEE_USER_ID = "00000000-0000-0000-0000-000000000001";

type OrderRow = {
  id: string;
  market_id: string;
  user_id: string;
  side: "buy" | "sell";
  type: "limit" | "market";
  price: string;
  quantity: string;
  remaining_quantity: string;
  status: "open" | "partially_filled" | "filled" | "canceled";
  hold_id: string | null;
  created_at: string;
  updated_at: string;
};

const sideSchema = z.enum(["buy", "sell"]);

const timeInForceSchema = z.enum(["GTC", "IOC", "FOK"]);

const stpModeSchema = z.enum(["none", "cancel_newest", "cancel_oldest", "cancel_both"]);

const idempotencyKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9:_\-\.]+$/);

const placeOrderSchema = z.discriminatedUnion("type", [
  z.object({
    market_id: z.string().uuid(),
    side: sideSchema,
    type: z.literal("limit"),
    price: amount3818PositiveSchema,
    quantity: amount3818PositiveSchema,
    iceberg_display_quantity: amount3818PositiveSchema.optional(),
    time_in_force: timeInForceSchema.optional().default("GTC"),
    post_only: z.boolean().optional().default(false),
    stp_mode: stpModeSchema.optional().default("none"),
    reduce_only: z.boolean().optional().default(false),
    idempotency_key: idempotencyKeySchema.optional(),
  }),
  z.object({
    market_id: z.string().uuid(),
    side: sideSchema,
    type: z.literal("market"),
    quantity: amount3818PositiveSchema,
    stp_mode: stpModeSchema.optional().default("none"),
    reduce_only: z.boolean().optional().default(false),
    idempotency_key: idempotencyKeySchema.optional(),
  }),
]);

function hashIdempotencyPayload(payload: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function parseEnvInt(name: string): number | null {
  const raw = String(process.env[name] ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const v = Math.trunc(n);
  return v > 0 ? v : null;
}

function parseEnvNumber(name: string): number | null {
  const raw = String(process.env[name] ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(request: Request) {
  const startMs = Date.now();
  const sql = getSql();

  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return apiError(activeErr);

    const url = new URL(request.url);
    const marketId = url.searchParams.get("market_id");
    if (marketId && !z.string().uuid().safeParse(marketId).success) return apiError("invalid_market_id");

    const rows = await retryOnceOnTransientDbError(async () => {
      return await sql<OrderRow[]>`
        SELECT
          id,
          market_id,
          user_id,
          side,
          type,
          price::text AS price,
          quantity::text AS quantity,
          remaining_quantity::text AS remaining_quantity,
          status,
          hold_id,
          created_at,
          updated_at
        FROM ex_order
        WHERE user_id = ${actingUserId}
          AND (${marketId ?? null}::uuid IS NULL OR market_id = ${marketId ?? null}::uuid)
        ORDER BY created_at DESC
        LIMIT 100
      `;
    });

    const response = Response.json({ user_id: actingUserId, orders: rows });
    logRouteResponse(request, response, { startMs, userId: actingUserId });
    return response;
  } catch (e) {
    const resp = responseForDbError("exchange.orders.list", e);
    if (resp) return resp;
    throw e;
  }
}

export async function POST(request: Request) {
  const startMs = Date.now();
  const sql = getSql();

  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return apiError(activeErr);

    const body = await request.json().catch(() => ({}));
    let input: z.infer<typeof placeOrderSchema>;
    try {
      input = placeOrderSchema.parse(body);
    } catch (e) {
      return apiZodError(e) ?? apiError("invalid_input");
    }

    const idemScope = "exchange.orders.place";
    const headerKey = request.headers.get("x-idempotency-key")?.trim() || null;
    const idemKey = headerKey ?? (input as any).idempotency_key ?? null;
    const idemPayload =
      input.type === "limit"
        ? {
            market_id: input.market_id,
            side: input.side,
            type: input.type,
            price: input.price,
            quantity: input.quantity,
            iceberg_display_quantity: (input as any).iceberg_display_quantity ?? null,
            time_in_force: input.time_in_force,
            post_only: input.post_only,
            stp_mode: (input as any).stp_mode,
            reduce_only: (input as any).reduce_only,
          }
        : {
            market_id: input.market_id,
            side: input.side,
            type: input.type,
            quantity: input.quantity,
            stp_mode: (input as any).stp_mode,
            reduce_only: (input as any).reduce_only,
          };
    const idemHash = idemKey ? hashIdempotencyPayload(idemPayload) : null;

    const result = await sql.begin(async (tx) => {
      const txSql = tx as unknown as typeof sql;

      // Idempotency (optional): if x-idempotency-key is provided, ensure safe retries.
      if (idemKey && idemHash) {
        const rows = await txSql<
          {
            request_hash: string;
            response_json: unknown;
            status_code: number | null;
          }[]
        >`
          SELECT request_hash, response_json, status_code
          FROM app_idempotency_key
          WHERE user_id = ${actingUserId}::uuid
            AND scope = ${idemScope}
            AND idem_key = ${idemKey}
          LIMIT 1
          FOR UPDATE
        `;

        const existing = rows[0] ?? null;
        if (existing) {
          if (existing.request_hash !== idemHash) {
            return { status: 409 as const, body: { error: "idempotency_key_conflict" } };
          }

          if (existing.status_code != null && existing.response_json != null) {
            return { status: existing.status_code as any, body: existing.response_json as any };
          }
        } else {
          await txSql`
            INSERT INTO app_idempotency_key (user_id, scope, idem_key, request_hash)
            VALUES (${actingUserId}::uuid, ${idemScope}, ${idemKey}, ${idemHash})
          `;
        }
      }

      const gasErr = await chargeGasFee(txSql, {
        userId: actingUserId,
        action: "place_order",
        reference: input.market_id,
      });
      if (gasErr) return { status: 409 as const, body: { error: gasErr.code, details: gasErr.details } };

      const finalizeHoldIfTerminal = async (orderId: string, holdId: string | null): Promise<void> => {
        if (!holdId) return;

        const orderRows = await txSql<{ status: string }[]>`
          SELECT status
          FROM ex_order
          WHERE id = ${orderId}::uuid
          LIMIT 1
        `;
        const status = orderRows[0]?.status;
        if (status !== "filled" && status !== "canceled") return;

        const holdRows = await txSql<{ remaining_amount: string; status: string }[]>`
          SELECT remaining_amount::text AS remaining_amount, status
          FROM ex_hold
          WHERE id = ${holdId}::uuid
          LIMIT 1
          FOR UPDATE
        `;
        const hold = holdRows[0];
        if (!hold) return;
        if (hold.status !== "active") return;

        if (isZeroOrLess3818(hold.remaining_amount)) {
          await txSql`
            UPDATE ex_hold
            SET remaining_amount = 0, status = 'consumed'
            WHERE id = ${holdId}::uuid AND status = 'active'
          `;
          return;
        }

        await txSql`
          UPDATE ex_hold
          SET status = 'released', released_at = now()
          WHERE id = ${holdId}::uuid AND status = 'active'
        `;
      };

      // Per-market serialized matching (simple but safe for MVP).
      await txSql`SELECT pg_advisory_xact_lock(hashtext(${input.market_id}::text))`;

      const markets = await txSql<
        {
          id: string;
          chain: string;
          symbol: string;
          base_asset_id: string;
          quote_asset_id: string;
          status: string;
          halt_until: string | null;
          tick_size: string;
          lot_size: string;
          maker_fee_bps: number;
          taker_fee_bps: number;
        }[]
      >`
        SELECT
          id,
          chain,
          symbol,
          base_asset_id,
          quote_asset_id,
          status,
          halt_until::text AS halt_until,
          tick_size::text AS tick_size,
          lot_size::text AS lot_size,
          maker_fee_bps,
          taker_fee_bps
        FROM ex_market
        WHERE id = ${input.market_id}
        LIMIT 1
      `;

      if (markets.length === 0) return { status: 404 as const, body: { error: "market_not_found" } };
      const market = markets[0]!;
      if (market.status !== "enabled") return { status: 409 as const, body: { error: "market_disabled" } };

      if (market.halt_until) {
        const untilMs = Date.parse(market.halt_until);
        if (Number.isFinite(untilMs) && untilMs > Date.now()) {
          return { status: 409 as const, body: { error: "market_halted", details: { halt_until: market.halt_until } } };
        }
      }

      // --- Basic risk limits (env-gated) ---
      // Keep these simple and tunable for ops.
      const maxOpenOrders = parseEnvInt("EXCHANGE_MAX_OPEN_ORDERS_PER_USER");
      if (maxOpenOrders) {
        const rows = await txSql<{ n: number }[]>`
          SELECT count(*)::int AS n
          FROM ex_order
          WHERE user_id = ${actingUserId}::uuid
            AND status IN ('open','partially_filled')
        `;
        const n = rows[0]?.n ?? 0;
        if (n >= maxOpenOrders) {
          return { status: 409 as const, body: { error: "open_orders_limit" } };
        }
      }

      const maxNotional = parseEnvNumber("EXCHANGE_MAX_ORDER_NOTIONAL");
      if (maxNotional) {
        // Use limit price when available; for market orders, approximate from last exec or best book.
        let px: number | null = null;
        if (input.type === "limit") {
          const p = Number(input.price);
          px = Number.isFinite(p) && p > 0 ? p : null;
        } else {
          const rows = await txSql<{ last_exec_price: string | null; bid: string | null; ask: string | null }[]>`
            SELECT
              (
                SELECT e.price::text
                FROM ex_execution e
                WHERE e.market_id = ${market.id}::uuid
                ORDER BY e.created_at DESC
                LIMIT 1
              ) AS last_exec_price,
              (
                SELECT o.price::text
                FROM ex_order o
                WHERE o.market_id = ${market.id}::uuid
                  AND o.side = 'buy'
                  AND o.status IN ('open','partially_filled')
                  AND o.user_id <> ${actingUserId}::uuid
                ORDER BY o.price DESC, o.created_at ASC
                LIMIT 1
              ) AS bid,
              (
                SELECT o.price::text
                FROM ex_order o
                WHERE o.market_id = ${market.id}::uuid
                  AND o.side = 'sell'
                  AND o.status IN ('open','partially_filled')
                  AND o.user_id <> ${actingUserId}::uuid
                ORDER BY o.price ASC, o.created_at ASC
                LIMIT 1
              ) AS ask
          `;
          const r = rows[0];
          const ask = r?.ask != null ? Number(r.ask) : NaN;
          const bid = r?.bid != null ? Number(r.bid) : NaN;
          const last = r?.last_exec_price != null ? Number(r.last_exec_price) : NaN;

          if (input.side === "buy") {
            px = Number.isFinite(ask) && ask > 0 ? ask : Number.isFinite(last) && last > 0 ? last : Number.isFinite(bid) && bid > 0 ? bid : null;
          } else {
            px = Number.isFinite(bid) && bid > 0 ? bid : Number.isFinite(last) && last > 0 ? last : Number.isFinite(ask) && ask > 0 ? ask : null;
          }
        }

        const qty = Number(input.quantity);
        if (px && Number.isFinite(qty) && qty > 0) {
          const notional = px * qty;
          if (Number.isFinite(notional) && notional > maxNotional) {
            return { status: 409 as const, body: { error: "order_notional_too_large", details: { max: maxNotional } } };
          }
        }
      }

      // Price-band protection (limit orders only).
      // Prevents fat-fingered limit orders far away from current trading range.
      const bandBps = parseEnvInt("EXCHANGE_PRICE_BAND_BPS");
      if (bandBps && input.type === "limit") {
        const rows = await txSql<{ last_exec_price: string | null; bid: string | null; ask: string | null }[]>`
          SELECT
            (
              SELECT e.price::text
              FROM ex_execution e
              WHERE e.market_id = ${market.id}::uuid
              ORDER BY e.created_at DESC
              LIMIT 1
            ) AS last_exec_price,
            (
              SELECT o.price::text
              FROM ex_order o
              WHERE o.market_id = ${market.id}::uuid
                AND o.side = 'buy'
                AND o.status IN ('open','partially_filled')
              ORDER BY o.price DESC, o.created_at ASC
              LIMIT 1
            ) AS bid,
            (
              SELECT o.price::text
              FROM ex_order o
              WHERE o.market_id = ${market.id}::uuid
                AND o.side = 'sell'
                AND o.status IN ('open','partially_filled')
              ORDER BY o.price ASC, o.created_at ASC
              LIMIT 1
            ) AS ask
        `;

        const r = rows[0];
        const last = r?.last_exec_price != null ? Number(r.last_exec_price) : NaN;
        const bid = r?.bid != null ? Number(r.bid) : NaN;
        const ask = r?.ask != null ? Number(r.ask) : NaN;
        const mid = Number.isFinite(bid) && bid > 0 && Number.isFinite(ask) && ask > 0 ? (bid + ask) / 2 : NaN;

        const ref = Number.isFinite(last) && last > 0 ? last : Number.isFinite(mid) && mid > 0 ? mid : null;
        const p = Number(input.price);

        if (ref && Number.isFinite(p) && p > 0) {
          const deviationBps = Math.abs((p - ref) / ref) * 10_000;
          if (Number.isFinite(deviationBps) && deviationBps > bandBps) {
            const circuitSeconds = parseEnvInt("EXCHANGE_CIRCUIT_BREAKER_SECONDS");
            if (circuitSeconds) {
              await txSql`
                UPDATE ex_market
                SET halt_until = GREATEST(
                  COALESCE(halt_until, now()),
                  now() + make_interval(secs => ${circuitSeconds})
                )
                WHERE id = ${market.id}::uuid
              `;
            }

            const min = ref * (1 - bandBps / 10_000);
            const max = ref * (1 + bandBps / 10_000);
            return {
              status: 409 as const,
              body: {
                error: "exchange_price_out_of_band",
                details: {
                  reference_price: String(ref),
                  band_bps: bandBps,
                  min_price: String(min),
                  max_price: String(max),
                },
              },
            };
          }
        }
      }

      const isMarket = input.type === "market";
      const timeInForce = input.type === "limit" ? input.time_in_force : "IOC";
      const postOnly = input.type === "limit" ? input.post_only : false;
      const inputPrice = input.type === "limit" ? input.price : "0";

      // --- Iceberg (limit only) ---
      const icebergDisplayQty = input.type === "limit" ? (input as any).iceberg_display_quantity : undefined;
      const icebergDisplayQtySql: string | null = icebergDisplayQty != null ? String(icebergDisplayQty) : null;
      if (icebergDisplayQty != null && input.type !== "limit") {
        return { status: 400 as const, body: { error: "invalid_input", details: "iceberg_limit_only" } };
      }

      if (icebergDisplayQty != null) {
        if (timeInForce !== "GTC") {
          return { status: 400 as const, body: { error: "invalid_input", details: "iceberg_gtc_only" } };
        }
        if (!isMultipleOfStep3818(String(icebergDisplayQty), market.lot_size)) {
          return {
            status: 400 as const,
            body: { error: "iceberg_display_not_multiple_of_lot", details: { lot_size: market.lot_size } },
          };
        }

        const disp = toBigInt3818(String(icebergDisplayQty));
        const total = toBigInt3818(String((input as any).quantity));
        if (disp <= 0n || disp >= total) {
          return { status: 400 as const, body: { error: "invalid_input", details: "iceberg_display_must_be_lt_total" } };
        }
      }

      // --- Self-trade prevention (STP) modes ---
      // The matcher excludes same-user makers, but that can still create a crossed self-book.
      // STP defines what to do when the incoming order would cross against the user's own resting orders.
      const stpMode = (input as any).stp_mode as z.infer<typeof stpModeSchema>;
      if (stpMode && stpMode !== "none") {
        const makerSide = input.side === "buy" ? "sell" : "buy";
        const crossers = await txSql<{ id: string; hold_id: string | null }[]>`
          SELECT id::text AS id, hold_id::text AS hold_id
          FROM ex_order
          WHERE market_id = ${market.id}::uuid
            AND user_id = ${actingUserId}::uuid
            AND side = ${makerSide}
            AND status IN ('open','partially_filled')
            AND remaining_quantity > 0
            AND (
              ${isMarket}::boolean = true
              OR (${input.side} = 'buy' AND price <= (${inputPrice}::numeric))
              OR (${input.side} = 'sell' AND price >= (${inputPrice}::numeric))
            )
          ORDER BY
            CASE WHEN ${input.side} = 'buy' THEN price END ASC,
            CASE WHEN ${input.side} = 'sell' THEN price END DESC,
            created_at ASC
          LIMIT 200
          FOR UPDATE
        `;

        if (crossers.length > 0) {
          if (stpMode === "cancel_oldest" || stpMode === "cancel_both") {
            for (const c of crossers) {
              await txSql`
                UPDATE ex_order
                SET status = 'canceled', updated_at = now()
                WHERE id = ${c.id}::uuid
                  AND user_id = ${actingUserId}::uuid
                  AND status IN ('open','partially_filled')
              `;
              await finalizeHoldIfTerminal(c.id, c.hold_id);
            }
          }

          if (stpMode === "cancel_newest") {
            return {
              status: 409 as const,
              body: { error: "stp_cancel_newest", details: { crossing_orders: crossers.length } },
            };
          }
          if (stpMode === "cancel_both") {
            return {
              status: 409 as const,
              body: { error: "stp_cancel_both", details: { crossing_orders: crossers.length } },
            };
          }
        }
      }

      // Tick-size validation (limit only — market orders have no price)
      if (input.type === "limit" && !isMultipleOfStep3818(input.price, market.tick_size)) {
        return { status: 400 as const, body: { error: "price_not_multiple_of_tick", details: { tick_size: market.tick_size } } };
      }

      if (!isMultipleOfStep3818(input.quantity, market.lot_size)) {
        return { status: 400 as const, body: { error: "quantity_not_multiple_of_lot", details: { lot_size: market.lot_size } } };
      }

      const reserveAssetId = input.side === "buy" ? market.quote_asset_id : market.base_asset_id;
      const maxFeeBps = Math.max(market.maker_fee_bps ?? 0, market.taker_fee_bps ?? 0);

      // --- Post-only and FOK checks (limit orders only) ---
      if (!isMarket && (postOnly || timeInForce === "FOK")) {
        const makerSide = input.side === "buy" ? "sell" : "buy";

        const makers = await txSql<{ id: string; price: string; remaining_quantity: string; created_at: string }[]>`
          SELECT id::text AS id, price::text AS price, remaining_quantity::text AS remaining_quantity, created_at::text AS created_at
          FROM ex_order
          WHERE market_id = ${market.id}::uuid
            AND side = ${makerSide}
            AND status IN ('open','partially_filled')
            AND remaining_quantity > 0
            AND user_id <> ${actingUserId}::uuid
            AND (
              (${input.side} = 'buy' AND price <= (${inputPrice}::numeric))
              OR (${input.side} = 'sell' AND price >= (${inputPrice}::numeric))
            )
          ORDER BY
            CASE WHEN ${input.side} = 'buy' THEN price END ASC,
            CASE WHEN ${input.side} = 'sell' THEN price END DESC,
            created_at ASC
          LIMIT 200
        `;

        if (postOnly && makers.length > 0) {
          return { status: 409 as const, body: { error: "post_only_would_take" } };
        }

        if (timeInForce === "FOK") {
          const planned = planLimitMatches({
            taker: {
              id: "00000000-0000-0000-0000-000000000000",
              side: input.side,
              price: inputPrice,
              remaining_quantity: input.quantity,
              created_at: new Date().toISOString(),
            },
            makers: makers.map((m) => ({
              id: m.id,
              side: makerSide as any,
              price: m.price,
              remaining_quantity: m.remaining_quantity,
              created_at: m.created_at,
            })),
            maxFills: 200,
          });

          if (!isZeroOrLess3818(planned.taker_remaining_quantity)) {
            return { status: 409 as const, body: { error: "fok_insufficient_liquidity" } };
          }
        }
      }

      // --- Reserve amount calculation ---
      let reserveAmount: string;
      if (isMarket && input.side === "buy") {
        // For market buys, estimate cost from resting asks
        const restingAsks = await txSql<{ price: string; remaining_quantity: string }[]>`
          SELECT price::text AS price, remaining_quantity::text AS remaining_quantity
          FROM ex_order
          WHERE market_id = ${market.id}::uuid
            AND side = 'sell'
            AND status IN ('open', 'partially_filled')
            AND user_id <> ${actingUserId}::uuid
            AND remaining_quantity > 0
          ORDER BY price ASC, created_at ASC
          LIMIT 200
        `;
        const est = estimateMarketBuyReserve(input.quantity, restingAsks, { maxFeeBps });
        if (!est) {
          return { status: 409 as const, body: { error: "insufficient_liquidity", details: { available_asks: restingAsks.length } } };
        }
        reserveAmount = est;
      } else if (isMarket) {
        // Market sell: reserve base quantity
        reserveAmount = input.quantity;
      } else {
        // Limit order
        reserveAmount = reserveAmountForLimitOrder(input.side, inputPrice, input.quantity, { maxFeeBps });
      }

      const accountRows = await txSql<{ id: string }[]>`
        INSERT INTO ex_ledger_account (user_id, asset_id)
        VALUES (${actingUserId}, ${reserveAssetId}::uuid)
        ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
        RETURNING id
      `;
      const accountId = accountRows[0]!.id;

      const balRows = await txSql<{ posted: string; held: string; available: string; ok: boolean }[]>`
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
          ((posted.posted - held.held) >= (${reserveAmount}::numeric)) AS ok
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
              requested: reserveAmount,
            },
          },
        };
      }

      const orderRows = await txSql<OrderRow[]>`
        INSERT INTO ex_order (
          market_id,
          user_id,
          side,
          type,
          price,
          quantity,
          remaining_quantity,
          iceberg_display_quantity,
          iceberg_hidden_remaining,
          status
        )
        VALUES (
          ${market.id}::uuid,
          ${actingUserId}::uuid,
          ${input.side},
          ${input.type},
          (${inputPrice}::numeric),
          (${input.quantity}::numeric),
          (
            CASE
              WHEN ${icebergDisplayQtySql}::numeric IS NULL THEN (${input.quantity}::numeric)
              ELSE (${icebergDisplayQtySql}::numeric)
            END
          ),
          (${icebergDisplayQtySql}::numeric),
          (
            CASE
              WHEN ${icebergDisplayQtySql}::numeric IS NULL THEN 0
              ELSE greatest((${input.quantity}::numeric) - (${icebergDisplayQtySql}::numeric), 0)
            END
          ),
          'open'
        )
        RETURNING
          id,
          market_id,
          user_id,
          side,
          type,
          price::text AS price,
          quantity::text AS quantity,
          remaining_quantity::text AS remaining_quantity,
          status,
          hold_id,
          created_at,
          updated_at
      `;

      const order = orderRows[0]!;

      const holdRows = await txSql<{ id: string; amount: string; remaining_amount: string; status: string; created_at: string }[]>`
        INSERT INTO ex_hold (account_id, asset_id, amount, remaining_amount, reason)
        VALUES (${accountId}, ${reserveAssetId}::uuid, (${reserveAmount}::numeric), (${reserveAmount}::numeric), ${`order:${order.id}`})
        RETURNING id, amount::text AS amount, remaining_amount::text AS remaining_amount, status, created_at
      `;

      const holdId = holdRows[0]!.id;

      const updatedOrderRows = await txSql<OrderRow[]>`
        UPDATE ex_order
        SET hold_id = ${holdId}::uuid, updated_at = now()
        WHERE id = ${order.id}::uuid
        RETURNING
          id,
          market_id,
          user_id,
          side,
          type,
          price::text AS price,
          quantity::text AS quantity,
          remaining_quantity::text AS remaining_quantity,
          status,
          hold_id,
          created_at,
          updated_at
      `;

      let taker = updatedOrderRows[0]!;
      const executions: Array<{
        id: string;
        price: string;
        quantity: string;
        maker_order_id: string;
        taker_order_id: string;
        created_at: string;
      }> = [];

      const makerSide = taker.side === "buy" ? "sell" : "buy";
      const makerFillNotifs: Array<{ userId: string; orderId: string; side: string; fillQty: string; price: string; isFilled: boolean }> = [];

      let fillCount = 0;
      while (fillCount < 200) {
        const remaining = await txSql<{ remaining: string; status: string }[]>`
          SELECT remaining_quantity::text AS remaining, status
          FROM ex_order
          WHERE id = ${taker.id}::uuid
          LIMIT 1
        `;
        const takerRemaining = remaining[0]?.remaining ?? "0";
        const takerStatus = remaining[0]?.status ?? taker.status;
        if (takerStatus === "filled" || isZeroOrLess3818(takerRemaining)) break;

        const makers = await txSql<
          {
            id: string;
            user_id: string;
            side: "buy" | "sell";
            price: string;
            remaining_quantity: string;
            iceberg_display_quantity: string | null;
            iceberg_hidden_remaining: string;
            hold_id: string | null;
            created_at: string;
          }[]
        >`
          SELECT
            id,
            user_id,
            side,
            price::text AS price,
            remaining_quantity::text AS remaining_quantity,
            iceberg_display_quantity::text AS iceberg_display_quantity,
            iceberg_hidden_remaining::text AS iceberg_hidden_remaining,
            hold_id,
            created_at
          FROM ex_order
          WHERE market_id = ${market.id}::uuid
            AND side = ${makerSide}
            AND status IN ('open','partially_filled')
            AND remaining_quantity > 0
            AND id <> ${taker.id}::uuid
            AND user_id <> ${taker.user_id}::uuid
            AND (
              ${isMarket}::boolean = true
              OR (${taker.side} = 'buy' AND price <= (${taker.price}::numeric))
              OR (${taker.side} = 'sell' AND price >= (${taker.price}::numeric))
            )
          ORDER BY
            CASE WHEN ${taker.side} = 'buy' THEN price END ASC,
            CASE WHEN ${taker.side} = 'sell' THEN price END DESC,
            created_at ASC
          LIMIT 200
          FOR UPDATE
        `;

        const makersById = new Map(makers.map((m) => [m.id, m] as const));

        const planned = isMarket
          ? planMarketMatches({
              taker: {
                id: taker.id,
                side: taker.side,
                remaining_quantity: takerRemaining,
                created_at: taker.created_at,
              },
              makers: makers.map((m) => ({
                id: m.id,
                side: m.side,
                price: m.price,
                remaining_quantity: m.remaining_quantity,
                created_at: m.created_at,
              })),
              maxFills: 1,
            })
          : planLimitMatches({
              taker: {
                id: taker.id,
                side: taker.side,
                price: taker.price,
                remaining_quantity: takerRemaining,
                created_at: taker.created_at,
              },
              makers: makers.map((m) => ({
                id: m.id,
                side: m.side,
                price: m.price,
                remaining_quantity: m.remaining_quantity,
                created_at: m.created_at,
              })),
              maxFills: 1,
            });

        const fill = planned.fills[0] ?? null;
        if (!fill) break;

        const maker = makersById.get(fill.maker_order_id);
        if (!maker) break;

        const fillQty = fill.quantity;
        if (isZeroOrLess3818(fillQty)) continue;

        const execPrice = fill.price; // maker price (price-time priority)

        // Settlement amounts
        const quoteAmt = quoteAmountForFill(fillQty, execPrice);

        const makerFeeQuote = bpsFeeCeil3818(quoteAmt, market.maker_fee_bps ?? 0);
        const takerFeeQuote = bpsFeeCeil3818(quoteAmt, market.taker_fee_bps ?? 0);

        const buyerUserId = taker.side === "buy" ? taker.user_id : maker.user_id;
        const sellerUserId = taker.side === "sell" ? taker.user_id : maker.user_id;

        // Ensure accounts exist
        const acctRows = await txSql<{ user_id: string; asset_id: string; id: string }[]>`
          WITH upserts AS (
            INSERT INTO ex_ledger_account (user_id, asset_id)
            VALUES
              (${buyerUserId}::uuid, ${market.base_asset_id}::uuid),
              (${buyerUserId}::uuid, ${market.quote_asset_id}::uuid),
              (${sellerUserId}::uuid, ${market.base_asset_id}::uuid),
              (${sellerUserId}::uuid, ${market.quote_asset_id}::uuid)
            ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
            RETURNING user_id, asset_id, id
          )
          SELECT user_id::text AS user_id, asset_id::text AS asset_id, id::text AS id FROM upserts
        `;

        const acct = (userId: string, assetId: string) => acctRows.find((r) => r.user_id === userId && r.asset_id === assetId)?.id;

        const buyerBaseAcct = acct(buyerUserId, market.base_asset_id);
        const buyerQuoteAcct = acct(buyerUserId, market.quote_asset_id);
        const sellerBaseAcct = acct(sellerUserId, market.base_asset_id);
        const sellerQuoteAcct = acct(sellerUserId, market.quote_asset_id);
        if (!buyerBaseAcct || !buyerQuoteAcct || !sellerBaseAcct || !sellerQuoteAcct) {
          return { status: 500 as const, body: { error: "not_found", details: "missing_accounts" } };
        }

        const makerQuoteAcct = acct(maker.user_id, market.quote_asset_id);
        const takerQuoteAcct = acct(taker.user_id, market.quote_asset_id);
        if (!makerQuoteAcct || !takerQuoteAcct) {
          return { status: 500 as const, body: { error: "not_found", details: "missing_accounts_maker_taker" } };
        }

        const feeAcctRows = await txSql<{ id: string }[]>`
          INSERT INTO ex_ledger_account (user_id, asset_id)
          VALUES (${SYSTEM_FEE_USER_ID}::uuid, ${market.quote_asset_id}::uuid)
          ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
          RETURNING id
        `;
        const feeCollectorQuoteAcct = feeAcctRows[0]?.id;
        if (!feeCollectorQuoteAcct) {
          return { status: 500 as const, body: { error: "not_found", details: "missing_fee_collector_account" } };
        }

        // Create execution
        const execRows = await txSql<{ id: string; created_at: string }[]>`
          INSERT INTO ex_execution (market_id, price, quantity, maker_order_id, taker_order_id, maker_fee_quote, taker_fee_quote)
          VALUES (
            ${market.id}::uuid,
            (${execPrice}::numeric),
            (${fillQty}::numeric),
            ${maker.id}::uuid,
            ${taker.id}::uuid,
            (${makerFeeQuote}::numeric),
            (${takerFeeQuote}::numeric)
          )
          RETURNING id, created_at
        `;
        executions.push({
          id: execRows[0]!.id,
          price: execPrice,
          quantity: fillQty,
          maker_order_id: maker.id,
          taker_order_id: taker.id,
          created_at: execRows[0]!.created_at,
        });

        // Ledger journal entry (balanced per asset)
        const entryRows = await (txSql as any)<{ id: string }[]>`
          INSERT INTO ex_journal_entry (type, reference, metadata_json)
          VALUES (
            'trade',
            ${`${market.symbol} ${fillQty}@${execPrice}`},
            ${{ market_id: market.id, maker_order_id: maker.id, taker_order_id: taker.id }}::jsonb
          )
          RETURNING id
        `;
        const entryId = entryRows[0]!.id;

        await txSql`
          INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
          VALUES
            -- base: buyer +qty, seller -qty
            (${entryId}::uuid, ${buyerBaseAcct}::uuid, ${market.base_asset_id}::uuid, (${fillQty}::numeric)),
            (${entryId}::uuid, ${sellerBaseAcct}::uuid, ${market.base_asset_id}::uuid, ((${fillQty}::numeric) * -1)),
            -- quote: buyer -q, seller +q
            (${entryId}::uuid, ${buyerQuoteAcct}::uuid, ${market.quote_asset_id}::uuid, ((${quoteAmt}::numeric) * -1)),
            (${entryId}::uuid, ${sellerQuoteAcct}::uuid, ${market.quote_asset_id}::uuid, (${quoteAmt}::numeric))
        `;

        // Fees in quote asset: debit maker/taker quote accounts, credit fee collector.
        const feeLines: Array<{ accountId: string; amountSigned: string }> = [];
        if (!isZeroOrLess3818(makerFeeQuote)) {
          feeLines.push({ accountId: makerQuoteAcct, amountSigned: `-${makerFeeQuote}` });
        }
        if (!isZeroOrLess3818(takerFeeQuote)) {
          feeLines.push({ accountId: takerQuoteAcct, amountSigned: `-${takerFeeQuote}` });
        }

        if (feeLines.length > 0) {
          // We can't build a SQL VALUES list with dynamic row count via postgres.js template safely here,
          // so insert fee lines with separate statements (small N, safe for MVP).
          for (const fl of feeLines) {
            await txSql`
              INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
              VALUES (${entryId}::uuid, ${fl.accountId}::uuid, ${market.quote_asset_id}::uuid, (${fl.amountSigned}::numeric))
            `;
          }

          let totalFeeScaled = 0n;
          if (!isZeroOrLess3818(makerFeeQuote)) totalFeeScaled += toBigInt3818(makerFeeQuote);
          if (!isZeroOrLess3818(takerFeeQuote)) totalFeeScaled += toBigInt3818(takerFeeQuote);
          const feeCredit = fromBigInt3818(totalFeeScaled);

          await txSql`
            INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
            VALUES (${entryId}::uuid, ${feeCollectorQuoteAcct}::uuid, ${market.quote_asset_id}::uuid, (${feeCredit}::numeric))
          `;
        }

        // Update orders remaining + status
        await txSql`
          UPDATE ex_order
          SET
            remaining_quantity = CASE
              WHEN (remaining_quantity - (${fillQty}::numeric)) <= 0
                AND iceberg_hidden_remaining > 0
                AND iceberg_display_quantity IS NOT NULL
              THEN LEAST(iceberg_display_quantity, iceberg_hidden_remaining)
              ELSE remaining_quantity - (${fillQty}::numeric)
            END,
            iceberg_hidden_remaining = CASE
              WHEN (remaining_quantity - (${fillQty}::numeric)) <= 0
                AND iceberg_hidden_remaining > 0
                AND iceberg_display_quantity IS NOT NULL
              THEN GREATEST(iceberg_hidden_remaining - LEAST(iceberg_display_quantity, iceberg_hidden_remaining), 0)
              ELSE iceberg_hidden_remaining
            END,
            created_at = CASE
              WHEN (remaining_quantity - (${fillQty}::numeric)) <= 0
                AND iceberg_hidden_remaining > 0
                AND iceberg_display_quantity IS NOT NULL
              THEN now()
              ELSE created_at
            END,
            status = CASE
              WHEN (remaining_quantity - (${fillQty}::numeric)) <= 0
                AND iceberg_hidden_remaining > 0
                AND iceberg_display_quantity IS NOT NULL
              THEN 'partially_filled'
              WHEN (remaining_quantity - (${fillQty}::numeric)) <= 0 THEN 'filled'
              ELSE 'partially_filled'
            END,
            updated_at = now()
          WHERE id = ${maker.id}::uuid
        `;

        // Track maker fill for notification
        const makerAfterRows = await txSql<{ remaining: string; hidden: string; status: string }[]>`
          SELECT remaining_quantity::text AS remaining, iceberg_hidden_remaining::text AS hidden, status
          FROM ex_order
          WHERE id = ${maker.id}::uuid
          LIMIT 1
        `;
        const makerAfter = makerAfterRows[0];
        const makerIsFilled = makerAfter?.status === "filled" ||
          (makerAfter ? (isZeroOrLess3818(makerAfter.remaining) && isZeroOrLess3818(makerAfter.hidden)) : false);
        makerFillNotifs.push({
          userId: maker.user_id,
          orderId: maker.id,
          side: maker.side,
          fillQty,
          price: execPrice,
          isFilled: makerIsFilled,
        });

        await txSql`
          UPDATE ex_order
          SET
            remaining_quantity = CASE
              WHEN (remaining_quantity - (${fillQty}::numeric)) <= 0
                AND iceberg_hidden_remaining > 0
                AND iceberg_display_quantity IS NOT NULL
              THEN LEAST(iceberg_display_quantity, iceberg_hidden_remaining)
              ELSE remaining_quantity - (${fillQty}::numeric)
            END,
            iceberg_hidden_remaining = CASE
              WHEN (remaining_quantity - (${fillQty}::numeric)) <= 0
                AND iceberg_hidden_remaining > 0
                AND iceberg_display_quantity IS NOT NULL
              THEN GREATEST(iceberg_hidden_remaining - LEAST(iceberg_display_quantity, iceberg_hidden_remaining), 0)
              ELSE iceberg_hidden_remaining
            END,
            created_at = CASE
              WHEN (remaining_quantity - (${fillQty}::numeric)) <= 0
                AND iceberg_hidden_remaining > 0
                AND iceberg_display_quantity IS NOT NULL
              THEN now()
              ELSE created_at
            END,
            status = CASE
              WHEN (remaining_quantity - (${fillQty}::numeric)) <= 0
                AND iceberg_hidden_remaining > 0
                AND iceberg_display_quantity IS NOT NULL
              THEN 'partially_filled'
              WHEN (remaining_quantity - (${fillQty}::numeric)) <= 0 THEN 'filled'
              ELSE 'partially_filled'
            END,
            updated_at = now()
          WHERE id = ${taker.id}::uuid
        `;

        // Consume holds proportionally
        const makerConsume = consumeAmountForHold(maker.side, fillQty, quoteAmt, makerFeeQuote);
        const takerConsume = consumeAmountForHold(taker.side, fillQty, quoteAmt, takerFeeQuote);

        if (maker.hold_id) {
          await txSql`
            UPDATE ex_hold
            SET
              remaining_amount = greatest(remaining_amount - (${makerConsume}::numeric), 0),
              status = CASE
                WHEN (remaining_amount - (${makerConsume}::numeric)) <= 0 THEN 'consumed'
                ELSE status
              END
            WHERE id = ${maker.hold_id}::uuid AND status = 'active'
          `;
        }

        if (taker.hold_id) {
          await txSql`
            UPDATE ex_hold
            SET
              remaining_amount = greatest(remaining_amount - (${takerConsume}::numeric), 0),
              status = CASE
                WHEN (remaining_amount - (${takerConsume}::numeric)) <= 0 THEN 'consumed'
                ELSE status
              END
            WHERE id = ${taker.hold_id}::uuid AND status = 'active'
          `;
        }

        await finalizeHoldIfTerminal(maker.id, maker.hold_id);
        await finalizeHoldIfTerminal(taker.id, taker.hold_id);

        // Refresh taker snapshot
        const takerRows = await txSql<OrderRow[]>`
          SELECT
            id,
            market_id,
            user_id,
            side,
            type,
            price::text AS price,
            quantity::text AS quantity,
            remaining_quantity::text AS remaining_quantity,
            status,
            hold_id,
            created_at,
            updated_at
          FROM ex_order
          WHERE id = ${taker.id}::uuid
          LIMIT 1
        `;
        taker = takerRows[0]!;

        fillCount += 1;
      }

      await finalizeHoldIfTerminal(taker.id, taker.hold_id);

      // --- IOC cancellation for market orders: cancel any unfilled remainder ---
      if (isMarket && !isZeroOrLess3818(taker.remaining_quantity) && taker.status !== "filled") {
        await txSql`
          UPDATE ex_order
          SET status = 'canceled', updated_at = now()
          WHERE id = ${taker.id}::uuid
            AND status IN ('open', 'partially_filled')
        `;

        // Release the hold for any remaining amount
        await finalizeHoldIfTerminal(taker.id, taker.hold_id);

        // Refresh taker snapshot
        const canceledRows = await txSql<OrderRow[]>`
          SELECT
            id, market_id, user_id, side, type,
            price::text AS price, quantity::text AS quantity,
            remaining_quantity::text AS remaining_quantity,
            status, hold_id, created_at, updated_at
          FROM ex_order WHERE id = ${taker.id}::uuid LIMIT 1
        `;
        taker = canceledRows[0]!;
      }

      // --- IOC cancellation for limit orders ---
      if (!isMarket && timeInForce === "IOC" && !isZeroOrLess3818(taker.remaining_quantity) && taker.status !== "filled") {
        await txSql`
          UPDATE ex_order
          SET status = 'canceled', updated_at = now()
          WHERE id = ${taker.id}::uuid
            AND status IN ('open', 'partially_filled')
        `;

        await finalizeHoldIfTerminal(taker.id, taker.hold_id);

        const canceledRows = await txSql<OrderRow[]>`
          SELECT
            id, market_id, user_id, side, type,
            price::text AS price, quantity::text AS quantity,
            remaining_quantity::text AS remaining_quantity,
            status, hold_id, created_at, updated_at
          FROM ex_order WHERE id = ${taker.id}::uuid LIMIT 1
        `;
        taker = canceledRows[0]!;
      }

      // --- Notifications for makers ---
      for (const mf of makerFillNotifs) {
        await createNotification(txSql, {
          userId: mf.userId,
          type: mf.isFilled ? "order_filled" : "order_partially_filled",
          title: mf.isFilled ? "Order Filled" : "Order Partially Filled",
          body: `Your ${mf.side} order was ${mf.isFilled ? "fully" : "partially"} filled: ${mf.fillQty} @ ${mf.price} on ${market.symbol}`,
          metadata: { orderId: mf.orderId, fillQty: mf.fillQty, price: mf.price, market: market.symbol },
        });
      }

      // --- Notification for taker ---
      if (executions.length > 0 || taker.status === "canceled") {
        const notifType =
          taker.status === "filled"
            ? "order_filled"
            : taker.status === "canceled"
              ? "order_canceled"
              : "order_partially_filled";
        const notifTitle =
          taker.status === "filled"
            ? "Order Filled"
            : taker.status === "canceled"
              ? (isMarket ? "Market Order Canceled (IOC)" : "Limit Order Canceled (IOC)")
              : "Order Partially Filled";
        await createNotification(txSql, {
          userId: taker.user_id,
          type: notifType as any,
          title: notifTitle,
          body: `Your ${taker.side} ${taker.type} order on ${market.symbol} — ${executions.length} fill(s)`,
          metadata: { orderId: taker.id, market: market.symbol, fills: executions.length },
        });
      }

      // --- Notification for an accepted open order (no immediate fills) ---
      if (executions.length === 0 && (taker.status === "open" || taker.status === "partially_filled")) {
        await createNotification(txSql, {
          userId: taker.user_id,
          type: "order_placed" as any,
          title: "Order Placed",
          body: `Your ${taker.side} ${taker.type} order was placed on ${market.symbol}.`,
          metadata: { orderId: taker.id, market: market.symbol },
        });
      }

      await enqueueOutbox(txSql, {
        topic: "ex.order.placed",
        aggregate_type: "order",
        aggregate_id: taker.id,
        payload: {
          order: taker,
          executions,
        },
      });

      // Persist idempotency result (success only) so retries can safely replay.
      if (idemKey) {
        await txSql`
          UPDATE app_idempotency_key
          SET response_json = ${(txSql as any).json({ order: taker, executions })}::jsonb,
              status_code = 201,
              updated_at = now()
          WHERE user_id = ${actingUserId}::uuid
            AND scope = ${idemScope}
            AND idem_key = ${idemKey}
            AND request_hash = ${idemHash}
        `;
      }

      return { status: 201 as const, body: { order: taker, executions } };
    });

    const err = result.body as { error?: string; details?: unknown };
    if (typeof err.error === "string") {
      // If we reserved an idempotency key but did not store a success response, release it.
      if (idemKey) {
        try {
          await sql`
            DELETE FROM app_idempotency_key
            WHERE user_id = ${actingUserId}::uuid
              AND scope = ${idemScope}
              AND idem_key = ${idemKey}
              AND status_code IS NULL
          `;
        } catch {
          // ignore
        }
      }
      return apiError(err.error, { status: result.status, details: err.details });
    }

    const response = Response.json(result.body, { status: result.status });
    logRouteResponse(request, response, { startMs, userId: actingUserId, meta: { orderId: (result.body as any)?.order?.id } });

    try {
      const o = (result.body as any)?.order;
      if (o?.id) {
        // Audit Log
        await writeAuditLog(sql, {
          actorId: actingUserId,
          actorType: "user",
          action: "order.placed",
          resourceType: "order",
          resourceId: o.id,
          ...auditContextFromRequest(request),
          detail: { side: o.side, price: o.price, quantity: o.quantity, market_id: o.market_id },
        });

        // Trigger Copy Trading (Fire & Forget)
        // We do NOT await this to avoid blocking the response to the leader.
        // In serverless, this might be risky, but in a long-running Node process (e.g. standard Next.js container) it's fine.
        // Ideally use `waitUntil` if available (Vercel/Cloudflare).
        // Since we don't have waitUntil here easily, we just don't await.
        propagateLeaderOrder(sql, {
             leaderUserId: actingUserId,
             marketId: o.market_id,
             side: o.side,
             type: o.type,
             price: o.price,
             quantity: o.quantity
        }).catch(err => console.error("Copy trading propagation failed:", err));
      }
    } catch { /* audit log failure must not block */ }

    return response;
  } catch (e) {
    const resp = responseForDbError("exchange.orders.place", e);
    if (resp) return resp;
    throw e;
  }
}
