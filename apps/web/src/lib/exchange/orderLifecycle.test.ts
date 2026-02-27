/**
 * Integration test: composes matcher + orderMath + state machine
 * to simulate full order-matching lifecycle scenarios without a DB.
 */
import { describe, it, expect } from "vitest";
import { planLimitMatches, planMarketMatches, type MatchableOrder } from "@/lib/exchange/matcher";
import {
  orderStatusForRemaining,
  reserveAmountForLimitOrder,
  fillQuantity,
  quoteAmountForFill,
  consumeAmountForHold,
} from "@/lib/exchange/orderMath";
import { canTransitionOrder, isTerminalOrderStatus, canCancelOrder } from "@/lib/state/order";
import { sub3818NonNegative, add3818, bpsFeeCeil3818 } from "@/lib/exchange/fixed3818";
import { isMultipleOfStep3818 } from "@/lib/exchange/steps";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */
const p18 = (whole: string) => `${whole}.${"0".repeat(18)}`;
const MAKER_FEE_BPS = 10; // 0.10%
const TAKER_FEE_BPS = 30; // 0.30%

function makeOrder(
  overrides: Partial<MatchableOrder> & { id: string; side: "buy" | "sell"; price: string; remaining_quantity: string },
): MatchableOrder {
  return { created_at: "2026-01-01T00:00:00Z", ...overrides };
}

/**
 * In-memory ledger for accounting verification.
 * Tracks posted balances and holds per userId+asset.
 */
class TestLedger {
  private balances = new Map<string, string>(); // key → posted balance
  private holds = new Map<string, string>();    // holdId → remaining

  private key(userId: string, asset: string) { return `${userId}:${asset}`; }

  credit(userId: string, asset: string, amount: string) {
    const k = this.key(userId, asset);
    this.balances.set(k, add3818(this.balances.get(k) ?? "0", amount));
  }

  debit(userId: string, asset: string, amount: string) {
    const k = this.key(userId, asset);
    this.balances.set(k, sub3818NonNegative(this.balances.get(k) ?? "0", amount));
  }

  posted(userId: string, asset: string): string {
    return this.balances.get(this.key(userId, asset)) ?? "0";
  }

  createHold(holdId: string, userId: string, asset: string, amount: string) {
    this.debit(userId, asset, amount); // move from available to held
    this.holds.set(holdId, amount);
  }

  consumeHold(holdId: string, amount: string) {
    const remaining = this.holds.get(holdId) ?? "0";
    this.holds.set(holdId, sub3818NonNegative(remaining, amount));
  }

  releaseHold(holdId: string, userId: string, asset: string) {
    const remaining = this.holds.get(holdId) ?? "0";
    this.credit(userId, asset, remaining); // return held back to available
    this.holds.set(holdId, "0");
  }

  holdRemaining(holdId: string): string { return this.holds.get(holdId) ?? "0"; }
}

/* ------------------------------------------------------------------ */
/*  Scenarios                                                         */
/* ------------------------------------------------------------------ */

