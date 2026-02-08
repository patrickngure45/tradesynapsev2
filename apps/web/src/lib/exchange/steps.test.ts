import { describe, it, expect } from "vitest";
import {
  isMultipleOfStep3818,
  digitsFromStep,
  quantizeDownToStep3818,
  multiplyStep3818,
} from "@/lib/exchange/steps";

/* ------------------------------------------------------------------ */
/*  isMultipleOfStep3818                                              */
/* ------------------------------------------------------------------ */
describe("isMultipleOfStep3818", () => {
  it("returns true when value is an exact multiple", () => {
    expect(isMultipleOfStep3818("10.000000000000000000", "5.000000000000000000")).toBe(true);
    expect(isMultipleOfStep3818("0.010000000000000000", "0.010000000000000000")).toBe(true);
    expect(isMultipleOfStep3818("0.030000000000000000", "0.010000000000000000")).toBe(true);
  });

  it("returns false when value is not a multiple", () => {
    expect(isMultipleOfStep3818("10.500000000000000000", "2.000000000000000000")).toBe(false);
    expect(isMultipleOfStep3818("0.015000000000000000", "0.010000000000000000")).toBe(false);
  });

  it("returns true for zero value", () => {
    expect(isMultipleOfStep3818("0", "1.000000000000000000")).toBe(true);
  });

  it("returns false for zero step", () => {
    expect(isMultipleOfStep3818("5.000000000000000000", "0")).toBe(false);
  });

  it("handles minimum step (1 wei)", () => {
    expect(isMultipleOfStep3818("0.000000000000000001", "0.000000000000000001")).toBe(true);
    expect(isMultipleOfStep3818("0.000000000000000003", "0.000000000000000001")).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  digitsFromStep                                                    */
/* ------------------------------------------------------------------ */
describe("digitsFromStep", () => {
  it("returns decimal digits for fractional step", () => {
    expect(digitsFromStep("0.01")).toBe(2);
    expect(digitsFromStep("0.0001")).toBe(4);
    expect(digitsFromStep("0.000001")).toBe(6);
  });

  it("returns 0 for whole-number step", () => {
    expect(digitsFromStep("1")).toBe(0);
    expect(digitsFromStep("100")).toBe(0);
  });

  it("strips trailing zeros", () => {
    expect(digitsFromStep("0.01000")).toBe(2);
    expect(digitsFromStep("1.00")).toBe(0);
  });

  it("returns fallback for null/undefined/empty", () => {
    expect(digitsFromStep(null)).toBe(6);
    expect(digitsFromStep(undefined)).toBe(6);
    expect(digitsFromStep("")).toBe(6);
    expect(digitsFromStep(null, 3)).toBe(3);
  });

  it("returns fallback for exponent notation", () => {
    expect(digitsFromStep("1e-8")).toBe(6);
  });

  it("respects maxDigits cap", () => {
    expect(digitsFromStep("0.000000000000000001", 6, 10)).toBe(10);
  });
});

/* ------------------------------------------------------------------ */
/*  quantizeDownToStep3818                                            */
/* ------------------------------------------------------------------ */
describe("quantizeDownToStep3818", () => {
  it("rounds down to nearest step", () => {
    // 7.5 quantized to step 2 → 6
    expect(quantizeDownToStep3818("7.500000000000000000", "2.000000000000000000")).toBe("6");
  });

  it("leaves exact multiples unchanged", () => {
    expect(quantizeDownToStep3818("10.000000000000000000", "5.000000000000000000")).toBe("10");
  });

  it("handles sub-penny steps", () => {
    // 1.235 quantized to step 0.01 → 1.23
    expect(quantizeDownToStep3818("1.235000000000000000", "0.010000000000000000")).toBe("1.23");
  });

  it("throws on zero step", () => {
    expect(() => quantizeDownToStep3818("5.000000000000000000", "0")).toThrow("invalid step");
  });
});

/* ------------------------------------------------------------------ */
/*  multiplyStep3818                                                  */
/* ------------------------------------------------------------------ */
describe("multiplyStep3818", () => {
  it("multiplies step by integer", () => {
    expect(multiplyStep3818("0.010000000000000000", 5)).toBe("0.05");
    expect(multiplyStep3818("1.000000000000000000", 100)).toBe("100");
  });

  it("returns 0 for multiplier 0", () => {
    expect(multiplyStep3818("0.010000000000000000", 0)).toBe("0");
  });

  it("throws on negative multiplier", () => {
    expect(() => multiplyStep3818("0.010000000000000000", -1)).toThrow("invalid multiplier");
  });

  it("throws on non-integer multiplier", () => {
    expect(() => multiplyStep3818("0.010000000000000000", 1.5)).toThrow("invalid multiplier");
  });
});
