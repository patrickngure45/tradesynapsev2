
export const EAST_AFRICA_CURRENCIES = [
  { code: "KES", name: "Kenyan Shilling" },
  { code: "TZS", name: "Tanzanian Shilling" },
  { code: "UGX", name: "Ugandan Shilling" },
  { code: "RWF", name: "Rwandan Franc" },
];

export const GLOBAL_CURRENCIES = [
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
];

export const ALL_CURRENCIES = [...EAST_AFRICA_CURRENCIES, ...GLOBAL_CURRENCIES];

export const PAYMENT_METHODS = [
  { id: "mpesa", name: "M-Pesa (Safaricom)" },
  { id: "airtel_money", name: "Airtel Money" },
  { id: "mtn_mobile", name: "MTN Mobile Money" },
  { id: "tigo_pesa", name: "Tigo Pesa" },
  { id: "equity_bank", name: "Equity Bank" },
  { id: "bank_transfer", name: "Bank Transfer" },
  { id: "chipper", name: "Chipper Cash" },
  { id: "coop_bank", name: "Co-operative Bank" },
  { id: "kcb_bank", name: "KCB Bank" },
  { id: "halopesa", name: "Halopesa" },
];

export const getPaymentMethodName = (id: string) => {
  return PAYMENT_METHODS.find((p) => p.id === id)?.name || id;
};
