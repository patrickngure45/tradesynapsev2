import { describe, it, expect } from "vitest";
import {
  orderStatusForRemaining,
  reserveAmountForLimitOrder,
  fillQuantity,
  quoteAmountForFill,
  consumeAmountForHold,
  estimateMarketBuyReserve,
} from "@/lib/exchange/orderMath";

/* ------------------------------------------------------------------ */
/*  helpers                                                           */
/* ------------------------------------------------------------------ */
const p18 = (whole: string) => `${whole}.${"0".repeat(18)}`;

describe("orderStatusForRemaining", () => {
  it("returns 'filled' when remaining is 0", () => {
    expect(orderStatusForRemaining("0", p18("10"))).toBe("filled");
    expect(orderStatusForRemaining("0.000000000000000000", p18("5"))).toBe("filled");
  });

  it("returns 'partially_filled' when 0 < remaining < original", () => {
    expect(orderStatusForRemaining(p18("3"), p18("10"))).toBe("partially_filled");
    expect(orderStatusForRemaining("0.000000000000000001", p18("1"))).toBe("partially_filled");
  });

  it("returns 'open' when remaining equals original", () => {
    expect(orderStatusForRemaining(p18("10"), p18("10"))).toBe("open");
  });
});

describe("reserveAmountForLimitOrder", () => {
  it("sell: reserves base quantity regardless of price", () => {
    const qty = p18("5");
    expect(reserveAmountForLimitOrder("sell", p18("100"), qty)).toBe(qty);
  });

  it("buy with no fee: reserves price * quantity (ceil)", () => {
    // 10 * 5 = 50 (library normalizes trailing zeros)
    const result = reserveAmountForLimitOrder("buy", p18("10"), p18("5"));
    expect(result).toBe("50");
  });

  it("buy with fee: adds bps fee ceiling on top of gross quote", () => {
    // 100 * 2 = 200, fee at 30 bps = 200 * 30/10000 = 0.6
    const result = reserveAmountForLimitOrder("buy", p18("100"), p18("2"), { maxFeeBps: 30 });
    // 200 + 0.6 = 200.6
    expect(result).toBe("200.6");
  });

  it("defaults to 0 bps fee when not specified", () => {
    const noFee = reserveAmountForLimitOrder("buy", p18("10"), p18("1"));
    const zeroFee = reserveAmountForLimitOrder("buy", p18("10"), p18("1"), { maxFeeBps: 0 });
    expect(noFee).toBe(zeroFee);
  });
});

describe("fillQuantity", () => {
  it("returns the smaller of taker and maker remaining", () => {
    expect(fillQuantity(p18("5"), p18("3"))).toBe(p18("3"));
    expect(fillQuantity(p18("2"), p18("7"))).toBe(p18("2"));
  });

  it("returns exact when equal", () => {
    expect(fillQuantity(p18("4"), p18("4"))).toBe(p18("4"));
  });
});

describe("quoteAmountForFill", () => {
  it("computes fill * price using half-up rounding", () => {
    // 3 * 10 = 30
    expect(quoteAmountForFill(p18("3"), p18("10"))).toBe("30");
  });

  it("handles fractional prices", () => {
    // 2.5 * 4.2 = 10.5
    expect(quoteAmountForFill("2.500000000000000000", "4.200000000000000000")).toBe("10.5");
  });
});

describe("consumeAmountForHold", () => {
  it("sell: returns fillQty (base asset consumed)", () => {
    expect(consumeAmountForHold("sell", p18("3"), p18("30"))).toBe(p18("3"));
  });

  it("buy: returns quoteAmt + feeQuote", () => {
    // 30 + 0.09 = 30.09
    expect(consumeAmountForHold("buy", p18("3"), "30", "0.09")).toBe("30.09");
  });

  it("buy: defaults fee to 0 when not provided", () => {
    expect(consumeAmountForHold("buy", p18("3"), "30")).toBe("30");
  });
});

describe("estimateMarketBuyReserve", () => {
  it("sums resting ask costs + fee + 1% slippage", () => {
    const asks = [
      { price: p18("10"), remaining_quantity: p18("5") },
    ];
    // qty = 5, cost = 10*5 = 50, fee(0bps) = 0, slippage(100bps) = 0.5 → 50.5
    const result = estimateMarketBuyReserve(p18("5"), asks);
    expect(result).toBe("50.5");
  });

  it("sweeps multiple price levels", () => {
    const asks = [
      { price: p18("10"), remaining_quantity: p18("2") },
      { price: p18("12"), remaining_quantity: p18("3") },
    ];
    // Buy 4 units: 2@10 = 20, 2@12 = 24, total = 44
    // fee(0bps) = 0, slippage(100bps) = 0.44 → 44.44
    const result = estimateMarketBuyReserve(p18("4"), asks);
    expect(result).toBe("44.44");
  });

  it("returns null if insufficient liquidity", () => {
    const asks = [
      { price: p18("10"), remaining_quantity: p18("3") },
    ];
    expect(estimateMarketBuyReserve(p18("5"), asks)).toBeNull();
  });

  it("returns null with empty order book", () => {
    expect(estimateMarketBuyReserve(p18("1"), [])).toBeNull();
  });

  it("includes fee bps in the estimate", () => {
    const asks = [
      { price: p18("100"), remaining_quantity: p18("1") },
    ];
    // cost = 100, fee(30bps) = 0.3, slippage(100bps) = 1 → 101.3
    const result = estimateMarketBuyReserve(p18("1"), asks, { maxFeeBps: 30 });
    expect(result).toBe("101.3");
  });
});
