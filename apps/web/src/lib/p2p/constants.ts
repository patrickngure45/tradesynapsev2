
type FiatCurrency = { code: string; name: string };

function uniqCurrencies(list: FiatCurrency[]): FiatCurrency[] {
  const seen = new Set<string>();
  const out: FiatCurrency[] = [];
  for (const c of list) {
    const code = String(c.code).toUpperCase();
    if (seen.has(code)) continue;
    seen.add(code);
    out.push({ code, name: c.name });
  }
  return out;
}

export const EAST_AFRICA_CURRENCIES: FiatCurrency[] = [
  { code: "KES", name: "Kenyan Shilling" },
  { code: "TZS", name: "Tanzanian Shilling" },
  { code: "UGX", name: "Ugandan Shilling" },
  { code: "RWF", name: "Rwandan Franc" },
  { code: "BIF", name: "Burundian Franc" },
];

export const AFRICA_CURRENCIES: FiatCurrency[] = [
  ...EAST_AFRICA_CURRENCIES,
  { code: "CDF", name: "Congolese Franc" },
  { code: "ZAR", name: "South African Rand" },
  { code: "NGN", name: "Nigerian Naira" },
  { code: "GHS", name: "Ghanaian Cedi" },
  { code: "ETB", name: "Ethiopian Birr" },
  { code: "SOS", name: "Somali Shilling" },
  { code: "SDG", name: "Sudanese Pound" },
  { code: "EGP", name: "Egyptian Pound" },
];

export const MIDDLE_EAST_CURRENCIES: FiatCurrency[] = [
  { code: "AED", name: "UAE Dirham" },
  { code: "SAR", name: "Saudi Riyal" },
  { code: "QAR", name: "Qatari Riyal" },
  { code: "KWD", name: "Kuwaiti Dinar" },
  { code: "OMR", name: "Omani Rial" },
  { code: "BHD", name: "Bahraini Dinar" },
  { code: "ILS", name: "Israeli New Shekel" },
  { code: "JOD", name: "Jordanian Dinar" },
];

export const EUROPE_CURRENCIES: FiatCurrency[] = [
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "CHF", name: "Swiss Franc" },
  { code: "SEK", name: "Swedish Krona" },
  { code: "NOK", name: "Norwegian Krone" },
  { code: "DKK", name: "Danish Krone" },
];

export const NORTH_AMERICA_CURRENCIES: FiatCurrency[] = [
  { code: "USD", name: "US Dollar" },
  { code: "CAD", name: "Canadian Dollar" },
];

export const ASIA_CURRENCIES: FiatCurrency[] = [
  { code: "INR", name: "Indian Rupee" },
  { code: "CNY", name: "Chinese Yuan" },
  { code: "PKR", name: "Pakistani Rupee" },
  { code: "BDT", name: "Bangladeshi Taka" },
  { code: "PHP", name: "Philippine Peso" },
  { code: "MYR", name: "Malaysian Ringgit" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "KRW", name: "South Korean Won" },
];

export const OCEANIA_CURRENCIES: FiatCurrency[] = [
  { code: "AUD", name: "Australian Dollar" },
  { code: "NZD", name: "New Zealand Dollar" },
];

export const GLOBAL_CURRENCIES: FiatCurrency[] = uniqCurrencies([
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "CHF", name: "Swiss Franc" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "NZD", name: "New Zealand Dollar" },
]);

export const ALL_CURRENCIES: FiatCurrency[] = uniqCurrencies([
  ...AFRICA_CURRENCIES,
  ...MIDDLE_EAST_CURRENCIES,
  ...EUROPE_CURRENCIES,
  ...NORTH_AMERICA_CURRENCIES,
  ...ASIA_CURRENCIES,
  ...OCEANIA_CURRENCIES,
]);

export const PAYMENT_METHODS = [
  // Receiving-country metadata is best-effort (used for display and safer UX).
  // If a rail is truly multi-country, omit country here.
  { id: "mpesa", name: "M-Pesa (Safaricom)", country: "KE" },
  { id: "airtel_money", name: "Airtel Money" },
  { id: "mtn_mobile", name: "MTN Mobile Money" },
  { id: "tigo_pesa", name: "Tigo Pesa", country: "TZ" },
  { id: "equity_bank", name: "Equity Bank", country: "KE" },
  { id: "bank_transfer", name: "Bank Transfer" },
  { id: "chipper", name: "Chipper Cash" },
  { id: "coop_bank", name: "Co-operative Bank", country: "KE" },
  { id: "kcb_bank", name: "KCB Bank", country: "KE" },
  { id: "halopesa", name: "Halopesa", country: "TZ" },
];

function appendCountrySuffix(name: string, country: string): string {
  const n = String(name ?? "");
  const c = String(country ?? "").trim().toUpperCase();
  if (!c) return n;
  // If the name already has (...) then inject before the closing paren.
  if (n.includes("(") && n.endsWith(")")) {
    return n.replace(/\)\s*$/, `, ${c})`);
  }
  return `${n} (${c})`;
}

export const getPaymentMethodName = (id: string) => {
  const pid = String(id ?? "").toLowerCase();
  const p = (PAYMENT_METHODS as any[]).find((x) => String(x.id).toLowerCase() === pid);
  if (!p) return id;
  if (p.country) return appendCountrySuffix(String(p.name), String(p.country));
  return String(p.name);
};
