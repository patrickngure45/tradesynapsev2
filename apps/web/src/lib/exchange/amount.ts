import { z } from "zod";

function normalizeAmountInput(value: string | number): string {
  if (typeof value === "number") return String(value);
  return value.trim();
}

function isValidNumeric3818(value: string): boolean {
  // Matches Postgres numeric(38,18) style bounds (up to 38 total digits, up to 18 decimals).
  // Disallows exponent notation.
  // For numeric(38,18): max integer digits = 38 - 18 = 20.
  return /^(?:0|[1-9]\d{0,19})(?:\.\d{1,18})?$/.test(value);
}

function isStrictlyPositive(value: string): boolean {
  // True if there's any non-zero digit.
  return value.replace(".", "").replace(/^0+/, "") !== "";
}

export const amount3818PositiveSchema = z
  .union([z.string(), z.number()])
  .transform(normalizeAmountInput)
  .refine((v) => v.length > 0 && v.length <= 80, "Invalid amount")
  .refine(isValidNumeric3818, "Invalid amount")
  .refine(isStrictlyPositive, "Amount must be > 0");