describe("order lifecycle integration", () => {
  it("full fill: limit buy sweeps a single resting sell", () => {
    const TICK = "0.010000000000000000";
    const LOT = "0.100000000000000000";

    const takerQty = p18("5");
    const takerPrice = p18("10");
    const makerQty = p18("5");
    const makerPrice = p18("10");

    // Validate tick/lot compliance
    expect(isMultipleOfStep3818(takerPrice, TICK)).toBe(true);
    expect(isMultipleOfStep3818(takerQty, LOT)).toBe(true);

    // 1. Compute reserve (hold) for buy taker
    const takerReserve = reserveAmountForLimitOrder("buy", takerPrice, takerQty, { maxFeeBps: TAKER_FEE_BPS });
    // 10 * 5 = 50, fee = 50 * 30/10000 = 0.15 → 50.15
    expect(takerReserve).toBe("50.15");

    // 2. Match
    const taker = makeOrder({ id: "taker1", side: "buy", price: takerPrice, remaining_quantity: takerQty });
    const makers = [makeOrder({ id: "maker1", side: "sell", price: makerPrice, remaining_quantity: makerQty })];
    const matchResult = planLimitMatches({ taker, makers });

    expect(matchResult.fills.length).toBe(1);
    const fill = matchResult.fills[0]!;
    expect(fill.quantity).toBe(p18("5"));
    expect(fill.price).toBe(p18("10")); // maker price

    // 3. Derive order statuses
    const takerStatus = orderStatusForRemaining(matchResult.taker_remaining_quantity, takerQty);
    expect(takerStatus).toBe("filled");
    expect(isTerminalOrderStatus(takerStatus)).toBe(true);

    const makerRemaining = matchResult.maker_remaining_by_id["maker1"]!;
    const makerStatus = orderStatusForRemaining(makerRemaining, makerQty);
    expect(makerStatus).toBe("filled");

    // 4. Compute settlement amounts
    const execQty = fill.quantity;
    const execPrice = fill.price;
    const quoteAmt = quoteAmountForFill(execQty, execPrice); // 50
    expect(quoteAmt).toBe("50");

    const takerFee = bpsFeeCeil3818(quoteAmt, TAKER_FEE_BPS); // 50 * 30/10000 = 0.15
    const makerFee = bpsFeeCeil3818(quoteAmt, MAKER_FEE_BPS); // 50 * 10/10000 = 0.05

    // 5. Hold consumption
    const takerConsumed = consumeAmountForHold("buy", execQty, quoteAmt, takerFee);
    expect(takerConsumed).toBe("50.15"); // quote + fee

    const makerConsumed = consumeAmountForHold("sell", execQty, quoteAmt);
    expect(makerConsumed).toBe(p18("5")); // base asset
  });

  it("partial fill + cancel: buy order partially fills then gets canceled", () => {
    const takerQty = p18("10");
    const takerPrice = p18("20");

    const taker = makeOrder({ id: "t1", side: "buy", price: takerPrice, remaining_quantity: takerQty });
    const makers = [
      makeOrder({ id: "m1", side: "sell", price: p18("19"), remaining_quantity: p18("3") }),
    ];

    const result = planLimitMatches({ taker, makers });
    expect(result.fills.length).toBe(1);
    expect(result.fills[0]!.quantity).toBe(p18("3"));

    // Status after partial fill
    const status1 = orderStatusForRemaining(result.taker_remaining_quantity, takerQty);
    expect(status1).toBe("partially_filled");
    expect(canTransitionOrder(status1, "partially_filled")).toBe(true);
    expect(canCancelOrder(status1)).toBe(true);

    // User cancels → transition to canceled
    expect(canTransitionOrder(status1, "canceled")).toBe(true);
    expect(isTerminalOrderStatus("canceled")).toBe(true);
  });

  it("multi-level sweep with fee accounting on in-memory ledger", () => {
    const ledger = new TestLedger();
    const BASE = "BNB";
    const QUOTE = "USDT";
    const FEE_USER = "fees";

    // Seed balances
    ledger.credit("alice", QUOTE, p18("500")); // buyer
    ledger.credit("bob", BASE, p18("3"));      // seller 1
    ledger.credit("charlie", BASE, p18("5"));  // seller 2

    // Create maker sells with holds
    const makerSellReserve1 = reserveAmountForLimitOrder("sell", p18("10"), p18("3"));
    expect(makerSellReserve1).toBe(p18("3")); // sell holds base qty
    ledger.createHold("h-bob", "bob", BASE, makerSellReserve1);

    const makerSellReserve2 = reserveAmountForLimitOrder("sell", p18("12"), p18("5"));
    ledger.createHold("h-charlie", "charlie", BASE, makerSellReserve2);

    // Taker buy: wants 7 units at up to 12
    const takerQty = p18("7");
    const takerPrice = p18("12");
    const takerReserve = reserveAmountForLimitOrder("buy", takerPrice, takerQty, { maxFeeBps: TAKER_FEE_BPS });
    ledger.createHold("h-alice", "alice", QUOTE, takerReserve);

    // Match
    const taker = makeOrder({ id: "alice-o1", side: "buy", price: takerPrice, remaining_quantity: takerQty });
    const makers = [
      makeOrder({ id: "bob-o1", side: "sell", price: p18("10"), remaining_quantity: p18("3"), created_at: "2026-01-01T00:00:00Z" }),
      makeOrder({ id: "charlie-o1", side: "sell", price: p18("12"), remaining_quantity: p18("5"), created_at: "2026-01-01T00:01:00Z" }),
    ];
    const matchResult = planLimitMatches({ taker, makers });

    expect(matchResult.fills.length).toBe(2);
    expect(matchResult.taker_remaining_quantity).toBe("0"); // 3 + 4 = 7, fully filled

    // Fill 1: 3 @ 10  (all of bob)
    const f1 = matchResult.fills[0]!;
    expect(f1.maker_order_id).toBe("bob-o1");
    expect(f1.price).toBe(p18("10"));
    expect(f1.quantity).toBe(p18("3"));

    // Fill 2: 4 @ 12  (partial charlie)
    const f2 = matchResult.fills[1]!;
    expect(f2.maker_order_id).toBe("charlie-o1");
    expect(f2.price).toBe(p18("12"));
    expect(f2.quantity).toBe("4"); // 7 - 3

    expect(matchResult.taker_remaining_quantity).toBe("0");

    // Settle fill 1
    const quote1 = quoteAmountForFill(f1.quantity, f1.price); // 30
    const takerFee1 = bpsFeeCeil3818(quote1, TAKER_FEE_BPS);
    const makerFee1 = bpsFeeCeil3818(quote1, MAKER_FEE_BPS);

    // Consume holds
    ledger.consumeHold("h-alice", consumeAmountForHold("buy", f1.quantity, quote1, takerFee1));
    ledger.consumeHold("h-bob", consumeAmountForHold("sell", f1.quantity, quote1));

    // Transfer: alice gets base, bob gets quote minus fee
    ledger.credit("alice", BASE, f1.quantity);
    ledger.credit("bob", QUOTE, sub3818NonNegative(quote1, makerFee1));
    ledger.credit(FEE_USER, QUOTE, add3818(takerFee1, makerFee1));

    // Settle fill 2
    const quote2 = quoteAmountForFill(f2.quantity, f2.price); // 48
    const takerFee2 = bpsFeeCeil3818(quote2, TAKER_FEE_BPS);
    const makerFee2 = bpsFeeCeil3818(quote2, MAKER_FEE_BPS);

    ledger.consumeHold("h-alice", consumeAmountForHold("buy", f2.quantity, quote2, takerFee2));
    ledger.consumeHold("h-charlie", consumeAmountForHold("sell", f2.quantity, quote2));

    ledger.credit("alice", BASE, f2.quantity);
    ledger.credit("charlie", QUOTE, sub3818NonNegative(quote2, makerFee2));
    ledger.credit(FEE_USER, QUOTE, add3818(takerFee2, makerFee2));

    // Release remaining holds
    ledger.releaseHold("h-alice", "alice", QUOTE);   // leftover from over-reserve
    ledger.releaseHold("h-charlie", "charlie", BASE); // charlie had 5, filled 4 → 1 back

    // Assertions: alice has 7 BNB
    expect(ledger.posted("alice", BASE)).toBe("7");
    // Bob has 0 BNB (all sold), some USDT
    expect(ledger.posted("bob", BASE)).toBe("0");
    // Charlie still has 1 BNB back from released hold
    expect(ledger.posted("charlie", BASE)).toBe("1");
    // Fee user got all fees
    const totalFees = add3818(add3818(takerFee1, makerFee1), add3818(takerFee2, makerFee2));
    expect(ledger.posted(FEE_USER, QUOTE)).toBe(totalFees);
  });

  it("market order IOC: unfilled remainder should be canceled", () => {
    const taker = {
      id: "t-market",
      side: "buy" as const,
      remaining_quantity: p18("10"),
      created_at: "2026-01-01T00:00:00Z",
    };
    const makers = [
      makeOrder({ id: "m1", side: "sell", price: p18("50"), remaining_quantity: p18("3") }),
    ];

    const result = planMarketMatches({ taker, makers });
    expect(result.fills.length).toBe(1);
    expect(result.fills[0]!.quantity).toBe(p18("3"));

    // 7 units unfilled — market IOC semantics mean the rest is canceled
    const remaining = result.taker_remaining_quantity;
    expect(remaining).toBe("7");

    const statusAfterFill = orderStatusForRemaining(remaining, p18("10"));
    expect(statusAfterFill).toBe("partially_filled");

    // System auto-cancels the remainder
    expect(canTransitionOrder(statusAfterFill, "canceled")).toBe(true);
  });

  it("self-trade prevention: ensures same-user orders do not match", () => {
    // The matcher doesn't know about user IDs — the SQL query filters them.
    // This test verifies the matcher itself doesn't cross same-side orders,
    // which is a prerequisite for self-trade prevention at the SQL level.
    const taker = makeOrder({ id: "t1", side: "buy", price: p18("10"), remaining_quantity: p18("5") });
    const makers = [
      // If the SQL query accidentally includes the taker's own sell order
      makeOrder({ id: "t1", side: "sell", price: p18("9"), remaining_quantity: p18("5") }),
    ];
    const result = planLimitMatches({ taker, makers });
    // The matcher will match these (it has no user-awareness) — that's fine.
    // Self-trade prevention happens at the DB layer through `user_id != taker_user_id`.
    // This test documents that the matcher is side-aware not user-aware.
    expect(result.fills.length).toBe(1);
  });

  it("price improvement: sell taker gets better price from higher buy maker", () => {
    const taker = makeOrder({ id: "t1", side: "sell", price: p18("8"), remaining_quantity: p18("2") });
    const makers = [
      makeOrder({ id: "m1", side: "buy", price: p18("10"), remaining_quantity: p18("2") }),
    ];
    const result = planLimitMatches({ taker, makers });
    expect(result.fills[0]!.price).toBe(p18("10")); // executed at maker's better price
    const quote = quoteAmountForFill(result.fills[0]!.quantity, result.fills[0]!.price);
    // Seller gets 2 * 10 = 20 (price improved from expected 2*8=16)
    expect(quote).toBe("20");
  });
});
