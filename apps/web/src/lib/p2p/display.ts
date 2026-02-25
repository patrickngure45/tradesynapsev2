import { getPaymentMethodName } from "@/lib/p2p/constants";

export function countryToDefaultFiat(country: string | null | undefined): string | null {
  const raw = (country ?? "").trim();
  if (!raw) return null;
  const c = raw.toUpperCase();

  // ISO2 codes (we store KE, NG, etc.)
  switch (c) {
    case "KE":
      return "KES";
    case "TZ":
      return "TZS";
    case "UG":
      return "UGX";
    case "RW":
      return "RWF";
    case "BI":
      return "BIF";
    case "CD":
      return "CDF";
    case "ZA":
      return "ZAR";
    case "NG":
      return "NGN";
    case "GH":
      return "GHS";
    case "ET":
      return "ETB";
    case "SO":
      return "SOS";
    case "SD":
      return "SDG";
    case "EG":
      return "EGP";

    case "AE":
    case "UAE":
      return "AED";
    case "SA":
      return "SAR";
    case "QA":
      return "QAR";
    case "KW":
      return "KWD";
    case "OM":
      return "OMR";
    case "BH":
      return "BHD";
    case "IL":
      return "ILS";
    case "JO":
      return "JOD";

    case "UK":
    case "GB":
      return "GBP";
    case "US":
    case "USA":
      return "USD";
    case "CA":
      return "CAD";

    case "IN":
      return "INR";
    case "CN":
      return "CNY";
    case "PK":
      return "PKR";
    case "BD":
      return "BDT";
    case "PH":
      return "PHP";
    case "MY":
      return "MYR";
    case "SG":
      return "SGD";
    case "JP":
      return "JPY";
    case "KR":
      return "KRW";

    case "AU":
      return "AUD";
    case "NZ":
      return "NZD";

    default:
      return null;
  }
}

export function fiatFlag(code: string): string {
  const c = code.toUpperCase();
  switch (c) {
    case "KES":
      return "🇰🇪";
    case "UGX":
      return "🇺🇬";
    case "TZS":
      return "🇹🇿";
    case "RWF":
      return "🇷🇼";
    case "BIF":
      return "🇧🇮";
    case "CDF":
      return "🇨🇩";
    case "ZAR":
      return "🇿🇦";
    case "NGN":
      return "🇳🇬";
    case "GHS":
      return "🇬🇭";
    case "USD":
      return "🇺🇸";
    case "GBP":
      return "🇬🇧";
    case "EUR":
      return "🇪🇺";
    case "CAD":
      return "🇨🇦";
    case "AUD":
      return "🇦🇺";
    default:
      return "";
  }
}

export function safePaymentMethods(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x));
    } catch {
      // ignore
    }
  }
  return [];
}

export function initials2(name: string): string {
  const clean = (name ?? "").trim();
  if (!clean) return "U";
  const parts = clean.split(/\s+/g).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0] ?? "U"}${parts[1]![0] ?? ""}`.toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

type PaymentTone = "success" | "danger" | "accent" | "neutral";

function paymentTone(identifier: string): PaymentTone {
  const id = String(identifier ?? "").toLowerCase();
  switch (id) {
    case "mpesa":
      return "success";
    case "airtel_money":
      return "danger";
    case "bank_transfer":
    case "equity_bank":
    case "coop_bank":
    case "kcb_bank":
      return "neutral";
    // Regional mobile money rails
    case "mtn_mobile":
    case "tigo_pesa":
    case "halopesa":
    case "chipper":
      return "accent";
    default:
      return "neutral";
  }
}

/**
 * Styled payment-method badge using existing theme tokens.
 * No hard-coded brand colors; we map rails to semantic tokens (e.g. "up" for M-Pesa).
 */
export function paymentMethodBadge(identifier: string): { label: string; className: string } {
  const id = String(identifier ?? "").toLowerCase();
  const label = getPaymentMethodName(id);
  const tone = paymentTone(id);

  const base =
    "inline-flex items-center gap-1 rounded-md border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-2 py-1 text-[10px] font-semibold";

  const dotBase = "before:content-[''] before:inline-block before:h-1.5 before:w-1.5 before:rounded-full";

  switch (tone) {
    case "success":
      return {
        label,
        className: `${base} ${dotBase} before:bg-[var(--v2-up)] text-[var(--v2-up)]`,
      };
    case "danger":
      return {
        label,
        className: `${base} ${dotBase} before:bg-[var(--v2-down)] text-[var(--v2-down)]`,
      };
    case "accent":
      return {
        label,
        className: `${base} ${dotBase} before:bg-[var(--v2-accent)] text-[var(--v2-accent)]`,
      };
    default:
      return {
        label,
        className: `${base} ${dotBase} before:bg-[var(--v2-muted)] text-[var(--v2-text)]`,
      };
  }
}
