export function isNonZeroDecimalString(value: unknown): boolean {
  const s = String(value ?? "").trim();
  if (s === "") return false;
  if (s === "—") return false;
  if (!/^[-+]?\d+(?:\.\d+)?$/.test(s)) return false;
  if (s.startsWith("-")) return false;
  // Any non-zero digit anywhere means non-zero.
  return /[1-9]/.test(s.replace(".", ""));
}

function groupThousands(intPart: string): string {
  // Keep it simple and deterministic (no Number conversion).
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatDecimalString(
  value: unknown,
  maxFractionDigits: number,
): string {
  const raw = String(value ?? "").trim();
  if (raw === "" || raw === "—") return "—";

  let sign = "";
  let s = raw;
  if (s[0] === "+" || s[0] === "-") {
    sign = s[0] === "-" ? "-" : "";
    s = s.slice(1);
  }

  if (!/^\d+(?:\.\d+)?$/.test(s)) {
    // Fallback for unexpected formats.
    const n = Number(raw);
    if (!Number.isFinite(n)) return raw;
    const places = Math.max(0, Math.min(maxFractionDigits, 20));
    return n.toLocaleString(undefined, { maximumFractionDigits: places });
  }

  const capped = Math.max(0, Math.min(maxFractionDigits, 20));

  let [intPart, fracPart = ""] = s.split(".");
  intPart = intPart.replace(/^0+(?=\d)/, "");
  if (intPart === "") intPart = "0";

  if (capped === 0) {
    return `${sign}${groupThousands(intPart)}`;
  }

  fracPart = fracPart.slice(0, capped).replace(/0+$/, "");
  const head = `${sign}${groupThousands(intPart)}`;
  return fracPart ? `${head}.${fracPart}` : head;
}

export function formatTokenAmount(value: unknown, decimals: number): string {
  const places = Math.min(Math.max(decimals, 0), 8);
  return formatDecimalString(value, places);
}
