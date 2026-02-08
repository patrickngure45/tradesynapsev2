import { cmp3818, isZeroOrLess3818, min3818, sub3818NonNegative } from "@/lib/exchange/fixed3818";
import type { OrderSide } from "@/lib/exchange/orderMath";

export type MatchableOrder = {
  id: string;
  side: OrderSide;
  price: string;
  remaining_quantity: string;
  created_at: string; // ISO timestamp
};

export type PlannedFill = {
  maker_order_id: string;
  taker_order_id: string;
  price: string; // maker price
  quantity: string;
};

function isPriceCrossed(takerSide: OrderSide, takerPrice: string, makerPrice: string): boolean {
  // For a buy taker, we cross if maker ask <= taker price.
  // For a sell taker, we cross if maker bid >= taker price.
  const c = cmp3818(makerPrice, takerPrice);
  return takerSide === "buy" ? c <= 0 : c >= 0;
}

function bookSortForTaker(takerSide: OrderSide) {
  return (a: MatchableOrder, b: MatchableOrder) => {
    // Price-time priority
    if (takerSide === "buy") {
      // Prefer lowest sell price
      const priceCmp = cmp3818(a.price, b.price);
      if (priceCmp !== 0) return priceCmp;
    } else {
      // Prefer highest buy price
      const priceCmp = cmp3818(b.price, a.price);
      if (priceCmp !== 0) return priceCmp;
    }

    // Earlier order first
    if (a.created_at < b.created_at) return -1;
    if (a.created_at > b.created_at) return 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}

export function planLimitMatches(params: {
  taker: MatchableOrder;
  makers: MatchableOrder[];
  maxFills?: number;
}): { fills: PlannedFill[]; taker_remaining_quantity: string; maker_remaining_by_id: Record<string, string> } {
  const { taker } = params;
  const maxFills = params.maxFills ?? 200;

  const makers = params.makers
    .filter((m) => m.side !== taker.side)
    .filter((m) => !isZeroOrLess3818(m.remaining_quantity))
    .slice()
    .sort(bookSortForTaker(taker.side));

  let takerRemaining = taker.remaining_quantity;
  const makerRemaining = new Map<string, string>();
  for (const m of makers) makerRemaining.set(m.id, m.remaining_quantity);

  const fills: PlannedFill[] = [];

  for (let i = 0; i < makers.length && fills.length < maxFills; i++) {
    if (isZeroOrLess3818(takerRemaining)) break;

    const maker = makers[i]!;
    const makerRem = makerRemaining.get(maker.id) ?? "0";
    if (isZeroOrLess3818(makerRem)) continue;

    if (!isPriceCrossed(taker.side, taker.price, maker.price)) break;

    const qty = min3818(takerRemaining, makerRem);
    if (isZeroOrLess3818(qty)) break;

    fills.push({
      maker_order_id: maker.id,
      taker_order_id: taker.id,
      price: maker.price,
      quantity: qty,
    });

    // Update remaining quantities
    takerRemaining = sub3818NonNegative(takerRemaining, qty);
    const makerNewRem = sub3818NonNegative(makerRem, qty);
    makerRemaining.set(maker.id, makerNewRem);
  }

  return {
    fills,
    taker_remaining_quantity: takerRemaining,
    maker_remaining_by_id: Object.fromEntries(makerRemaining.entries()),
  };
}

/**
 * Plan fills for a market order (IOC semantics — no price limit).
 * Matches against all resting orders at their prices.
 */
export function planMarketMatches(params: {
  taker: Omit<MatchableOrder, "price"> & { side: OrderSide };
  makers: MatchableOrder[];
  maxFills?: number;
}): { fills: PlannedFill[]; taker_remaining_quantity: string; maker_remaining_by_id: Record<string, string> } {
  // Synthetic extreme price ensures every resting order crosses.
  const syntheticPrice =
    params.taker.side === "buy"
      ? "999999999999999999.000000000000000000"
      : "0.000000000000000001";

  return planLimitMatches({
    taker: { ...params.taker, price: syntheticPrice },
    makers: params.makers,
    maxFills: params.maxFills,
  });
}
