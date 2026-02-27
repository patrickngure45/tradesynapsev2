function norm(code: string): string {
  return String(code || "").trim().toUpperCase();
}

// Best-effort mapping from fiat currency code to a representative ISO2 flag.
// Used only for UI display.
const FIAT_TO_ISO2: Record<string, string> = {
  // Africa
  KES: "ke",
  TZS: "tz",
  UGX: "ug",
  RWF: "rw",
  BIF: "bi",
  CDF: "cd",
  ZAR: "za",
  NGN: "ng",
  GHS: "gh",
  ETB: "et",
  SOS: "so",
  SDG: "sd",
  EGP: "eg",

  // Middle East
  AED: "ae",
  SAR: "sa",
  QAR: "qa",
  KWD: "kw",
  OMR: "om",
  BHD: "bh",
  ILS: "il",
  JOD: "jo",

  // Europe
  EUR: "eu",
  GBP: "gb",
  CHF: "ch",
  SEK: "se",
  NOK: "no",
  DKK: "dk",

  // North America
  USD: "us",
  CAD: "ca",

  // Asia
  INR: "in",
  CNY: "cn",
  PKR: "pk",
  BDT: "bd",
  PHP: "ph",
  MYR: "my",
  SGD: "sg",
  JPY: "jp",
  KRW: "kr",

  // Oceania
  AUD: "au",
  NZD: "nz",
};

export function fiatCodeToIso2(code: string): string | null {
  const c = norm(code);
  if (!c) return null;
  return FIAT_TO_ISO2[c] ?? null;
}
