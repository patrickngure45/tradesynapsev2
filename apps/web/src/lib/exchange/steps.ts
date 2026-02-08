import { fromBigInt3818, toBigInt3818 } from "@/lib/exchange/fixed3818";

export function isMultipleOfStep3818(value: string, step: string): boolean {
  const v = toBigInt3818(value);
  const s = toBigInt3818(step);
  if (s <= 0n) return false;
  return v % s === 0n;
}

export function digitsFromStep(step: string | null | undefined, fallback = 6, maxDigits = 10): number {
  if (!step) return fallback;
  const s = step.trim();
  if (!s) return fallback;
  if (/[eE]/.test(s)) return fallback;
  const dot = s.indexOf(".");
  if (dot === -1) return 0;
  const frac = s.slice(dot + 1).replace(/0+$/, "");
  const digits = frac.length;
  if (!Number.isFinite(digits)) return fallback;
  return Math.max(0, Math.min(maxDigits, digits));
}

export function quantizeDownToStep3818(value: string, step: string): string {
  const v = toBigInt3818(value);
  const s = toBigInt3818(step);
  if (s <= 0n) throw new Error("invalid step");
  return fromBigInt3818((v / s) * s);
}

export function multiplyStep3818(step: string, multiplier: number): string {
  if (!Number.isInteger(multiplier) || multiplier < 0) throw new Error("invalid multiplier");
  const s = toBigInt3818(step);
  return fromBigInt3818(s * BigInt(multiplier));
}
