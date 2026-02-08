import { describe, it, expect } from "vitest";
import { amount3818PositiveSchema } from "@/lib/exchange/amount";

function parse(input: unknown) {
  return amount3818PositiveSchema.safeParse(input);
}

describe("amount3818PositiveSchema", () => {
  /* ── valid inputs ─────────────────────────────────────────────── */
  it("accepts whole number strings", () => {
    expect(parse("100").success).toBe(true);
    expect(parse("1").success).toBe(true);
    expect(parse("0").success).toBe(false); // not positive
  });

  it("accepts decimal strings up to 18 places", () => {
    expect(parse("1.5").success).toBe(true);
    expect(parse("0.000000000000000001").success).toBe(true); // 1 wei
    expect(parse("99999999999999999999.123456789012345678").success).toBe(true); // max int + max frac
  });

  it("accepts numeric type inputs", () => {
    expect(parse(5).success).toBe(true);
    expect(parse(0.01).success).toBe(true);
  });

  it("trims whitespace", () => {
    expect(parse("  10  ").success).toBe(true);
  });

  /* ── invalid inputs ───────────────────────────────────────────── */
  it("rejects zero", () => {
    expect(parse("0").success).toBe(false);
    expect(parse("0.000000000000000000").success).toBe(false);
    expect(parse(0).success).toBe(false);
  });

  it("rejects negative values", () => {
    expect(parse("-1").success).toBe(false);
    expect(parse("-0.5").success).toBe(false);
  });

  it("rejects empty string", () => {
    expect(parse("").success).toBe(false);
  });

  it("rejects exponent notation", () => {
    expect(parse("1e18").success).toBe(false);
    expect(parse("1E-8").success).toBe(false);
  });

  it("rejects more than 18 decimal places", () => {
    expect(parse("1.0000000000000000001").success).toBe(false);
  });

  it("rejects leading zeros on integer part", () => {
    expect(parse("01").success).toBe(false);
    expect(parse("007").success).toBe(false);
  });

  it("rejects non-numeric garbage", () => {
    expect(parse("abc").success).toBe(false);
    expect(parse("12.34.56").success).toBe(false);
    expect(parse("$100").success).toBe(false);
  });

  it("rejects excessively long strings", () => {
    expect(parse("1".repeat(81)).success).toBe(false);
  });

  it("returns the normalized string on success", () => {
    const r = parse("42");
    expect(r.success && r.data).toBe("42");
  });

  it("normalizes numeric input to string", () => {
    const r = parse(7);
    expect(r.success && r.data).toBe("7");
  });
});
