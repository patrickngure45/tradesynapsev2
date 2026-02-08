const SCALE = 10n ** 18n;
const BPS_DENOM = 10_000n;

export function toBigInt3818(value: string): bigint {
  const s = value.trim();
  if (s.length === 0) throw new Error("empty amount");
  if (s.startsWith("-")) throw new Error("negative amount");

  const [intPartRaw, fracPartRaw = ""] = s.split(".");
  if (!/^(?:0|[1-9]\d*)$/.test(intPartRaw)) throw new Error("invalid integer part");
  if (fracPartRaw.length > 18) throw new Error("too many decimals");
  if (fracPartRaw.length > 0 && !/^\d+$/.test(fracPartRaw)) throw new Error("invalid fractional part");

  const intPart = BigInt(intPartRaw);
  const fracPadded = (fracPartRaw + "0".repeat(18)).slice(0, 18);
  const fracPart = fracPadded.length ? BigInt(fracPadded) : 0n;

  return intPart * SCALE + fracPart;
}

export function fromBigInt3818(value: bigint): string {
  if (value < 0n) throw new Error("negative amount");

  const intPart = value / SCALE;
  const fracPart = value % SCALE;

  if (fracPart === 0n) return intPart.toString();

  const fracStr = fracPart.toString().padStart(18, "0").replace(/0+$/, "");
  return `${intPart.toString()}.${fracStr}`;
}

export function cmp3818(a: string, b: string): -1 | 0 | 1 {
  const ai = toBigInt3818(a);
  const bi = toBigInt3818(b);
  if (ai < bi) return -1;
  if (ai > bi) return 1;
  return 0;
}

export function min3818(a: string, b: string): string {
  return cmp3818(a, b) <= 0 ? a : b;
}

export function isZeroOrLess3818(value: string): boolean {
  // We reject negative values in parser, so this is effectively isZero.
  return toBigInt3818(value) <= 0n;
}

export function mul3818Round(a: string, b: string): string {
  const ai = toBigInt3818(a);
  const bi = toBigInt3818(b);

  // ai and bi are scaled by 1e18. Product is scaled by 1e36.
  const product = ai * bi;

  // Convert back to 1e18 scale with half-up rounding.
  const q = product / SCALE;
  const r = product % SCALE;
  const rounded = r * 2n >= SCALE ? q + 1n : q;

  return fromBigInt3818(rounded);
}

export function mul3818Ceil(a: string, b: string): string {
  const ai = toBigInt3818(a);
  const bi = toBigInt3818(b);

  // ai and bi are scaled by 1e18. Product is scaled by 1e36.
  const product = ai * bi;

  // Convert back to 1e18 scale with ceiling.
  const q = product / SCALE;
  const r = product % SCALE;
  const ceiled = r === 0n ? q : q + 1n;

  return fromBigInt3818(ceiled);
}

export function bpsFeeCeil3818(amount: string, bps: number): string {
  if (!Number.isInteger(bps) || bps < 0) throw new Error("invalid bps");
  if (bps === 0) return "0";

  const ai = toBigInt3818(amount);
  const bi = BigInt(bps);

  // amount is scaled by 1e18. Multiply by bps then divide by 10_000.
  const num = ai * bi;
  const q = num / BPS_DENOM;
  const r = num % BPS_DENOM;
  const ceiled = r === 0n ? q : q + 1n;

  return fromBigInt3818(ceiled);
}

export function add3818(a: string, b: string): string {
  const ai = toBigInt3818(a);
  const bi = toBigInt3818(b);
  return fromBigInt3818(ai + bi);
}

export function sub3818NonNegative(a: string, b: string): string {
  const ai = toBigInt3818(a);
  const bi = toBigInt3818(b);
  if (bi > ai) throw new Error("negative result");
  return fromBigInt3818(ai - bi);
}
