import { describe, it, expect } from "vitest";
import { planLimitMatches, planMarketMatches, type MatchableOrder, type PlannedFill } from "@/lib/exchange/matcher";

function makeOrder(overrides: Partial<MatchableOrder> & { id: string; side: "buy" | "sell"; price: string; remaining_quantity: string }): MatchableOrder {
  return {
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("planLimitMatches", () => {
  it("matches a buy taker against a sell maker at maker price", () => {
    const taker = makeOrder({ id: "t1", side: "buy", price: "10.000000000000000000", remaining_quantity: "5.000000000000000000" });
    const makers = [
      makeOrder({ id: "m1", side: "sell", price: "9.000000000000000000", remaining_quantity: "5.000000000000000000" }),
    ];
    const result = planLimitMatches({ taker, makers });
    expect(result.fills.length).toBe(1);
    expect(result.fills[0]!.price).toBe("9.000000000000000000"); // maker price
    expect(result.fills[0]!.quantity).toBe("5.000000000000000000");
    expect(result.taker_remaining_quantity).toBe("0");
  });

  it("does not match when prices do not cross (buy taker < sell maker)", () => {
    const taker = makeOrder({ id: "t1", side: "buy", price: "8.000000000000000000", remaining_quantity: "5.000000000000000000" });
    const makers = [
      makeOrder({ id: "m1", side: "sell", price: "9.000000000000000000", remaining_quantity: "5.000000000000000000" }),
    ];
    const result = planLimitMatches({ taker, makers });
    expect(result.fills.length).toBe(0);
    expect(result.taker_remaining_quantity).toBe("5.000000000000000000");
  });

  it("matches a sell taker against a buy maker at maker price", () => {
    const taker = makeOrder({ id: "t1", side: "sell", price: "9.000000000000000000", remaining_quantity: "3.000000000000000000" });
    const makers = [
      makeOrder({ id: "m1", side: "buy", price: "10.000000000000000000", remaining_quantity: "3.000000000000000000" }),
    ];
    const result = planLimitMatches({ taker, makers });
    expect(result.fills.length).toBe(1);
    expect(result.fills[0]!.price).toBe("10.000000000000000000"); // maker price (price improvement for seller)
    expect(result.taker_remaining_quantity).toBe("0");
  });

  it("does not match same-side orders", () => {
    const taker = makeOrder({ id: "t1", side: "buy", price: "10.000000000000000000", remaining_quantity: "5.000000000000000000" });
    const makers = [
      makeOrder({ id: "m1", side: "buy", price: "9.000000000000000000", remaining_quantity: "5.000000000000000000" }),
    ];
    const result = planLimitMatches({ taker, makers });
    expect(result.fills.length).toBe(0);
  });

  it("partially fills when maker has less quantity", () => {
    const taker = makeOrder({ id: "t1", side: "buy", price: "10.000000000000000000", remaining_quantity: "5.000000000000000000" });
    const makers = [
      makeOrder({ id: "m1", side: "sell", price: "9.000000000000000000", remaining_quantity: "2.000000000000000000" }),
    ];
    const result = planLimitMatches({ taker, makers });
    expect(result.fills.length).toBe(1);
    expect(result.fills[0]!.quantity).toBe("2.000000000000000000");
    expect(result.taker_remaining_quantity).toBe("3");
  });

  it("sweeps multiple price levels in price-time priority", () => {
    const taker = makeOrder({ id: "t1", side: "buy", price: "12.000000000000000000", remaining_quantity: "10.000000000000000000" });
    const makers = [
      makeOrder({ id: "m2", side: "sell", price: "11.000000000000000000", remaining_quantity: "3.000000000000000000", created_at: "2026-01-01T00:01:00Z" }),
      makeOrder({ id: "m1", side: "sell", price: "10.000000000000000000", remaining_quantity: "4.000000000000000000", created_at: "2026-01-01T00:00:00Z" }),
      makeOrder({ id: "m3", side: "sell", price: "12.000000000000000000", remaining_quantity: "5.000000000000000000", created_at: "2026-01-01T00:02:00Z" }),
    ];
    const result = planLimitMatches({ taker, makers });

    // Should match: m1 (cheapest) → m2 → m3 (partial)
    expect(result.fills.length).toBe(3);
    expect(result.fills[0]!.maker_order_id).toBe("m1");
    expect(result.fills[0]!.price).toBe("10.000000000000000000");
    expect(result.fills[0]!.quantity).toBe("4.000000000000000000");

    expect(result.fills[1]!.maker_order_id).toBe("m2");
    expect(result.fills[1]!.price).toBe("11.000000000000000000");
    expect(result.fills[1]!.quantity).toBe("3.000000000000000000");

    expect(result.fills[2]!.maker_order_id).toBe("m3");
    expect(result.fills[2]!.price).toBe("12.000000000000000000");
    expect(result.fills[2]!.quantity).toBe("3"); // intermediate takerRemaining lost trailing zeros

    expect(result.taker_remaining_quantity).toBe("0");
  });

  it("respects time priority at the same price level", () => {
    const taker = makeOrder({ id: "t1", side: "buy", price: "10.000000000000000000", remaining_quantity: "2.000000000000000000" });
    const makers = [
      makeOrder({ id: "m2", side: "sell", price: "10.000000000000000000", remaining_quantity: "5.000000000000000000", created_at: "2026-01-01T00:01:00Z" }),
      makeOrder({ id: "m1", side: "sell", price: "10.000000000000000000", remaining_quantity: "5.000000000000000000", created_at: "2026-01-01T00:00:00Z" }),
    ];
    const result = planLimitMatches({ taker, makers });
    expect(result.fills.length).toBe(1);
    expect(result.fills[0]!.maker_order_id).toBe("m1"); // earlier order gets filled first
  });

  it("stops at exact price boundary for buy", () => {
    const taker = makeOrder({ id: "t1", side: "buy", price: "10.000000000000000000", remaining_quantity: "10.000000000000000000" });
    const makers = [
      makeOrder({ id: "m1", side: "sell", price: "10.000000000000000000", remaining_quantity: "3.000000000000000000" }),
      makeOrder({ id: "m2", side: "sell", price: "10.000000000000000001", remaining_quantity: "3.000000000000000000" }),
    ];
    const result = planLimitMatches({ taker, makers });
    expect(result.fills.length).toBe(1); // only m1 (at limit), m2 is above
    expect(result.fills[0]!.maker_order_id).toBe("m1");
    expect(result.taker_remaining_quantity).toBe("7");
  });

  it("respects maxFills limit", () => {
    const taker = makeOrder({ id: "t1", side: "buy", price: "10.000000000000000000", remaining_quantity: "100.000000000000000000" });
    const makers = Array.from({ length: 5 }, (_, i) =>
      makeOrder({
        id: `m${i}`,
        side: "sell",
        price: "9.000000000000000000",
        remaining_quantity: "10.000000000000000000",
        created_at: `2026-01-01T00:0${i}:00Z`,
      })
    );
    const result = planLimitMatches({ taker, makers, maxFills: 3 });
    expect(result.fills.length).toBe(3);
  });

  it("ignores makers with zero remaining", () => {
    const taker = makeOrder({ id: "t1", side: "buy", price: "10.000000000000000000", remaining_quantity: "5.000000000000000000" });
    const makers = [
      makeOrder({ id: "m1", side: "sell", price: "9.000000000000000000", remaining_quantity: "0.000000000000000000" }),
      makeOrder({ id: "m2", side: "sell", price: "9.500000000000000000", remaining_quantity: "2.000000000000000000" }),
    ];
    const result = planLimitMatches({ taker, makers });
    expect(result.fills.length).toBe(1);
    expect(result.fills[0]!.maker_order_id).toBe("m2");
  });

  it("tracks maker remaining quantities", () => {
    const taker = makeOrder({ id: "t1", side: "buy", price: "10.000000000000000000", remaining_quantity: "3.000000000000000000" });
    const makers = [
      makeOrder({ id: "m1", side: "sell", price: "9.000000000000000000", remaining_quantity: "5.000000000000000000" }),
    ];
    const result = planLimitMatches({ taker, makers });
    expect(result.maker_remaining_by_id["m1"]).toBe("2");
  });
});

describe("planMarketMatches", () => {
  it("matches against all resting orders regardless of price", () => {
    const taker = { id: "t1", side: "buy" as const, remaining_quantity: "5.000000000000000000", created_at: "2026-01-01T00:00:00Z" };
    const makers = [
      makeOrder({ id: "m1", side: "sell", price: "100.000000000000000000", remaining_quantity: "2.000000000000000000" }),
      makeOrder({ id: "m2", side: "sell", price: "200.000000000000000000", remaining_quantity: "3.000000000000000000" }),
    ];
    const result = planMarketMatches({ taker, makers });
    expect(result.fills.length).toBe(2);
    expect(result.taker_remaining_quantity).toBe("0");
  });

  it("leaves remainder if book is thin", () => {
    const taker = { id: "t1", side: "buy" as const, remaining_quantity: "10.000000000000000000", created_at: "2026-01-01T00:00:00Z" };
    const makers = [
      makeOrder({ id: "m1", side: "sell", price: "50.000000000000000000", remaining_quantity: "3.000000000000000000" }),
    ];
    const result = planMarketMatches({ taker, makers });
    expect(result.fills.length).toBe(1);
    expect(result.taker_remaining_quantity).toBe("7");
  });

  it("works for sell-side market orders", () => {
    const taker = { id: "t1", side: "sell" as const, remaining_quantity: "4.000000000000000000", created_at: "2026-01-01T00:00:00Z" };
    const makers = [
      makeOrder({ id: "m1", side: "buy", price: "10.000000000000000000", remaining_quantity: "2.000000000000000000" }),
      makeOrder({ id: "m2", side: "buy", price: "9.000000000000000000", remaining_quantity: "5.000000000000000000" }),
    ];
    const result = planMarketMatches({ taker, makers });
    // Should prefer higher buy price first
    expect(result.fills[0]!.maker_order_id).toBe("m1");
    expect(result.fills[0]!.price).toBe("10.000000000000000000");
    expect(result.fills[1]!.maker_order_id).toBe("m2");
    expect(result.fills[1]!.quantity).toBe("2"); // intermediate remaining lost trailing zeros
    expect(result.taker_remaining_quantity).toBe("0");
  });
});
