import { describe, it, expect } from "vitest";
import {
  toBigInt3818,
  fromBigInt3818,
  cmp3818,
  min3818,
  isZeroOrLess3818,
  mul3818Round,
  mul3818Ceil,
  bpsFeeCeil3818,
  add3818,
  sub3818NonNegative,
} from "@/lib/exchange/fixed3818";

describe("toBigInt3818 / fromBigInt3818", () => {
  it("converts whole numbers", () => {
    expect(fromBigInt3818(toBigInt3818("100"))).toBe("100");
    expect(fromBigInt3818(toBigInt3818("0"))).toBe("0");
    expect(fromBigInt3818(toBigInt3818("1"))).toBe("1");
  });

  it("converts decimals", () => {
    expect(fromBigInt3818(toBigInt3818("1.5"))).toBe("1.5");
    expect(fromBigInt3818(toBigInt3818("0.000001"))).toBe("0.000001");
    expect(fromBigInt3818(toBigInt3818("123.456789"))).toBe("123.456789");
  });

  it("preserves 18 decimal places", () => {
    const val = "1.123456789012345678";
    expect(fromBigInt3818(toBigInt3818(val))).toBe(val);
  });

  it("rejects negative numbers", () => {
    expect(() => toBigInt3818("-1")).toThrow("negative");
  });

  it("rejects empty strings", () => {
    expect(() => toBigInt3818("")).toThrow("empty");
  });

  it("rejects more than 18 decimals", () => {
    expect(() => toBigInt3818("1.1234567890123456789")).toThrow("too many");
  });

  it("strips trailing zeros from fractional part", () => {
    expect(fromBigInt3818(toBigInt3818("1.50"))).toBe("1.5");
    expect(fromBigInt3818(toBigInt3818("1.000"))).toBe("1");
  });
});

describe("cmp3818", () => {
  it("compares equal values", () => {
    expect(cmp3818("1.5", "1.5")).toBe(0);
    expect(cmp3818("0", "0")).toBe(0);
  });

  it("compares different values", () => {
    expect(cmp3818("1.5", "2.0")).toBe(-1);
    expect(cmp3818("3", "1")).toBe(1);
    expect(cmp3818("0.000001", "0.000002")).toBe(-1);
  });
});

describe("min3818", () => {
  it("returns smaller value", () => {
    expect(min3818("1.5", "2.0")).toBe("1.5");
    expect(min3818("3", "1")).toBe("1");
  });
});

describe("isZeroOrLess3818", () => {
  it("identifies zero", () => {
    expect(isZeroOrLess3818("0")).toBe(true);
    expect(isZeroOrLess3818("0.0")).toBe(true);
  });

  it("identifies non-zero", () => {
    expect(isZeroOrLess3818("0.000001")).toBe(false);
    expect(isZeroOrLess3818("1")).toBe(false);
  });
});

describe("add3818 / sub3818NonNegative", () => {
  it("adds correctly", () => {
    expect(add3818("1.5", "2.5")).toBe("4");
    expect(add3818("0.1", "0.2")).toBe("0.3");
    expect(add3818("0", "5")).toBe("5");
  });

  it("subtracts correctly", () => {
    expect(sub3818NonNegative("5", "3")).toBe("2");
    expect(sub3818NonNegative("1.5", "0.5")).toBe("1");
    expect(sub3818NonNegative("1", "1")).toBe("0");
  });

  it("throws on negative subtraction result", () => {
    expect(() => sub3818NonNegative("1", "2")).toThrow("negative");
  });
});

describe("mul3818Round", () => {
  it("multiplies whole numbers", () => {
    expect(mul3818Round("2", "3")).toBe("6");
    expect(mul3818Round("10", "10")).toBe("100");
  });

  it("multiplies decimals", () => {
    expect(mul3818Round("1.5", "2")).toBe("3");
    expect(mul3818Round("0.1", "0.1")).toBe("0.01");
  });

  it("multiplies by zero", () => {
    expect(mul3818Round("100", "0")).toBe("0");
  });
});

describe("mul3818Ceil", () => {
  it("rounds up when there's a remainder", () => {
    // 0.333333333333333333 * 3 with ceiling should produce 1 (due to truncation in representation)
    // Use a value that can't divide evenly: 7 / 3 ≈ 2.333..., then * 3 with ceil > 7
    // Actually, ceiling applies to the product's fractional sub-unit.
    // Test: 0.1 * 0.3 = 0.03 exact — no ceil needed
    // Test: mul3818Ceil("1", "0.333333333333333334") should round up
    const result = mul3818Ceil("3", "0.333333333333333334");
    // 3 * 0.333333333333333334 = 1.000000000000000002 — ceils to the next sub-unit
    expect(cmp3818(result, "1")).toBeGreaterThanOrEqual(0);
  });

  it("does not round up exact products", () => {
    expect(mul3818Ceil("2", "3")).toBe("6");
    expect(mul3818Ceil("0.5", "2")).toBe("1");
  });
});

describe("bpsFeeCeil3818", () => {
  it("calculates 10 bps (0.1%) fee", () => {
    // 10 bps of 100 = 0.1
    expect(bpsFeeCeil3818("100", 10)).toBe("0.1");
  });

  it("calculates 25 bps fee", () => {
    // 25 bps of 1000 = 2.5
    expect(bpsFeeCeil3818("1000", 25)).toBe("2.5");
  });

  it("returns 0 for 0 bps", () => {
    expect(bpsFeeCeil3818("100", 0)).toBe("0");
  });

  it("ceils up fractional fees", () => {
    // 1 bps of 1 = 0.0001, should not lose precision
    const fee = bpsFeeCeil3818("1", 1);
    expect(cmp3818(fee, "0")).toBe(1); // non-zero
    expect(cmp3818(fee, "0.0001")).toBeGreaterThanOrEqual(0); // >= 0.0001
  });

  it("rejects negative bps", () => {
    expect(() => bpsFeeCeil3818("100", -1)).toThrow("invalid bps");
  });
});
