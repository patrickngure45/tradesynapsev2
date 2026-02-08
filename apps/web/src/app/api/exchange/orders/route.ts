import { z } from "zod";

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

const placeOrderSchema = z.discriminatedUnion("type", [
  z.object({
    market_id: z.string().uuid(),
    side: sideSchema,
    type: z.literal("limit"),
    price: amount3818PositiveSchema,
    quantity: amount3818PositiveSchema,
  }),
  z.object({
    market_id: z.string().uuid(),
    side: sideSchema,
    type: z.literal("market"),
    quantity: amount3818PositiveSchema,
  }),
]);

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

    const result = await sql.begin(async (tx) => {
      const txSql = tx as unknown as typeof sql;

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

      const isMarket = input.type === "market";
      const inputPrice = isMarket ? "0" : (input as any).price as string;

      // Tick-size validation (limit only — market orders have no price)
      if (!isMarket && !isMultipleOfStep3818((input as any).price, market.tick_size)) {
        return { status: 400 as const, body: { error: "price_not_multiple_of_tick", details: { tick_size: market.tick_size } } };
      }

      if (!isMultipleOfStep3818(input.quantity, market.lot_size)) {
        return { status: 400 as const, body: { error: "quantity_not_multiple_of_lot", details: { lot_size: market.lot_size } } };
      }

      const reserveAssetId = input.side === "buy" ? market.quote_asset_id : market.base_asset_id;
      const maxFeeBps = Math.max(market.maker_fee_bps ?? 0, market.taker_fee_bps ?? 0);

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
        INSERT INTO ex_order (market_id, user_id, side, type, price, quantity, remaining_quantity, status)
        VALUES (
          ${market.id}::uuid,
          ${actingUserId}::uuid,
          ${input.side},
          ${input.type},
          (${inputPrice}::numeric),
          (${input.quantity}::numeric),
          (${input.quantity}::numeric),
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
      const makers = await txSql<
        {
          id: string;
          user_id: string;
          side: "buy" | "sell";
          price: string;
          remaining_quantity: string;
          hold_id: string | null;
          created_at: string;
        }[]
      >`
        SELECT id, user_id, side, price::text AS price, remaining_quantity::text AS remaining_quantity, hold_id, created_at
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
              remaining_quantity: taker.remaining_quantity,
              created_at: taker.created_at,
            },
            makers: makers.map((m) => ({
              id: m.id,
              side: m.side,
              price: m.price,
              remaining_quantity: m.remaining_quantity,
              created_at: m.created_at,
            })),
            maxFills: 200,
          })
        : planLimitMatches({
            taker: {
              id: taker.id,
              side: taker.side,
              price: taker.price,
              remaining_quantity: taker.remaining_quantity,
              created_at: taker.created_at,
            },
            makers: makers.map((m) => ({
              id: m.id,
              side: m.side,
              price: m.price,
              remaining_quantity: m.remaining_quantity,
              created_at: m.created_at,
            })),
            maxFills: 200,
          });

      const makerFillNotifs: Array<{ userId: string; orderId: string; side: string; fillQty: string; price: string; isFilled: boolean }> = [];

      for (const fill of planned.fills) {
        const remaining = await txSql<{ remaining: string }[]>`
          SELECT remaining_quantity::text AS remaining
          FROM ex_order
          WHERE id = ${taker.id}::uuid
          LIMIT 1
        `;
        const takerRemaining = remaining[0]?.remaining ?? "0";
        if (isZeroOrLess3818(takerRemaining)) break;

        const maker = makersById.get(fill.maker_order_id);
        if (!maker) continue;

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
            remaining_quantity = remaining_quantity - (${fillQty}::numeric),
            status = CASE
              WHEN (remaining_quantity - (${fillQty}::numeric)) <= 0 THEN 'filled'
              ELSE 'partially_filled'
            END,
            updated_at = now()
          WHERE id = ${maker.id}::uuid
        `;

        // Track maker fill for notification
        const makerIsFilled = isZeroOrLess3818(
          fromBigInt3818(toBigInt3818(maker.remaining_quantity) - toBigInt3818(fillQty)),
        );
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
            remaining_quantity = remaining_quantity - (${fillQty}::numeric),
            status = CASE
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
              ? "Market Order Canceled (IOC)"
              : "Order Partially Filled";
        await createNotification(txSql, {
          userId: taker.user_id,
          type: notifType as any,
          title: notifTitle,
          body: `Your ${taker.side} ${taker.type} order on ${market.symbol} — ${executions.length} fill(s)`,
          metadata: { orderId: taker.id, market: market.symbol, fills: executions.length },
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

      return { status: 201 as const, body: { order: taker, executions } };
    });

    const err = result.body as { error?: string; details?: unknown };
    if (typeof err.error === "string") {
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
