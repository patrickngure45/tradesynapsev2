import {
  add3818,
  bpsFeeCeil3818,
  cmp3818,
  fromBigInt3818,
  isZeroOrLess3818,
  min3818,
  mul3818Ceil,
  mul3818Round,
  sub3818NonNegative,
  toBigInt3818,
} from "@/lib/exchange/fixed3818";

export type OrderSide = "buy" | "sell";
export type OrderStatus = "open" | "partially_filled" | "filled";

export function orderStatusForRemaining(
  remainingQuantity: string,
  originalQuantity: string
): OrderStatus {
  if (isZeroOrLess3818(remainingQuantity)) return "filled";
  if (cmp3818(remainingQuantity, originalQuantity) < 0) return "partially_filled";
  return "open";
}

export function reserveAmountForLimitOrder(
  side: OrderSide,
  price: string,
  quantity: string,
  opts?: { maxFeeBps?: number }
): string {
  if (side !== "buy") return quantity;

  const grossQuote = mul3818Ceil(price, quantity);
  const maxFeeBps = opts?.maxFeeBps ?? 0;
  const feeQuote = bpsFeeCeil3818(grossQuote, maxFeeBps);
  return add3818(grossQuote, feeQuote);
}

export function fillQuantity(takerRemaining: string, makerRemaining: string): string {
  return min3818(takerRemaining, makerRemaining);
}

export function quoteAmountForFill(fillQty: string, execPrice: string): string {
  return mul3818Round(fillQty, execPrice);
}

export function consumeAmountForHold(
  side: OrderSide,
  fillQty: string,
  quoteAmt: string,
  feeQuote: string = "0"
): string {
  // Sell orders reserve base; buy orders reserve quote.
  return side === "sell" ? fillQty : add3818(quoteAmt, feeQuote);
}

/**
 * Estimate reserve for a market buy by summing price*qty across resting asks,
 * plus fee buffer and 1% slippage buffer.
 * Returns null if insufficient resting liquidity.
 */
export function estimateMarketBuyReserve(
  quantity: string,
  asks: { price: string; remaining_quantity: string }[],
  opts?: { maxFeeBps?: number },
): string | null {
  let qtyNeeded = quantity;
  let estimatedCostScaled = 0n;

  for (const ask of asks) {
    if (isZeroOrLess3818(qtyNeeded)) break;
    const fillQty = min3818(qtyNeeded, ask.remaining_quantity);
    estimatedCostScaled += toBigInt3818(mul3818Ceil(fillQty, ask.price));
    qtyNeeded = sub3818NonNegative(qtyNeeded, fillQty);
  }

  // Not enough resting liquidity
  if (!isZeroOrLess3818(qtyNeeded)) return null;

  const estimatedCost = fromBigInt3818(estimatedCostScaled);
  const feeEstimate = bpsFeeCeil3818(estimatedCost, opts?.maxFeeBps ?? 0);
  const slippageBuffer = bpsFeeCeil3818(estimatedCost, 100); // 1%
  return add3818(add3818(estimatedCost, feeEstimate), slippageBuffer);
}
