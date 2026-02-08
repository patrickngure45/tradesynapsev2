import { describe, it, expect } from "vitest";
import {
  isOrderStatus,
  canTransitionOrder,
  isTerminalOrderStatus,
  canCancelOrder,
  ORDER_ALLOWED_TRANSITIONS,
} from "@/lib/state/order";

describe("isOrderStatus", () => {
  it("recognizes valid statuses", () => {
    expect(isOrderStatus("open")).toBe(true);
    expect(isOrderStatus("partially_filled")).toBe(true);
    expect(isOrderStatus("filled")).toBe(true);
    expect(isOrderStatus("canceled")).toBe(true);
  });

  it("rejects invalid strings", () => {
    expect(isOrderStatus("pending")).toBe(false);
    expect(isOrderStatus("")).toBe(false);
    expect(isOrderStatus("OPEN")).toBe(false);
    expect(isOrderStatus("cancelled")).toBe(false); // note: 'canceled' not 'cancelled'
  });
});

describe("canTransitionOrder", () => {
  it("allows open → partially_filled", () => {
    expect(canTransitionOrder("open", "partially_filled")).toBe(true);
  });

  it("allows open → filled", () => {
    expect(canTransitionOrder("open", "filled")).toBe(true);
  });

  it("allows open → canceled", () => {
    expect(canTransitionOrder("open", "canceled")).toBe(true);
  });

  it("allows partially_filled → partially_filled", () => {
    expect(canTransitionOrder("partially_filled", "partially_filled")).toBe(true);
  });

  it("allows partially_filled → filled", () => {
    expect(canTransitionOrder("partially_filled", "filled")).toBe(true);
  });

  it("allows partially_filled → canceled", () => {
    expect(canTransitionOrder("partially_filled", "canceled")).toBe(true);
  });

  it("rejects transitions from filled (terminal)", () => {
    expect(canTransitionOrder("filled", "open")).toBe(false);
    expect(canTransitionOrder("filled", "canceled")).toBe(false);
    expect(canTransitionOrder("filled", "partially_filled")).toBe(false);
  });

  it("rejects transitions from canceled (terminal)", () => {
    expect(canTransitionOrder("canceled", "open")).toBe(false);
    expect(canTransitionOrder("canceled", "filled")).toBe(false);
    expect(canTransitionOrder("canceled", "partially_filled")).toBe(false);
  });

  it("rejects transitions from invalid status", () => {
    expect(canTransitionOrder("bogus", "open")).toBe(false);
    expect(canTransitionOrder("", "filled")).toBe(false);
  });

  it("rejects backward transitions (open cannot go back to open)", () => {
    // open → open is not in the allowed list
    expect(canTransitionOrder("open", "open")).toBe(false);
  });
});

describe("isTerminalOrderStatus", () => {
  it("reports filled and canceled as terminal", () => {
    expect(isTerminalOrderStatus("filled")).toBe(true);
    expect(isTerminalOrderStatus("canceled")).toBe(true);
  });

  it("reports non-terminal statuses as false", () => {
    expect(isTerminalOrderStatus("open")).toBe(false);
    expect(isTerminalOrderStatus("partially_filled")).toBe(false);
  });

  it("reports unknown status as non-terminal", () => {
    expect(isTerminalOrderStatus("bogus")).toBe(false);
  });
});

describe("canCancelOrder", () => {
  it("allows canceling open orders", () => {
    expect(canCancelOrder("open")).toBe(true);
  });

  it("allows canceling partially filled orders", () => {
    expect(canCancelOrder("partially_filled")).toBe(true);
  });

  it("forbids canceling terminal orders", () => {
    expect(canCancelOrder("filled")).toBe(false);
    expect(canCancelOrder("canceled")).toBe(false);
  });

  it("forbids canceling unknown statuses", () => {
    expect(canCancelOrder("bogus")).toBe(false);
  });
});

describe("ORDER_ALLOWED_TRANSITIONS completeness", () => {
  it("covers all four statuses", () => {
    const keys = Object.keys(ORDER_ALLOWED_TRANSITIONS);
    expect(keys).toContain("open");
    expect(keys).toContain("partially_filled");
    expect(keys).toContain("filled");
    expect(keys).toContain("canceled");
    expect(keys.length).toBe(4);
  });

  it("terminal states have empty transition arrays", () => {
    expect(ORDER_ALLOWED_TRANSITIONS.filled).toEqual([]);
    expect(ORDER_ALLOWED_TRANSITIONS.canceled).toEqual([]);
  });
});
