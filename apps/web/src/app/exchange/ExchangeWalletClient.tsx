"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { ApiError, fetchJsonOrThrow } from "@/lib/api/client";
import { ApiErrorBanner, type ClientApiError } from"@/components/ApiErrorBanner";
import { Toast, type ToastKind } from"@/components/Toast";
import { AssetIcon } from "@/components/AssetIcon";
import { buttonClassName } from "@/components/ui/Button";
import { persistActingUserIdPreference, readActingUserIdPreference } from"@/lib/state/actingUser";
import { formatDecimalString, formatTokenAmount, isNonZeroDecimalString } from "@/lib/format/amount";
import { toBigInt3818 } from "@/lib/exchange/fixed3818";

type Asset = {
 id: string;
 chain: string;
 symbol: string;
 name: string | null;
 contract_address: string | null;
 decimals: number;
};

type BalanceRow = {
 asset_id: string;
 chain: string;
 symbol: string;
 decimals: number;
 posted: string;
 held: string;
 available: string;
};

type ProfileResponse = {
 user?: {
 country: string | null;
 };
};

type Hold = {
 id: string;
 asset_id: string;
 chain: string;
 symbol: string;
 amount: string;
 reason: string;
 status:"active"|"released"|"consumed";
};

type DevUser = { id: string; status: string };

type AllowlistRow = {
 id: string;
 chain: string;
 address: string;
 label: string | null;
 status: string;
 created_at: string;
};

type WithdrawalRow = {
 id: string;
 asset_id: string;
 symbol: string;
 chain: string;
 amount: string;
 destination_address: string;
 status: string;
 hold_id: string | null;
 created_at: string;
};

type GasQuote = {
 enabled: boolean;
 gasSymbol: string;
 amount: string;
 chargeSymbol?: string;
 chargeAmount?: string;
 mode:"static"|"realtime";
 burnBps: number;
 details?: Record<string, unknown>;
};

type ConvertQuote = {
  fromSymbol: string;
  toSymbol: string;
  amountIn: string;
  feeIn: string;
  netIn: string;
  rateToPerFrom: string;
  amountOut: string;
  priceSource: {
    kind: "external_index_usdt" | "internal_fx" | "anchor";
    fromUsdt: number;
    toUsdt: number;
  };
};

type AdminWithdrawalRow = {
  id: string;
  user_id: string;
  asset_id: string;
  symbol: string;
  chain: string;
  amount: string;
  destination_address: string;
  status: string;
  hold_id: string | null;
  reference: string | null;
  risk_score: number | null;
  risk_recommended_action: string | null;
  risk_model_version: string | null;
  risk_created_at: string | null;
  created_at: string;
};

type AdminWallet = {
  address: string;
  balances: { symbol: string; amount: string }[];
};

function isUuid(value: string): boolean {

 const v = value.trim();
 return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function fmtAmount(value: string, decimals: number): string {
 return formatTokenAmount(value, decimals);
}

function fmtMoneyFixed(value: string, fractionDigits: number): string {
 const base = formatDecimalString(value, fractionDigits);
 if (base === "—") return base;
 if (fractionDigits <= 0) return base;

 const [head, frac = ""] = base.split(".");
 if (!frac) return `${head}.${"0".repeat(fractionDigits)}`;
 if (frac.length >= fractionDigits) return base;
 return `${head}.${frac}${"0".repeat(fractionDigits - frac.length)}`;
}

function toNumberSafe(value: unknown): number {
  const n = typeof value === "number" ? value : Number(String(value));
  return Number.isFinite(n) ? n : 0;
}

function fiatForCountry(country: string | null | undefined): string {
 const normalized = String(country ?? "").trim().toUpperCase();
 if (normalized === "KE" || normalized === "KENYA") return "KES";
 if (normalized === "TZ" || normalized === "TANZANIA") return "TZS";
 if (normalized === "UG" || normalized === "UGANDA") return "UGX";
 if (normalized === "RW" || normalized === "RWANDA") return "RWF";
 return "USD";
}

function fmtFiat(value: number, currency: string): string {
 if (!Number.isFinite(value)) return "—";
 try {
 return new Intl.NumberFormat(undefined, {
 style: "currency",
 currency,
 maximumFractionDigits: 2,
 }).format(value);
 } catch {
 return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
 }
}

export function ExchangeWalletClient({ isAdmin }: { isAdmin?: boolean }) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [error, setError] = useState<ClientApiError | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);

  const depositSectionRef = useRef<HTMLDivElement | null>(null);
  const sendSectionRef = useRef<HTMLDivElement | null>(null);
  const convertSectionRef = useRef<HTMLDivElement | null>(null);

 const [balances, setBalances] = useState<BalanceRow[]>([]);
 const [holds, setHolds] = useState<Hold[]>([]);
 const [localFiat, setLocalFiat] = useState<string>("USD");
 const [assetLocalRates, setAssetLocalRates] = useState<Record<string, number>>({});
 const [assetLocalRateSource, setAssetLocalRateSource] = useState<Record<string, string>>({});
 const [localValueReady, setLocalValueReady] = useState(false);

 const [lastBalancesRefreshAt, setLastBalancesRefreshAt] = useState<number | null>(null);
 const [lastPricesRefreshAt, setLastPricesRefreshAt] = useState<number | null>(null);

 const [authMode, setAuthMode] = useState<"session"|"header">("session");
 const [actingUserId, setActingUserId] = useState<string>(() => {
 if (typeof window ==="undefined") return"";
 return readActingUserIdPreference();
 });

 const [devUsers, setDevUsers] = useState<DevUser[]>([]);

 // NOTE: External withdrawals are intentionally not supported in the wallet UI.
 // Offloading/withdrawal flows should happen through P2P (creating ads and settling orders).

 const [transferGasQuoteLoading, setTransferGasQuoteLoading] = useState(false);
 const [transferGasQuoteUpdatedAt, setTransferGasQuoteUpdatedAt] = useState<number | null>(null);

 const [transferAssetId, setTransferAssetId] = useState<string>("");
 const [transferAmount, setTransferAmount] = useState<string>("");
 const [transferRecipientEmail, setTransferRecipientEmail] = useState<string>("");
 const [transferTotpCode, setTransferTotpCode] = useState<string>("");
 const [transferGasQuote, setTransferGasQuote] = useState<GasQuote | null>(null);

 const [sendOpen, setSendOpen] = useState(false);

 const [depositSymbol, setDepositSymbol] = useState<string>("USDT");
 const [depositAmount, setDepositAmount] = useState<string>("25");
 const [depositTxHash, setDepositTxHash] = useState<string>("");
 const [depositAddress, setDepositAddress] = useState<string | null>(null);
 const [depositAddressLoading, setDepositAddressLoading] = useState(false);
 const [depositAddressError, setDepositAddressError] = useState<string | null>(null);
 const [depositAddressCopied, setDepositAddressCopied] = useState(false);

 const [convertFromSymbol, setConvertFromSymbol] = useState<string>("");
 const [convertToSymbol, setConvertToSymbol] = useState<string>("USDT");
 const [convertAmountIn, setConvertAmountIn] = useState<string>("");
 const [convertTotpCode, setConvertTotpCode] = useState<string>("");
 const [convertQuote, setConvertQuote] = useState<ConvertQuote | null>(null);
 const [convertQuoteLoading, setConvertQuoteLoading] = useState(false);
 const [convertQuoteUpdatedAt, setConvertQuoteUpdatedAt] = useState<number | null>(null);
 const [convertQuoteNonce, setConvertQuoteNonce] = useState(0);

 const [convertLockedQuote, setConvertLockedQuote] = useState<ConvertQuote | null>(null);
 const [convertLockedQuoteUpdatedAt, setConvertLockedQuoteUpdatedAt] = useState<number | null>(null);
 const [convertLastReceiptQuote, setConvertLastReceiptQuote] = useState<ConvertQuote | null>(null);
 const [convertLastReceiptAt, setConvertLastReceiptAt] = useState<number | null>(null);
 const [convertJustConverted, setConvertJustConverted] = useState(false);
 const [freezeWalletSortUntil, setFreezeWalletSortUntil] = useState<number | null>(null);

 const [adminKey, setAdminKey] = useState<string>("");
 const [adminId, setAdminId] = useState<string>("admin@local");
 const [adminRequested, setAdminRequested] = useState<AdminWithdrawalRow[]>([]);
  const [adminWallet, setAdminWallet] = useState<AdminWallet | null>(null);

 const [reverseTransferId, setReverseTransferId] = useState<string>("");
 const [reverseTransferReason, setReverseTransferReason] = useState<string>("");

  const [holdAssetId, setHoldAssetId] = useState<string>("");

 const [holdAmount, setHoldAmount] = useState<string>("");
 const [holdReason, setHoldReason] = useState<string>("order_hold");

 const [creditSymbol, setCreditSymbol] = useState<string>("USDT");
 const [creditAmount, setCreditAmount] = useState<string>("100");

 const [toastMessage, setToastMessage] = useState<string | null>(null);
 const [toastKind, setToastKind] = useState<ToastKind>("info");

 const isProd = process.env.NODE_ENV ==="production";

 const isConverting = loadingAction === "convert:execute";

 const requestHeaders = useMemo(() => {
 if (authMode !=="header") return undefined;
 const id = actingUserId.trim();
 if (!id) return undefined;
 return {"x-user-id": id };
 }, [authMode, actingUserId]);

 const canUseHeader = actingUserId.trim() && isUuid(actingUserId.trim());

 const assetById = useMemo(() => {
  const out = new Map<string, Asset>();
  for (const a of assets) out.set(a.id, a);
  return out;
 }, [assets]);

 const availableByAssetId = useMemo(() => {
 const out = new Map<string, number>();
 for (const b of balances) {
 out.set(b.asset_id, Number(b.available));
 }
 return out;
 }, [balances]);

 const transferableAssets = useMemo(
 () =>
 assets.filter((asset) => {
 const available = availableByAssetId.get(asset.id);
 return Number.isFinite(available) && (available as number) > 0;
 }),
 [assets, availableByAssetId]
 );

 const transferableAssetIds = useMemo(() => {
  return new Set(transferableAssets.map((a) => a.id));
 }, [transferableAssets]);

 const selectedTransferAsset = useMemo(
 () => transferableAssets.find((asset) => asset.id === transferAssetId) ?? null,
 [transferableAssets, transferAssetId]
 );

 const convertAssets = useMemo(() => {
  // Convert backend endpoints currently only support enabled BSC assets.
  return assets.filter((a) => a.chain === "bsc");
 }, [assets]);

 const selectedConvertFromAsset = useMemo(() => {
  const sym = convertFromSymbol.trim().toUpperCase();
  if (!sym) return null;
  return convertAssets.find((a) => a.symbol.toUpperCase() === sym) ?? null;
 }, [convertAssets, convertFromSymbol]);

 const selectedConvertToAsset = useMemo(() => {
  const sym = convertToSymbol.trim().toUpperCase();
  if (!sym) return null;
  return convertAssets.find((a) => a.symbol.toUpperCase() === sym) ?? null;
 }, [convertAssets, convertToSymbol]);

 const selectedConvertAvailable = useMemo(() => {
  if (!selectedConvertFromAsset) return "0";
  const row = balances.find((b) => b.asset_id === selectedConvertFromAsset.id);
  const available = String(row?.available ?? "0");
  try {
    // Validate parseability; treat weird values as 0.
    void toBigInt3818(available);
    return available;
  } catch {
    return "0";
  }
 }, [balances, selectedConvertFromAsset]);

 const selectedConvertAvailableBig = useMemo(() => {
  try {
    return toBigInt3818(selectedConvertAvailable);
  } catch {
    return 0n;
  }
 }, [selectedConvertAvailable]);

 const selectedTransferAvailable = useMemo(() => {
 if (!selectedTransferAsset) return 0;
 const row = balances.find((b) => b.asset_id === selectedTransferAsset.id);
 const available = Number(row?.available ?? NaN);
 return Number.isFinite(available) ? available : 0;
 }, [balances, selectedTransferAsset]);


 const transferAmountNumber = Number(transferAmount);
 const isTransferAmountValid = Number.isFinite(transferAmountNumber) && transferAmountNumber > 0;
 const isTransferAmountTooHigh = isTransferAmountValid && transferAmountNumber > selectedTransferAvailable;
 const isRecipientEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(transferRecipientEmail.trim());


 const convertAmountBig = useMemo(() => {
  try {
    return toBigInt3818(convertAmountIn);
  } catch {
    return null;
  }
 }, [convertAmountIn]);

 const isConvertAmountValid = convertAmountBig !== null && convertAmountBig > 0n;
 const isConvertAmountTooHigh = isConvertAmountValid && convertAmountBig! > selectedConvertAvailableBig;

 const convertDisableReason = useMemo(() => {
  const from = convertFromSymbol.trim().toUpperCase();
  const to = convertToSymbol.trim().toUpperCase();
  if (!from || !to) return "Select From and To assets.";
  if (from === to) return "From and To must be different assets.";
  if (!convertAmountIn) return "Enter an amount.";
  if (!isConvertAmountValid) return "Enter a valid amount (up to 18 decimals).";
  if (isConvertAmountTooHigh) return "Amount exceeds available balance.";
  return null;
 }, [convertFromSymbol, convertToSymbol, convertAmountIn, isConvertAmountValid, isConvertAmountTooHigh]);

 useEffect(() => {
  if (!convertJustConverted) return;
  const t = window.setTimeout(() => setConvertJustConverted(false), 1750);
  return () => window.clearTimeout(t);
 }, [convertJustConverted]);

 // If the user edits inputs after a conversion attempt, clear any locked quote.
 useEffect(() => {
  if (isConverting) return;
  setConvertLockedQuote(null);
  setConvertLockedQuoteUpdatedAt(null);
 }, [isConverting, convertFromSymbol, convertToSymbol, convertAmountIn]);

 const scrollToSection = (ref: React.RefObject<HTMLDivElement | null>) => {
  ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
 };

 const nonZeroBalances = useMemo(
 () =>
 balances.filter((b) => {
 return isNonZeroDecimalString(b.posted) || isNonZeroDecimalString(b.held) || isNonZeroDecimalString(b.available);
 }),
 [balances]
 );

 const sellUsdtP2pAmountParam = useMemo(() => {
  const row = balances.find((b) => b.symbol.toUpperCase() === "USDT");
  const available = Number(row?.available ?? NaN);
  const rate = assetLocalRates["USDT"];
  if (!Number.isFinite(available) || available <= 0) return "";
  if (!Number.isFinite(rate) || rate <= 0) return "";
  const fiatAmount = Math.floor(available * rate);
  return fiatAmount >= 1 ? String(fiatAmount) : "";
 }, [balances, assetLocalRates]);

 const sellConvertP2pAmountParam = useMemo(() => {
  if (!convertQuote) return "";
  if (!localValueReady) return "";
  const sym = convertQuote.toSymbol.trim().toUpperCase();
  if (!sym) return "";

  // P2P "amount" is a fiat amount filter (see /p2p deep-link behavior).
  const out = Number(convertQuote.amountOut);
  const rate = assetLocalRates[sym];
  if (!Number.isFinite(out) || out <= 0) return "";
  if (!Number.isFinite(rate) || rate <= 0) return "";
  const fiatAmount = Math.floor(out * rate);
  return fiatAmount >= 1 ? String(fiatAmount) : "";
 }, [convertQuote, localValueReady, assetLocalRates]);

 const fetchDepositAddress = async (opts?: { force?: boolean }) => {
  if (!opts?.force) {
   if (depositAddress || depositAddressLoading) return;
  }
  if (authMode === "header" && !canUseHeader) return;

  setDepositAddressError(null);
  setDepositAddressLoading(true);
  try {
   const res = await fetchJsonOrThrow<{ address: string; chain?: string; is_new?: boolean }>(
    "/api/exchange/deposit/address",
    {
     method: "POST",
     headers: {
      "content-type": "application/json",
      ...(requestHeaders ?? {}),
     },
     body: JSON.stringify({ chain: "bsc" }),
    },
   );
   setDepositAddress(res.address);
  } catch (e) {
   // If the user is not logged in (or header auth not set), don’t spam an error.
   if (e instanceof ApiError && (e.code === "unauthorized" || e.code === "missing_x_user_id")) {
    return;
   }
   setDepositAddressError(e instanceof Error ? e.message : String(e));
  } finally {
   setDepositAddressLoading(false);
  }
 };

 useEffect(() => {
  let cancelled = false;
  void (async () => {
   if (cancelled) return;
   await fetchDepositAddress();
  })();
  return () => {
   cancelled = true;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [authMode, canUseHeader, requestHeaders]);

 const balancesToDisplay = useMemo(() => {
  return nonZeroBalances.length > 0 ? nonZeroBalances : balances;
 }, [nonZeroBalances, balances]);

 const lastSortedAssetOrderRef = useRef<string[] | null>(null);

 const sortedBalances = useMemo(() => {
  const now = Date.now();
  if (freezeWalletSortUntil && now < freezeWalletSortUntil && lastSortedAssetOrderRef.current) {
    const order = lastSortedAssetOrderRef.current;
    const indexById = new Map<string, number>();
    order.forEach((id, i) => indexById.set(id, i));
    const rows = [...balancesToDisplay];
    rows.sort((a, b) => {
      const ai = indexById.get(a.asset_id);
      const bi = indexById.get(b.asset_id);
      if (ai == null && bi == null) return a.symbol.localeCompare(b.symbol);
      if (ai == null) return 1;
      if (bi == null) return -1;
      return ai - bi;
    });
    return rows;
  }

 const rows = [...balancesToDisplay];
 const localVal = (b: BalanceRow): number | null => {
 if (!localValueReady) return null;
 const available = Number(b.available);
 const rate = assetLocalRates[b.symbol.toUpperCase()] ?? null;
 if (!(Number.isFinite(available) && rate != null && Number.isFinite(rate) && rate > 0)) return null;
 return available * rate;
 };

 rows.sort((a, b) => {
 const aNonZero = isNonZeroDecimalString(a.posted) || isNonZeroDecimalString(a.held) || isNonZeroDecimalString(a.available);
 const bNonZero = isNonZeroDecimalString(b.posted) || isNonZeroDecimalString(b.held) || isNonZeroDecimalString(b.available);
 if (aNonZero !== bNonZero) return aNonZero ? -1 : 1;
 const av = localVal(a);
 const bv = localVal(b);
 if (av != null && bv != null && av !== bv) return bv - av;
 if (av != null && bv == null) return -1;
 if (av == null && bv != null) return 1;
 return a.symbol.localeCompare(b.symbol);
 });
  lastSortedAssetOrderRef.current = rows.map((r) => r.asset_id);
 return rows;
 }, [balancesToDisplay, localValueReady, assetLocalRates, freezeWalletSortUntil]);

 const balancesSummary = useMemo(() => {
  const assetCount = balancesToDisplay.length;
  const activeHolds = balancesToDisplay.reduce((acc, b) => {
    const held = Number(b.held);
    return acc + (Number.isFinite(held) && held > 0 ? 1 : 0);
  }, 0);

  if (!localValueReady) {
    return { assetCount, activeHolds, totalLocal: null as number | null };
  }

  let total = 0;
  let hasAny = false;
  for (const b of balancesToDisplay) {
    const available = Number(b.available);
    const rate = assetLocalRates[b.symbol.toUpperCase()] ?? null;
    if (!(Number.isFinite(available) && rate != null && Number.isFinite(rate) && rate > 0)) continue;
    total += available * rate;
    hasAny = true;
  }
  return { assetCount, activeHolds, totalLocal: hasAny ? total : null };
 }, [balancesToDisplay, localValueReady, assetLocalRates]);

 const assetsWithPendingDepositConfirmations = useMemo(() => {
  const out = new Set<string>();
  for (const h of holds) {
   if (String(h.status ?? "").toLowerCase() !== "active") continue;
   const reason = String(h.reason ?? "");
   if (reason.startsWith("deposit_pending:")) out.add(String(h.asset_id));
  }
  return out;
 }, [holds]);

 async function loadAssetLocalRates(fiat: string) {
 const fiatUpper = String(fiat ?? "").trim().toUpperCase() || "USD";
 const fxCacheKey = `ts_fx_usdt_${fiatUpper}`;

 // Instant UX: use last-known USDT->fiat rate (cached) while fresh rates load.
 try {
  const cachedRaw = typeof window !== "undefined" ? localStorage.getItem(fxCacheKey) : null;
  const cached = cachedRaw ? Number(cachedRaw) : NaN;
  if (Number.isFinite(cached) && cached > 0) {
   setAssetLocalRates((prev) => {
    const current = prev.USDT;
    if (Number.isFinite(current) && (current as number) > 0) return prev;
    return { ...prev, USDT: cached };
   });
   setAssetLocalRateSource((prev) => ({ ...prev, USDT: "Cached" }));
  }
 } catch {
  // ignore storage errors
 }

 const fetchWithTimeout = async <T,>(url: string, timeoutMs = 4000): Promise<T> => {
 const controller = new AbortController();
 const timer = window.setTimeout(() => controller.abort(), timeoutMs);
 try {
 return await fetchJsonOrThrow<T>(url, {
 cache: "no-store",
 signal: controller.signal,
 });
 } finally {
 window.clearTimeout(timer);
 }
 };

 try {
 const q = new URLSearchParams({ fiat: fiatUpper });
 const market = await fetchWithTimeout<{
  assets?: Array<{ symbol: string; index_fiat?: string | null; index_usdt?: string | null }>;
  markets?: Array<{
   base_symbol?: string | null;
   quote_symbol?: string | null;
   index?: { price_fiat?: string | null; price_usdt?: string | null } | null;
   last_fiat?: { fiat?: string | null; value?: string | null } | null;
  }>;
  fx?: { usdt_fiat?: { mid?: number | string } | null };
 }>(`/api/exchange/markets/overview?${q.toString()}`, 9000);

 const rates: Record<string, number> = {};
 const rateSource: Record<string, string> = {};
 const indexUsdtBySymbol: Record<string, number> = {};

  // Primary: derive fiat rates from enabled markets (base/USDT), using internal last/index.
  // This tends to cover far more assets than the limited external index asset list.
  for (const m of market.markets ?? []) {
   const base = String(m.base_symbol ?? "").trim().toUpperCase();
   const quote = String(m.quote_symbol ?? "").trim().toUpperCase();
   if (!base || base === "USDT") continue;
   if (quote !== "USDT") continue;

   const idxFiat = Number(m.index?.price_fiat ?? NaN);
   const lastFiat = Number(m.last_fiat?.value ?? NaN);

   if (Number.isFinite(idxFiat) && idxFiat > 0) {
    rates[base] = idxFiat;
    rateSource[base] = "Market index";
    continue;
   }

   if (Number.isFinite(lastFiat) && lastFiat > 0) {
    rates[base] = lastFiat;
    rateSource[base] = "Market last";
   }
  }

 for (const a of market.assets ?? []) {
 const sym = String(a.symbol ?? "").trim().toUpperCase();
 if (!sym) continue;

 const fiatVal = Number(a.index_fiat ?? NaN);
 if (Number.isFinite(fiatVal) && fiatVal > 0) {
  // Prefer market-derived for the same symbol if already present.
  if (!(Number.isFinite(rates[sym]) && (rates[sym] as number) > 0)) {
   rates[sym] = fiatVal;
   rateSource[sym] = "Market index";
  }
 }

 const usdtVal = Number(a.index_usdt ?? NaN);
 if (Number.isFinite(usdtVal) && usdtVal > 0) indexUsdtBySymbol[sym] = usdtVal;
 }

 const usdtFx = Number(market.fx?.usdt_fiat?.mid ?? NaN);
 if (Number.isFinite(usdtFx) && usdtFx > 0) {
 rates.USDT = usdtFx;
 rateSource.USDT = "Live FX";
 try {
  if (typeof window !== "undefined") localStorage.setItem(fxCacheKey, String(usdtFx));
 } catch {
  // ignore storage errors
 }
 }

 let usdtLocal = rates.USDT ?? null;
 if (!(usdtLocal != null && Number.isFinite(usdtLocal) && usdtLocal > 0)) {
 try {
 const p2pUsdt = await fetchWithTimeout<{ ads?: Array<{ fixed_price?: string | number }> }>(
 `/api/p2p/ads?side=BUY&asset=USDT&fiat=${encodeURIComponent(fiatUpper)}`,
 2500,
 );
 const px = Number(p2pUsdt.ads?.[0]?.fixed_price ?? NaN);
 if (Number.isFinite(px) && px > 0) {
 usdtLocal = px;
 rates.USDT = px;
 rateSource.USDT = "P2P";
 try {
  if (typeof window !== "undefined") localStorage.setItem(fxCacheKey, String(px));
 } catch {
  // ignore storage errors
 }
 }

 // No forced parity: the anchor currency should not be assumed.
 } catch {
 // ignore fallback failure
 }
 }

 if (usdtLocal != null && Number.isFinite(usdtLocal) && usdtLocal > 0) {
 for (const [sym, usdtPx] of Object.entries(indexUsdtBySymbol)) {
 if (rates[sym] != null) continue;
 rates[sym] = usdtPx * usdtLocal;
 rateSource[sym] = "Derived";
 }
 }

 setAssetLocalRates((prev) => {
 const nextEntries = Object.entries(rates).filter(([, value]) => Number.isFinite(value) && value > 0);
 if (nextEntries.length === 0) return prev;

 const out: Record<string, number> = { ...prev };
 for (const [symbol, next] of nextEntries) {
 if (symbol === "USDT") {
 // USDT is money-like; apply a tiny hysteresis so the UI doesn't "dance".
 const previous = prev[symbol];
 if (Number.isFinite(previous) && (previous as number) > 0) {
  const prevValue = previous as number;
  const relativeDelta = Math.abs(next - prevValue) / Math.max(prevValue, 1e-9);

  // Ignore tiny noise (e.g. FX/p2p rounding) to keep the displayed fiat amount stable.
  if (relativeDelta < 0.001) {
   out[symbol] = prevValue;
  } else {
   out[symbol] = prevValue * 0.85 + next * 0.15;
  }
 } else {
  out[symbol] = next;
 }
 continue;
 }
 const previous = prev[symbol];
 if (Number.isFinite(previous) && (previous as number) > 0) {
 const prevValue = previous as number;
 const relativeDelta = Math.abs(next - prevValue) / Math.max(prevValue, 1e-9);

 if (relativeDelta < 0.003) {
 out[symbol] = prevValue;
 continue;
 }

 // Smooth abrupt changes to avoid UI "dancing".
 out[symbol] = prevValue * 0.7 + next * 0.3;
 } else {
 out[symbol] = next;
 }
 }

 return out;
 });

 setAssetLocalRateSource((prev) => {
 const out: Record<string, string> = { ...prev };
 for (const [symbol, source] of Object.entries(rateSource)) {
 if (source) out[symbol] = source;
 }
 return out;
 });

 setLastPricesRefreshAt(Date.now());
 } catch {
 // Keep previous rates on transient failures to avoid flicker/jumps.
 try {
  const cachedRaw = typeof window !== "undefined" ? localStorage.getItem(fxCacheKey) : null;
  const cached = cachedRaw ? Number(cachedRaw) : NaN;
  if (Number.isFinite(cached) && cached > 0) {
   setAssetLocalRates((prev) => {
    const current = prev.USDT;
    if (Number.isFinite(current) && (current as number) > 0) return prev;
    return { ...prev, USDT: cached };
   });
   setAssetLocalRateSource((prev) => ({ ...prev, USDT: "Cached" }));
  }
 } catch {
  // ignore storage errors
 }
 }
 }

 async function refreshAll() {
 setLoadingAction("refresh");
 setError(null);
 setLocalValueReady(Object.keys(assetLocalRates).length > 0);

 try {
 const a = await fetchJsonOrThrow<{ assets?: Asset[] }>("/api/exchange/assets", {
  cache: "no-store",
 });
 const nextAssets = Array.isArray(a?.assets) ? a.assets : [];
 setAssets(nextAssets);

 const b = await fetchJsonOrThrow<unknown>("/api/exchange/balances", {
  cache: "no-store",
  headers: requestHeaders,
 });
 const nextBalances =
  b && typeof b === "object" && "balances" in (b as any) && Array.isArray((b as any).balances)
   ? ((b as any).balances as BalanceRow[])
   : null;
 if (!nextBalances) {
  throw new ApiError("bad_response", { details: { endpoint: "/api/exchange/balances" } });
 }

 setBalances(nextBalances);
 setLastBalancesRefreshAt(Date.now());

 try {
 const h = await fetchJsonOrThrow<{ holds?: Hold[] }>("/api/exchange/holds?status=all", {
  cache: "no-store",
  headers: requestHeaders,
 });
 setHolds(Array.isArray(h?.holds) ? h.holds : []);
 } catch {
 setHolds([]);
 }

 // Withdrawals are behind auth; keep them best-effort so balances still load.
 // NOTE: external withdrawals are intentionally not surfaced here.

 try {
 const p = await fetchJsonOrThrow<ProfileResponse>("/api/account/profile", {
  cache: "no-store",
  headers: requestHeaders,
 });
 const fiat = fiatForCountry(p.user?.country);
 setLocalFiat(fiat);

 await loadAssetLocalRates(fiat);
 setLocalValueReady(true);
 } catch {
 setLocalFiat("USD");
 await loadAssetLocalRates("USD");
 setLocalValueReady(true);
 }

 if (!holdAssetId && nextAssets?.[0]?.id) setHoldAssetId(nextAssets[0].id);
 if (!transferAssetId) {
 const firstTransferable = (nextAssets ?? []).find((asset) => {
 const bal = nextBalances.find((row) => row.asset_id === asset.id);
 const available = Number((bal as any)?.available ?? NaN);
 return Number.isFinite(available) && available > 0;
 })?.id;
 if (firstTransferable) setTransferAssetId(firstTransferable);
 }
 } catch (e) {
 if (e instanceof ApiError) {
 setError({ code: e.code, details: e.details });
 } else {
 setError({ code: e instanceof Error ? e.message : String(e) });
 }
 } finally {
 setLoadingAction(null);
 }
 }

 useEffect(() => {
 void refreshAll();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [authMode]);

 useEffect(() => {
 if (!localFiat) return;
 let cancelled = false;
 const timer = window.setInterval(() => {
 if (cancelled) return;
 void loadAssetLocalRates(localFiat);
 }, 20_000);

 return () => {
 cancelled = true;
 window.clearInterval(timer);
 };
 }, [localFiat]);

 useEffect(() => {
 if (true) return;
 void (async () => {
 try {
 const res = await fetch("/api/dev/users", {
 cache:"no-store",
 credentials:"same-origin",
 });
 const json = (await res.json().catch(() => null)) as { users?: DevUser[] } | null;
 setDevUsers(json?.users ?? []);
 } catch {
 // ignore
 }
 })();
 }, [isProd]);

 useEffect(() => {
 if (!transferAssetId || transferableAssets.some((asset) => asset.id === transferAssetId)) return;
 setTransferAssetId(transferableAssets[0]?.id ?? "");
 }, [transferAssetId, transferableAssets]);

 useEffect(() => {
  if (isConverting) return;
  const from = convertFromSymbol.trim().toUpperCase();
  const to = convertToSymbol.trim().toUpperCase();
  if (!from || !to || from === to) {
    setConvertQuote(null);
    setConvertQuoteLoading(false);
    setConvertQuoteUpdatedAt(null);
    return;
  }

  if (!convertAmountIn || !isConvertAmountValid || isConvertAmountTooHigh) {
    setConvertQuote(null);
    setConvertQuoteLoading(false);
    setConvertQuoteUpdatedAt(null);
    return;
  }

  let cancelled = false;
  const controller = new AbortController();
  const timer = window.setTimeout(async () => {
    setConvertQuoteLoading(true);
    try {
      const qs = new URLSearchParams({ from, to, amount_in: convertAmountIn });
      const json = await fetchJsonOrThrow<{ ok: boolean; quote: ConvertQuote }>(
        `/api/exchange/convert/quote?${qs.toString()}`,
        { cache: "no-store", signal: controller.signal },
      );
      if (cancelled) return;
      setConvertQuote(json.quote);
      setConvertQuoteUpdatedAt(Date.now());
    } catch (e) {
      if (cancelled) return;
      if (e instanceof DOMException && e.name === "AbortError") return;
      // Keep stale quote in place; just mark as not loading.
    } finally {
      if (cancelled) return;
      setConvertQuoteLoading(false);
    }
  }, 450);

  return () => {
    cancelled = true;
    controller.abort();
    window.clearTimeout(timer);
  };
 }, [convertFromSymbol, convertToSymbol, convertAmountIn, isConvertAmountValid, isConvertAmountTooHigh, convertQuoteNonce, isConverting]);

 // Auto-refresh quote periodically (Binance-style) while inputs stay valid.
 useEffect(() => {
  const from = convertFromSymbol.trim().toUpperCase();
  const to = convertToSymbol.trim().toUpperCase();
  if (!from || !to || from === to) return;
  if (!convertAmountIn || !isConvertAmountValid || isConvertAmountTooHigh) return;

  const interval = window.setInterval(() => {
    setConvertQuoteNonce((n) => n + 1);
  }, 12_000);
  return () => window.clearInterval(interval);
 }, [convertFromSymbol, convertToSymbol, convertAmountIn, isConvertAmountValid, isConvertAmountTooHigh, isConverting]);

 useEffect(() => {
 if (authMode ==="header"&& !canUseHeader) {
 setTransferGasQuote(null);
  setTransferGasQuoteLoading(false);
  setTransferGasQuoteUpdatedAt(null);
 return;
 }
 if (!selectedTransferAsset) {
 setTransferGasQuote(null);
  setTransferGasQuoteLoading(false);
  setTransferGasQuoteUpdatedAt(null);
 return;
 }

  let cancelled = false;
  const chain = selectedTransferAsset.chain;
  const sym = selectedTransferAsset.symbol;

  const timer = window.setTimeout(() => {
  void (async () => {
   setTransferGasQuoteLoading(true);
   try {
    const qs = new URLSearchParams({
    action: "user_transfer",
    chain,
    asset_symbol: sym,
    });
    const json = await fetchJsonOrThrow<{ quote: GasQuote }>(
    `/api/exchange/gas/quote?${qs.toString()}`,
    {
     cache: "no-store",
     headers: requestHeaders,
    },
    );
    if (!cancelled) {
    setTransferGasQuote(json.quote ?? null);
    setTransferGasQuoteUpdatedAt(Date.now());
    }
   } catch {
    if (!cancelled) setTransferGasQuote(null);
   } finally {
    if (!cancelled) setTransferGasQuoteLoading(false);
   }
  })();
  }, 250);

  return () => {
  cancelled = true;
  window.clearTimeout(timer);
  };
 }, [authMode, canUseHeader, requestHeaders, selectedTransferAsset?.chain, selectedTransferAsset?.symbol]);

 const adminHeaders = useMemo(() => {
 const h: Record<string, string> = {};
 if (adminKey.trim()) h["x-admin-key"] = adminKey.trim();
 if (adminId.trim()) h["x-admin-id"] = adminId.trim();
 return h;
 }, [adminKey, adminId]);

  const runEvacuation = async () => {
    setLoadingAction("evacuate");
    setError(null);
    try {
      const json = await fetchJsonOrThrow<{ success?: boolean; message?: string }>(
        "/api/exchange/evacuate",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(requestHeaders ?? {}),
          },
          body: JSON.stringify({}),
        }
      );
      if (json.success === false) {
        setToastKind("error");
        setToastMessage(json.message ?? "Add funds failed.");
        setError({
          code: "evacuation_failed",
          details: json.message ?? "Could not pull funds from connected exchanges.",
        });
        return;
      }

      setToastKind("success");
      setToastMessage(json.message ?? "Evacuation completed.");
      await refreshAll();
    } catch (e) {
      if (e instanceof ApiError) {
        setError({ code: e.code, details: e.details });
      } else {
        setError({ code: e instanceof Error ? e.message : String(e) });
      }
    } finally {
      setLoadingAction(null);
    }
  };

 return (
 <section
   className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]"
   style={{ clipPath: "polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 0 100%)" }}
 >
 <div
   className="pointer-events-none absolute inset-0 opacity-70"
   aria-hidden
   style={{
     backgroundImage:
       "radial-gradient(circle at 18% 20%, color-mix(in srgb, var(--ring) 85%, transparent) 0, transparent 55%), radial-gradient(circle at 86% 75%, color-mix(in srgb, var(--accent-2) 18%, transparent) 0, transparent 60%)",
   }}
 />

 <Toast message={toastMessage} kind={toastKind} onDone={() => setToastMessage(null)} />

 <div className="relative border-b border-[var(--border)] bg-[var(--card-2)] px-5 py-4">
   <div
     className="pointer-events-none absolute inset-0 opacity-55"
     aria-hidden
     style={{
       backgroundImage:
         "radial-gradient(circle at 18% 40%, var(--ring) 0, transparent 55%), radial-gradient(circle at 78% 60%, color-mix(in srgb, var(--accent-2) 18%, transparent) 0, transparent 60%)",
     }}
   />

   <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
     <div className="flex min-w-0 items-start gap-3">
       <span className="relative mt-1 inline-flex h-3 w-3 shrink-0 items-center justify-center">
         <span className="absolute inline-flex h-3 w-3 rounded-full bg-[var(--accent)]" />
         <span className="absolute inline-flex h-5 w-5 rounded-full bg-[var(--ring)]" />
       </span>
       <div className="min-w-0">
         <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">Wallet</div>
         <h2 className="-mt-0.5 truncate text-lg font-extrabold tracking-tight text-[var(--foreground)]">
           Trading Balance
         </h2>
         <p className="mt-1 text-sm text-[var(--muted)]">Funds available for P2P trading and spot markets.</p>
         <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
           <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--card)]/30 px-2 py-1 text-[var(--muted)]">
             Fiat <span className="font-mono text-[var(--foreground)]">{localFiat}</span>
           </span>
           <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--card)]/30 px-2 py-1 text-[var(--muted)]">
             Balances <span className="font-mono text-[var(--foreground)]">{lastBalancesRefreshAt ? new Date(lastBalancesRefreshAt).toLocaleTimeString() : "—"}</span>
           </span>
           <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--card)]/30 px-2 py-1 text-[var(--muted)]">
             Prices <span className="font-mono text-[var(--foreground)]">{lastPricesRefreshAt ? new Date(lastPricesRefreshAt).toLocaleTimeString() : "—"}</span>
           </span>
           <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--card)]/30 px-2 py-1 text-[var(--muted)]">
             Auto <span className="font-mono text-[var(--foreground)]">20s</span>
           </span>
         </div>
       </div>
     </div>

     <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
       <button
         type="button"
         className="w-full whitespace-normal break-words sm:w-auto rounded-lg border border-[var(--border)] bg-[var(--card)]/25 px-4 py-2 text-xs font-bold text-[var(--foreground)] transition hover:bg-[var(--card)] disabled:opacity-60"
         disabled={loadingAction === "refresh"}
         onClick={() => void refreshAll()}
       >
         {loadingAction === "refresh" ? "Refreshing…" : "Refresh"}
       </button>
       <button
         type="button"
         onClick={() => void runEvacuation()}
         disabled={loadingAction === "evacuate" || (authMode === "header" && !canUseHeader)}
         className="w-full whitespace-normal break-words sm:w-auto rounded-lg bg-[linear-gradient(90deg,var(--accent),var(--accent-2))] px-4 py-2 text-xs font-extrabold text-[var(--background)] transition hover:brightness-110 disabled:opacity-60"
       >
         {loadingAction === "evacuate" ? "Processing…" : "Add funds"}
       </button>
     </div>
   </div>
 </div>

 <div className="relative grid min-w-0 gap-4 px-5 py-5">
 <ApiErrorBanner error={error} className="p-3" onRetry={() => void refreshAll()} />

 {/* ── Deposit Address ─────────────────────────────── */}
 <div
   ref={depositSectionRef}
   className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]/55 p-4 shadow-[var(--shadow)]"
 >
 <div
   className="pointer-events-none absolute inset-0 opacity-60"
   aria-hidden
   style={{
     backgroundImage:
       "radial-gradient(circle at 20% 30%, color-mix(in srgb, var(--accent) 18%, transparent) 0, transparent 55%), radial-gradient(circle at 90% 15%, color-mix(in srgb, var(--accent-2) 14%, transparent) 0, transparent 55%)",
   }}
 />
 <div className="relative">
 <div className="flex flex-wrap items-center justify-between gap-2">
   <h3 className="text-sm font-semibold">Deposit address</h3>
   <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
     <span className="rounded-full border border-[var(--border)] bg-[var(--card)]/30 px-2 py-1 text-[var(--muted)]">BSC</span>
     <span className="rounded-full border border-[var(--border)] bg-[var(--up-bg)] px-2 py-1 text-[var(--up)]">Permanent</span>
   </div>
 </div>
 <p className="mt-1 text-[11px] text-[var(--muted)]">
   This address is unique to your account and does not change. Send native <span className="font-semibold text-[var(--foreground)]">BNB</span> or supported <span className="font-semibold text-[var(--foreground)]">BEP-20</span> tokens on the <span className="font-semibold text-[var(--foreground)]">BSC</span> network.
 </p>

 {depositAddress ? (
   <div className="mt-2 flex flex-wrap items-center gap-2">
     <code className="min-w-0 break-all rounded bg-[var(--border)] px-2.5 py-1.5 font-mono text-xs text-[var(--foreground)]">
       {depositAddress}
     </code>
     <button
       type="button"
       className={buttonClassName({ variant: "secondary", size: "xs" })}
       onClick={() => {
         void navigator.clipboard.writeText(depositAddress);
         setDepositAddressCopied(true);
         setTimeout(() => setDepositAddressCopied(false), 2000);
       }}
     >
       {depositAddressCopied ? "Copied!" : "Copy"}
     </button>
   </div>
 ) : depositAddressLoading ? (
   <div className="mt-2 flex flex-wrap items-center gap-2">
     <code
       className="min-w-0 break-all rounded bg-[var(--border)] px-2.5 py-1.5 font-mono text-xs text-[var(--muted)] animate-pulse"
       aria-busy="true"
     >
       0x········································
     </code>
     <span className="text-[11px] font-semibold text-[var(--muted)]">Fetching…</span>
   </div>
 ) : depositAddressError ? (
   <div className="mt-2 flex flex-wrap items-center gap-2">
     <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]/25 px-3 py-2 text-[11px] text-[var(--muted)]">
       Couldn’t fetch your permanent deposit address.
     </div>
     <button
       type="button"
       className={buttonClassName({ variant: "secondary", size: "xs" })}
       onClick={() => void fetchDepositAddress({ force: true })}
     >
       Retry
     </button>
   </div>
 ) : authMode === "header" && !canUseHeader ? (
   <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--card)]/25 px-3 py-2 text-[11px] text-[var(--muted)]">
     Sign in to view your deposit address.
     <Link
       href="/login?next=%2Fwallet"
       className="ml-2 font-semibold text-[var(--accent-2)] hover:underline"
     >
       Go to login →
     </Link>
   </div>
 ) : (
   <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--card)]/25 px-3 py-2 text-[11px] text-[var(--muted)]">
     Your permanent deposit address will appear here once fetched.
   </div>
 )}

 <details className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--bg)]/20 px-3 py-2">
   <summary className="cursor-pointer text-[11px] font-semibold text-[var(--foreground)]">
     Advanced deposit guidance
   </summary>
   <div className="mt-2 grid gap-2 text-[11px] text-[var(--muted)]">
     <div>
       <span className="font-semibold text-[var(--foreground)]">Network:</span> BSC only. Do not send ERC-20/ETH or other networks to this address.
     </div>
     <div>
       <span className="font-semibold text-[var(--foreground)]">Assets:</span> Native BNB + supported BEP-20 tokens listed in your wallet.
     </div>
     <div>
       <span className="font-semibold text-[var(--foreground)]">Finality:</span> deposits may show as <span className="font-semibold text-[var(--warn)]">Pending confirmations</span> (credited but locked) until confirmations are met.
     </div>
     <div>
       <span className="font-semibold text-[var(--foreground)]">Safety:</span> always test with a small amount first and keep your transaction hash.
     </div>
   </div>
 </details>
 </div>
 </div>

 <div className="min-w-0">
 <div className="flex flex-wrap items-center justify-between gap-2">
   <h3 className="text-sm font-medium">Balances</h3>
   <div className="flex flex-wrap items-center gap-2">
     <button
       type="button"
       className={buttonClassName({ variant: "secondary", size: "xs" })}
       onClick={() => scrollToSection(depositSectionRef)}
     >
       Deposit
     </button>
     <button
       type="button"
       className="rounded-lg border border-[var(--border)] bg-[var(--ring)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:brightness-110 disabled:opacity-60"
       disabled={transferableAssets.length === 0}
       onClick={() => {
         const preferred = transferableAssets.find((a) => a.symbol.toUpperCase() !== "USDT") ?? transferableAssets[0] ?? null;
         if (!preferred) return;
         setConvertFromSymbol(preferred.symbol.toUpperCase());
         setConvertToSymbol("USDT");
         setConvertAmountIn("");
         scrollToSection(convertSectionRef);
       }}
     >
       Convert
     </button>
   </div>
 </div>

 {nonZeroBalances.length === 0 ? (
   <div className="mt-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)]/50 px-4 py-4 text-xs">
     <div className="font-medium text-[var(--foreground)]">No funds yet</div>
     <div className="mt-1 text-[var(--muted)]">
       Your wallet supports {assets.length} assets. Generate a deposit address above and send tokens to get started.
     </div>
   </div>
 ) : null}

 <div className="mt-3 grid gap-2 sm:grid-cols-3">
   <div
     className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]/45 px-3 py-2 shadow-[var(--shadow)]"
     style={{
       backgroundImage:
         "radial-gradient(circle at 18% 30%, color-mix(in srgb, var(--accent) 16%, transparent) 0, transparent 58%)",
     }}
   >
     <div className="text-[10px] text-[var(--muted)]">Assets</div>
     <div className="mt-0.5 text-sm font-semibold text-[var(--foreground)]">{balancesSummary.assetCount}</div>
   </div>
   <div
     className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]/45 px-3 py-2 shadow-[var(--shadow)]"
     style={{ backgroundImage: "radial-gradient(circle at 18% 30%, var(--up-bg) 0, transparent 60%)" }}
   >
     <div className="text-[10px] text-[var(--muted)]">Active holds</div>
     <div className="mt-0.5 text-sm font-semibold text-[var(--foreground)]">{balancesSummary.activeHolds}</div>
   </div>
   <div
     className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]/45 px-3 py-2 shadow-[var(--shadow)]"
     style={{
       backgroundImage:
         "radial-gradient(circle at 18% 30%, color-mix(in srgb, var(--accent-2) 16%, transparent) 0, transparent 58%)",
     }}
   >
     <div className="text-[10px] text-[var(--muted)]">Est. total (available)</div>
     <div className="mt-0.5 text-sm font-semibold text-[var(--foreground)]">
       {!localValueReady ? "Updating…" : balancesSummary.totalLocal == null ? "—" : fmtFiat(balancesSummary.totalLocal, localFiat)}
     </div>
   </div>
 </div>

 {/* Wallet-style list (readable with many assets) */}
 <div
   className="mt-3 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]/55 shadow-[var(--shadow)]"
   style={{ clipPath: "polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 0 100%)" }}
 >
   <div className="sticky top-0 z-10 hidden border-b border-[var(--border)] bg-[var(--card)]/70 px-3 py-2 text-[10px] font-medium text-[var(--muted)] backdrop-blur md:grid md:grid-cols-[minmax(0,240px)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center">
     <div>Asset</div>
     <div className="text-right">Available</div>
     <div className="text-right">Value</div>
     <div className="text-right">Actions</div>
   </div>
   <div className="max-h-[640px] overflow-y-auto">
     {sortedBalances.length === 0 ? (
       <div className="px-3 py-3 text-xs text-[var(--muted)]">No balances available.</div>
     ) : (
       sortedBalances.map((b) => {
         const meta = assetById.get(b.asset_id) ?? null;
         const symbol = String(b.symbol ?? "").toUpperCase();
         const displayName = String(meta?.name ?? "").trim() || symbol;
         const chain = String(b.chain ?? meta?.chain ?? "").toUpperCase();
         const isMoneyLike = symbol === "USDT";

         const availableNum = Number(b.available);
         const heldNum = Number(b.held);
         const hasLocked = Number.isFinite(heldNum) && heldNum > 0;

         const rate = assetLocalRates[symbol] ?? null;
         const rowLocalEquivalent = (() => {
           if (!Number.isFinite(availableNum)) return null;
           if (rate != null && Number.isFinite(rate) && rate > 0) return availableNum * rate;
           // USDT feels like money; if fiat is USD we can display a sane fallback even if rates are still loading.
           if (symbol === "USDT" && String(localFiat ?? "").toUpperCase() === "USD") return availableNum;
           return null;
         })();

         const canSend = transferableAssetIds.has(b.asset_id);
         const canWithdraw = Number.isFinite(availableNum) && availableNum > 0;
         const canSellP2p = canWithdraw && (symbol === "USDT" || symbol === "BNB");
         const canConvertToUsdt = canWithdraw && symbol !== "USDT";

         const sellP2pAmountParam = (() => {
           if (!localValueReady) return "";
           if (rowLocalEquivalent == null || !Number.isFinite(rowLocalEquivalent) || rowLocalEquivalent <= 0) return "";
           const fiatAmount = Math.floor(rowLocalEquivalent);
           return fiatAmount >= 1 ? String(fiatAmount) : "";
         })();

         return (
           <div
             key={b.asset_id}
             className="group border-b border-[var(--border)] bg-[var(--card)]/20 px-3 py-3 transition-colors hover:bg-[var(--card)]/35 last:border-b-0"
             style={{ contentVisibility: "auto" }}
           >
             <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center">
               <div className="min-w-0">
                 <div className="flex min-w-0 items-center gap-2">
                   <AssetIcon symbol={symbol} size={18} />
                   <div className="min-w-0">
                     <div className="flex min-w-0 items-center gap-2">
                       <div className="min-w-0 truncate text-sm font-semibold text-[var(--foreground)]">{symbol}</div>
                       {displayName && displayName !== symbol ? (
                         <span className="min-w-0 truncate text-[11px] text-[var(--muted)]">{displayName}</span>
                       ) : null}
                       {chain && chain !== "BSC" ? (
                         <span className="shrink-0 rounded border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted)]">
                           {chain}
                         </span>
                       ) : null}
                     </div>
                     {isMoneyLike ? (
                       <div className="mt-0.5 grid gap-0.5 text-[10px] text-[var(--muted)]">
                         <div>
                           Total:{" "}
                           <span
                             className="font-mono"
                             title={fmtAmount(b.posted, b.decimals)}
                           >
                             {fmtMoneyFixed(b.posted, 2)}
                           </span>
                         </div>
                         {hasLocked ? (
                           <div title="Reserved funds (includes active P2P ads inventory + active order escrow holds)">
                             Reserved:{" "}
                             <span
                               className="font-mono"
                               title={fmtAmount(b.held, b.decimals)}
                             >
                               {fmtMoneyFixed(b.held, 2)}
                             </span>
                           </div>
                         ) : null}
                         {assetsWithPendingDepositConfirmations.has(b.asset_id) ? (
                           <div>
                             <span
                               className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--warn-bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--warn)]"
                               title="Deposit detected — funds unlock after confirmations"
                             >
                               Pending confirmations
                             </span>
                           </div>
                         ) : null}
                       </div>
                     ) : (
                       <div className="mt-0.5 text-[10px] text-[var(--muted)]">
                         Total: <span className="break-all font-mono">{fmtAmount(b.posted, b.decimals)}</span>
                         {hasLocked ? (
                           <>
                             <span className="mx-2 text-[var(--border)]">•</span>
                             <span title="Reserved funds (includes active P2P ads inventory + active order escrow holds)">
                               Reserved: <span className="break-all font-mono">{fmtAmount(b.held, b.decimals)}</span>
                             </span>
                           </>
                         ) : null}
                         {assetsWithPendingDepositConfirmations.has(b.asset_id) ? (
                           <span
                             className="ml-2 inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--warn-bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--warn)]"
                             title="Deposit detected — funds unlock after confirmations"
                           >
                             Pending confirmations
                           </span>
                         ) : null}
                       </div>
                     )}
                   </div>
                 </div>
               </div>

               <div className="text-right">
                 <div
                   className="break-all font-mono text-sm font-bold text-[var(--foreground)]"
                   title={isMoneyLike ? fmtAmount(b.available, b.decimals) : undefined}
                 >
                   {isMoneyLike ? fmtMoneyFixed(b.available, 2) : fmtAmount(b.available, b.decimals)}
                 </div>
                 <div className="text-[11px] text-[var(--muted)]">{symbol}</div>
               </div>

               <div
                 className={
                   "text-right text-[11px] " +
                   (rowLocalEquivalent == null ? "text-[var(--muted)]" : "font-medium text-[var(--foreground)]")
                 }
               >
                 {rowLocalEquivalent == null
                   ? (!localValueReady ? "Updating…" : "—")
                   : fmtFiat(rowLocalEquivalent, localFiat)}
               </div>

               <div className="flex flex-wrap justify-end gap-2 md:opacity-80 md:transition-opacity md:group-hover:opacity-100">
                 {canSellP2p ? (
                   <Link
                     className="rounded-lg border border-[var(--border)] bg-[var(--down-bg)] px-2 py-1 text-[11px] font-semibold text-[var(--down)] hover:brightness-110"
                     href={`/p2p?side=SELL&asset=${encodeURIComponent(symbol)}&fiat=${encodeURIComponent(localFiat)}${sellP2pAmountParam ? `&amount=${encodeURIComponent(sellP2pAmountParam)}` : ""}`}
                   >
                     Sell (P2P)
                   </Link>
                 ) : null}

                 {canConvertToUsdt ? (
                   <button
                     type="button"
                     className="rounded-lg border border-[var(--border)] bg-[var(--ring)] px-2 py-1 text-[11px] font-semibold text-[var(--foreground)] hover:brightness-110"
                     onClick={() => {
                       setConvertFromSymbol(symbol);
                       setConvertToSymbol("USDT");
                       setConvertAmountIn(String(b.available));
                       scrollToSection(convertSectionRef);
                     }}
                   >
                     Convert
                   </button>
                 ) : null}

                 <button
                   type="button"
                   className={buttonClassName({
                     variant: "secondary",
                     size: "xs",
                     className: "bg-[var(--ring)]/20 hover:bg-[var(--ring)]/30",
                   })}
                   disabled={!canSend}
                   onClick={() => {
                     if (!canSend) return;
                     setTransferAssetId(b.asset_id);
                     setSendOpen(true);
                     scrollToSection(sendSectionRef);
                   }}
                 >
                   Send
                 </button>

                 <Link
                   className="rounded-lg bg-[var(--accent)] px-2 py-1 text-[11px] font-semibold text-[var(--background)] hover:opacity-90"
                   href={`/p2p?new_ad=1&side=SELL&asset=${encodeURIComponent(symbol)}&fiat=${encodeURIComponent(localFiat)}`}
                 >
                   Post ad
                 </Link>
               </div>
             </div>
           </div>
         );
       })
     )}
   </div>
 </div>
 </div>

 <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,420px)] md:items-start">
 <div
   ref={sendSectionRef}
   className="relative min-w-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]/55 p-4 shadow-[var(--shadow)]"
 >
 <div
   className="pointer-events-none absolute inset-0 opacity-60"
   aria-hidden
   style={{ backgroundImage: "radial-gradient(circle at 18% 22%, var(--ring) 0, transparent 58%)" }}
 />
 <div className="relative">
 <div className="mb-3 flex items-start justify-between gap-3">
   <div className="min-w-0">
     <div className="flex items-center gap-2">
       <h3 className="text-sm font-semibold">Send</h3>
       <span className="rounded-full border border-[var(--border)] bg-[var(--card)]/30 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
         Internal
       </span>
     </div>
     <p className="mt-1 text-xs text-[var(--muted)]">Transfer to another user (email).</p>
   </div>

   <button
     type="button"
     className={buttonClassName({ variant: "secondary", size: "xs", className: "shrink-0" })}
     onClick={() => setSendOpen((v) => !v)}
   >
     {sendOpen ? "Hide" : "Open"}
   </button>
 </div>

 {sendOpen ? (
 <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--background)]/20 p-3">
 <div className="grid gap-2">
 <label className="grid gap-1">
 <span className="text-[11px] text-[var(--muted)]">Asset</span>
 <select
 className="rounded-xl border border-[var(--border)] bg-[var(--card-2)]/60 px-3 py-2 text-xs text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
 value={transferAssetId}
 onChange={(e) => setTransferAssetId(e.target.value)}
 >
 <option value="">(select)</option>
 {transferableAssets.map((a) => (
 <option key={a.id} value={a.id}>
 {a.symbol} ({a.chain})
 </option>
 ))}
 </select>
 {selectedTransferAsset ? (
 <span className="break-words text-[11px] text-[var(--muted)]">
 Available: <span className="break-all font-mono text-[var(--foreground)]">{fmtAmount(String(selectedTransferAvailable), selectedTransferAsset.decimals)} {selectedTransferAsset.symbol.toUpperCase()}</span>
 </span>
 ) : null}
 </label>

 <label className="grid gap-1">
 <span className="text-[11px] text-[var(--muted)]">Amount</span>
 <div className="flex items-center gap-2">
 <input
 className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--card-2)]/60 px-3 py-2 font-mono text-xs text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
 value={transferAmount}
 onChange={(e) => setTransferAmount(e.target.value)}
 placeholder="e.g. 100"
 inputMode="decimal"
 />
 <button
 type="button"
 className="rounded-xl border border-[var(--border)] bg-[var(--card)]/30 px-3 py-2 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--card)] disabled:opacity-60"
 disabled={!selectedTransferAsset || selectedTransferAvailable <= 0}
 onClick={() => setTransferAmount(String(selectedTransferAvailable))}
 >
 Max
 </button>
 </div>
 {isTransferAmountTooHigh ? (
 <span className="text-[11px] text-[var(--down)]">Amount exceeds available balance.</span>
 ) : null}
 </label>

 <label className="grid gap-1">
 <span className="text-[11px] text-[var(--muted)]">Recipient email</span>
 <input
 className="rounded-xl border border-[var(--border)] bg-[var(--card-2)]/60 px-3 py-2 text-xs text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
 value={transferRecipientEmail}
 onChange={(e) => setTransferRecipientEmail(e.target.value)}
 placeholder="user@example.com"
 autoCapitalize="none"
 autoCorrect="off"
 spellCheck={false}
 />
 {transferRecipientEmail && !isRecipientEmailValid ? (
 <span className="text-[11px] text-[var(--down)]">Enter a valid recipient email.</span>
 ) : null}
 </label>

 <label className="grid gap-1">
 <span className="text-[11px] text-[var(--muted)]">2FA Code (if enabled)</span>
 <input
 className="rounded-xl border border-[var(--border)] bg-[var(--card-2)]/60 px-3 py-2 font-mono text-xs text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
 value={transferTotpCode}
 onChange={(e) => setTransferTotpCode(e.target.value.replace(/\D/g,"").slice(0, 6))}
 placeholder="6-digit code"
 inputMode="numeric"
 maxLength={6}
 autoComplete="one-time-code"
 />
 </label>

 <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]/25 px-3 py-2 text-[11px] text-[var(--muted)]">
 {transferGasQuoteLoading ? (
 <div className="mb-1 break-words text-[10px] text-[var(--muted)]">Updating network fee…</div>
 ) : null}
 {transferGasQuote && !transferGasQuote.enabled ? (
 <>
 <div className="break-words">
 {Number(transferGasQuote.amount) > 0 ? (
 <>
 Estimated network fee: <span className="break-all font-mono text-[var(--foreground)]">{fmtAmount(transferGasQuote.amount, 8)} {transferGasQuote.gasSymbol}</span>
 <span className="ml-1">(waived)</span>
 </>
 ) : (
 <>
 Network fee: <span className="font-mono text-[var(--foreground)]">off</span>
 <span className="ml-1">({transferGasQuote.gasSymbol})</span>
 </>
 )}
 </div>
 </>
 ) : transferGasQuote?.enabled && Number(transferGasQuote.amount) > 0 ? (
 <>
 <div className="break-words">
 Estimated network fee: <span className="break-all font-mono text-[var(--foreground)]">{fmtAmount(transferGasQuote.amount, 8)} {transferGasQuote.gasSymbol}</span>
 <span className="ml-1">({transferGasQuote.mode ==="realtime" ? "live" : "fixed"})</span>
 {typeof transferGasQuoteUpdatedAt === "number" ? (
 <span className="ml-1">• updated {new Date(transferGasQuoteUpdatedAt).toLocaleTimeString()}</span>
 ) : null}
 </div>
 {transferGasQuote.chargeAmount && transferGasQuote.chargeSymbol && selectedTransferAsset ? (
 <div className="break-words text-[11px] text-[var(--muted)]">
 Charged as <span className="break-all font-mono text-[var(--foreground)]">{fmtAmount(transferGasQuote.chargeAmount, selectedTransferAsset.decimals)} {transferGasQuote.chargeSymbol.toUpperCase()}</span>
 </div>
 ) : (
 <div className="break-words text-[11px] text-[var(--up)]">Covered by the platform (conversion unavailable)</div>
 )}
 {selectedTransferAsset && isTransferAmountValid && isRecipientEmailValid ? (
 <div className="break-words text-[11px] text-[var(--muted)]">
 You are sending <span className="break-all font-mono text-[var(--foreground)]">{transferAmount}</span> {selectedTransferAsset.symbol.toUpperCase()} to <span className="break-all font-medium text-[var(--foreground)]">{transferRecipientEmail.trim()}</span>.
 </div>
 ) : null}
 </>
 ) : (
 <>Network fee: <span className="font-mono">—</span></>
 )}
 </div>
 <button
 type="button"
 className="mt-2 w-full sm:w-fit rounded-lg bg-[linear-gradient(90deg,var(--accent),var(--accent-2))] px-4 py-2 text-xs font-extrabold text-[var(--background)] transition hover:brightness-110 disabled:opacity-60"
 disabled={
 loadingAction === "transfer:request" ||
 !transferAssetId ||
 !transferableAssets.some((asset) => asset.id === transferAssetId) ||
 !transferAmount ||
 !isTransferAmountValid ||
 isTransferAmountTooHigh ||
 !transferRecipientEmail ||
 !isRecipientEmailValid ||
 (authMode ==="header"&& !canUseHeader)
 }
 onClick={async () => {
 setLoadingAction("transfer:request");
 setError(null);
 try {
 const res = await fetchJsonOrThrow<{
 transfer?: {
 symbol?: string;
 fees?: {
 transfer_fee_asset_amount?: string;
 gas_fallback_asset_amount?: string;
 gas_charged_in_asset_amount?: string;
 gas_sponsored?: boolean;
 network_fee_display?: { amount: string; symbol: string };
 total_debit_asset_amount?: string;
 };
 }
 }>("/api/exchange/transfers/request", {
 method:"POST",
 headers: {
 "content-type":"application/json",
 ...(requestHeaders ?? {}),
 },
 body: JSON.stringify({
 asset_id: transferAssetId,
 amount: transferAmount,
 recipient_email: transferRecipientEmail,
 ...(transferTotpCode.length === 6 ? { totp_code: transferTotpCode } : {}),
 }),
 });
 setToastKind("success");
 const symbol = res.transfer?.symbol ?? selectedTransferAsset?.symbol?.toUpperCase() ?? "";
 const transferFee = res.transfer?.fees?.transfer_fee_asset_amount ?? "0";
 const networkFeeDisplay = res.transfer?.fees?.network_fee_display;
 const gasChargedInAsset =
   res.transfer?.fees?.gas_charged_in_asset_amount ?? res.transfer?.fees?.gas_fallback_asset_amount ?? "0";
 const gasSponsored = Boolean(res.transfer?.fees?.gas_sponsored);
 const totalDebit = res.transfer?.fees?.total_debit_asset_amount;
 setToastMessage(
 totalDebit
 ? (() => {
     const net = networkFeeDisplay?.symbol
       ? `Network ${networkFeeDisplay.amount} ${networkFeeDisplay.symbol}`
       : null;
     const gas = gasSponsored
       ? "network fee covered"
       : toNumberSafe(gasChargedInAsset) > 0
         ? `charged ${gasChargedInAsset} ${symbol} for network`
         : null;
     const parts = [
       `Debited ${totalDebit} ${symbol}`,
       transferFee && toNumberSafe(transferFee) > 0 ? `fee ${transferFee}` : null,
       net,
       gas,
     ].filter(Boolean);
     return `Transfer completed. ${parts.join(" • ")}.`;
   })()
 : "Transfer completed."
 );
 setTransferAmount("");
 setTransferRecipientEmail("");
 setTransferTotpCode("");
 await refreshAll();
 } catch (e) {
 if (e instanceof ApiError) {
 setError({ code: e.code, details: e.details });
 } else {
 setError({ code: e instanceof Error ? e.message : String(e) });
 }
 } finally {
 setLoadingAction(null);
 }
 }}
 >
 {loadingAction === "transfer:request" ? "Sending…" : "Send transfer"}
 </button>
 </div>
 </div>
 ) : (
   <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]/25 px-3 py-2 text-[11px] text-[var(--muted)]">
     Tap <span className="font-semibold text-[var(--foreground)]">Open</span> or use <span className="font-semibold text-[var(--foreground)]">Send</span> on an asset to start.
   </div>
 )}
 </div>
 </div>

 <div className="grid min-w-0 gap-3 md:sticky md:top-4 md:self-start">
 {(convertFromSymbol.trim() || convertLockedQuote || convertQuote || convertLastReceiptQuote) ? (
 <div
   ref={convertSectionRef}
   className="relative min-w-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]/55 p-4 shadow-[var(--shadow)]"
 >
   <div
     className="pointer-events-none absolute inset-0 opacity-60"
     aria-hidden
     style={{
       backgroundImage:
         "radial-gradient(circle at 18% 22%, color-mix(in srgb, var(--accent-2) 18%, transparent) 0, transparent 58%)",
     }}
   />
   <div className="relative">
   <div className="mb-3 flex items-center justify-between gap-3">
     <h3 className="text-sm font-semibold">Quick convert</h3>
     <span className="rounded-full border border-[var(--border)] bg-[var(--card)]/30 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
       Spot
     </span>
   </div>
  <p className="mt-1 text-xs text-[var(--muted)]">Convert into USDT for P2P.</p>

   {(() => {
     const q = convertLockedQuote ?? convertLastReceiptQuote;
     if (!q) return null;
     return (
       <div className="mt-3 rounded border border-[var(--border)] bg-[var(--card)]/30 px-3 py-2 text-[11px] text-[var(--muted)]">
         <div className="break-words">
           Last conversion:{" "}
           <span className="break-all font-mono text-[var(--foreground)]">
             {q.amountIn} {q.fromSymbol}
           </span>
           <span className="mx-1">→</span>
           <span className="break-all font-mono text-[var(--foreground)]">
             {q.amountOut} {q.toSymbol}
           </span>
           {typeof convertLastReceiptAt === "number" ? (
             <span className="ml-1">• {new Date(convertLastReceiptAt).toLocaleTimeString()}</span>
           ) : null}
         </div>
       </div>
     );
   })()}

   <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--background)]/20 p-3">
   <div className="grid gap-2">
    <div className="grid gap-2 sm:grid-cols-2">
       <label className="grid gap-1">
         <span className="text-[11px] text-[var(--muted)]">From</span>
         <select
           className="rounded-xl border border-[var(--border)] bg-[var(--card-2)]/60 px-3 py-2 text-xs text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
           value={convertFromSymbol}
           disabled={isConverting}
           onChange={(e) => setConvertFromSymbol(e.target.value)}
         >
           <option value="">(select)</option>
          {convertAssets
             .slice()
             .sort((a, b) => a.symbol.localeCompare(b.symbol))
             .map((a) => {
               const row = balances.find((b) => b.asset_id === a.id);
              let has = false;
              try {
                const avail = String(row?.available ?? "0");
                has = toBigInt3818(avail) > 0n;
              } catch {
                has = false;
              }
               return (
                 <option key={a.id} value={a.symbol.toUpperCase()} disabled={!has}>
                  {a.symbol.toUpperCase()} (BSC){has ? "" : " — 0"}
                 </option>
               );
             })}
         </select>
         {selectedConvertFromAsset ? (
           <span className="break-words text-[11px] text-[var(--muted)]">
             Available:{" "}
             <span className="break-all font-mono text-[var(--foreground)]">
              {fmtAmount(selectedConvertAvailable, selectedConvertFromAsset.decimals)} {selectedConvertFromAsset.symbol.toUpperCase()}
             </span>
           </span>
         ) : null}
       </label>

       <label className="grid gap-1">
         <span className="text-[11px] text-[var(--muted)]">To</span>
         <select
           className="rounded-xl border border-[var(--border)] bg-[var(--card-2)]/60 px-3 py-2 text-xs text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
           value={convertToSymbol}
           disabled={isConverting}
           onChange={(e) => setConvertToSymbol(e.target.value)}
         >
          {convertAssets
            .slice()
            .sort((a, b) => a.symbol.localeCompare(b.symbol))
            .map((a) => (
              <option key={a.id} value={a.symbol.toUpperCase()}>
                {a.symbol.toUpperCase()} (BSC)
              </option>
            ))}
         </select>
       </label>
     </div>

    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
         className="rounded-xl border border-[var(--border)] bg-[var(--card)]/30 px-3 py-2 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--card)] disabled:opacity-60"
        disabled={isConverting || !convertFromSymbol || !convertToSymbol}
        onClick={() => {
          const from = convertFromSymbol;
          const to = convertToSymbol;
          setConvertFromSymbol(to);
          setConvertToSymbol(from);
          setConvertQuote(null);
          setConvertQuoteUpdatedAt(null);
          setConvertQuoteNonce((n) => n + 1);
        }}
      >
        Swap
      </button>

      <button
        type="button"
         className="rounded-xl border border-[var(--border)] bg-[var(--card)]/30 px-3 py-2 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--card)] disabled:opacity-60"
        disabled={isConverting || !!convertDisableReason}
        onClick={() => setConvertQuoteNonce((n) => n + 1)}
      >
        Refresh quote
      </button>
    </div>

     <label className="grid gap-1">
       <span className="text-[11px] text-[var(--muted)]">Amount</span>
       <div className="flex items-center gap-2">
         <input
           className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--card-2)]/60 px-3 py-2 font-mono text-xs text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
           value={convertAmountIn}
           disabled={isConverting}
           onChange={(e) => setConvertAmountIn(e.target.value)}
           placeholder="e.g. 10"
           inputMode="decimal"
         />
         <button
           type="button"
           className="rounded-xl border border-[var(--border)] bg-[var(--card)]/30 px-3 py-2 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--card)] disabled:opacity-60"
           disabled={isConverting || !selectedConvertFromAsset || selectedConvertAvailableBig <= 0n}
          onClick={() => setConvertAmountIn(selectedConvertAvailable)}
         >
           Max
         </button>
       </div>
      {convertDisableReason ? (
        <span className="text-[11px] text-[var(--down)]">{convertDisableReason}</span>
      ) : null}
     </label>

     <label className="grid gap-1">
       <span className="text-[11px] text-[var(--muted)]">2FA Code (if enabled)</span>
       <input
         className="rounded-xl border border-[var(--border)] bg-[var(--card-2)]/60 px-3 py-2 font-mono text-xs text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
         value={convertTotpCode}
         disabled={isConverting}
         onChange={(e) => setConvertTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
         placeholder="6-digit code"
         inputMode="numeric"
         maxLength={6}
         autoComplete="one-time-code"
       />
     </label>

     <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]/25 px-3 py-2 text-[11px] text-[var(--muted)]">
       {convertLockedQuote ? (
         <div className="mb-1 break-words text-[10px] text-[var(--muted)]">Locked quote • executing…</div>
       ) : convertQuoteLoading ? (
         <div className="mb-1 break-words text-[10px] text-[var(--muted)]">Updating quote…</div>
       ) : null}

       {(() => {
         const displayQuote = convertLockedQuote ?? convertQuote;
         const displayUpdatedAt = convertLockedQuote ? convertLockedQuoteUpdatedAt : convertQuoteUpdatedAt;
         if (!displayQuote) return <>Quote: <span className="font-mono">—</span></>;
         return (
           <>
           <div className="break-words">
             Rate:{" "}
             <span className="break-all font-mono text-[var(--foreground)]">{fmtAmount(displayQuote.rateToPerFrom, 8)}</span>
             <span className="ml-1">{displayQuote.toSymbol} per {displayQuote.fromSymbol}</span>
             {typeof displayUpdatedAt === "number" ? (
               <span className="ml-1">• updated {new Date(displayUpdatedAt).toLocaleTimeString()}</span>
             ) : null}
           </div>
           <div className="mt-1 break-words">
            You receive:{" "}
             <span className="break-all font-mono text-[var(--foreground)]">
               {fmtAmount(displayQuote.amountOut, selectedConvertToAsset?.decimals ?? 6)} {displayQuote.toSymbol}
             </span>
             <span className="ml-1">(fee {fmtAmount(displayQuote.feeIn, selectedConvertFromAsset?.decimals ?? 6)} {displayQuote.fromSymbol})</span>
           </div>
          {null}
           </>
         );
       })()}
     </div>

     <div className="flex flex-wrap gap-2">
       <button
         type="button"
         className="w-full sm:w-fit rounded-lg bg-[linear-gradient(90deg,var(--accent-2),var(--accent))] px-4 py-2 text-xs font-extrabold text-[var(--background)] transition hover:brightness-110 disabled:opacity-60"
         disabled={
           loadingAction === "convert:execute" ||
           !selectedConvertFromAsset ||
           !selectedConvertToAsset ||
           !convertAmountIn ||
           !isConvertAmountValid ||
           isConvertAmountTooHigh ||
           (authMode === "header" && !canUseHeader)
         }
         onClick={async () => {
           const locked = convertQuote;
           if (locked) {
             setConvertLockedQuote(locked);
             setConvertLockedQuoteUpdatedAt(convertQuoteUpdatedAt ?? Date.now());
           }
           setLoadingAction("convert:execute");
           setError(null);
           try {
             const fromAsset = selectedConvertFromAsset;
             const toAsset = selectedConvertToAsset;
             if (!fromAsset || !toAsset) {
               throw new Error("convert_missing_asset");
             }

             const res = await fetchJsonOrThrow<{
               ok: true;
               convert?: { quote?: ConvertQuote };
             }>("/api/exchange/convert/execute", {
               method: "POST",
               headers: {
                 "content-type": "application/json",
                 ...(requestHeaders ?? {}),
               },
               body: JSON.stringify({
                 from: fromAsset.symbol.toUpperCase(),
                 to: toAsset.symbol.toUpperCase(),
                 amount_in: convertAmountIn,
                 ...(locked
                   ? {
                       client_quote: {
                         amount_out: locked.amountOut,
                         rate_to_per_from: locked.rateToPerFrom,
                       },
                     }
                   : {}),
                 ...(convertTotpCode.length === 6 ? { totp_code: convertTotpCode } : {}),
               }),
             });

             const q = res.convert?.quote;
           const receiptQ = q ?? locked ?? null;
             setToastKind("success");
             setToastMessage(
               q
                 ? `Converted ${q.amountIn} ${q.fromSymbol} → ${q.amountOut} ${q.toSymbol}.`
                 : "Conversion completed.",
             );
            if (receiptQ) {
              setConvertLastReceiptQuote(receiptQ);
              setConvertLastReceiptAt(Date.now());
              setConvertJustConverted(true);
              setFreezeWalletSortUntil(Date.now() + 3_000);
            }
             setConvertAmountIn("");
             setConvertTotpCode("");
             await refreshAll();
            setConvertLockedQuote(null);
            setConvertLockedQuoteUpdatedAt(null);
           } catch (e) {
             if (e instanceof ApiError) {
               if (e.code === "price_changed") {
                 const serverQuote = (e.details as any)?.server_quote as ConvertQuote | undefined;
                 if (serverQuote) {
                   setConvertQuote(serverQuote);
                   setConvertQuoteUpdatedAt(Date.now());
                 }
                 setToastKind("info");
                 setToastMessage("Price updated — review the new quote and tap Convert again.");
                 setConvertLockedQuote(null);
                 setConvertLockedQuoteUpdatedAt(null);
                 return;
               }
               if (e.code === "liquidity_unavailable") {
                 setToastKind("info");
                 setToastMessage("Insufficient liquidity to fill this conversion right now — try a smaller amount or try again later.");
                 setConvertLockedQuote(null);
                 setConvertLockedQuoteUpdatedAt(null);
                 setError({ code: e.code, details: e.details });
                 return;
               }
               setConvertLockedQuote(null);
               setConvertLockedQuoteUpdatedAt(null);
               setError({ code: e.code, details: e.details });
             } else {
               setConvertLockedQuote(null);
               setConvertLockedQuoteUpdatedAt(null);
               setError({ code: e instanceof Error ? e.message : String(e) });
             }
           } finally {
             setLoadingAction(null);
           }
         }}
       >
       {loadingAction === "convert:execute" ? "Converting…" : convertJustConverted ? "Converted" : "Convert"}
       </button>

      {convertQuote && (convertQuote.toSymbol === "USDT" || convertQuote.toSymbol === "BNB") ? (
        <Link
          className="w-full sm:w-fit rounded-lg border border-[var(--border)] bg-[var(--card)]/30 px-3 py-2 text-center text-xs font-medium text-[var(--foreground)] hover:bg-[var(--card)]"
          href={`/p2p?side=SELL&asset=${encodeURIComponent(convertQuote.toSymbol)}&fiat=${encodeURIComponent(localFiat)}${sellConvertP2pAmountParam ? `&amount=${encodeURIComponent(sellConvertP2pAmountParam)}` : ""}`}
        >
          Sell {convertQuote.toSymbol} (P2P)
        </Link>
      ) : (
        <Link
          className="w-full sm:w-fit rounded-lg border border-[var(--border)] bg-[var(--card)]/30 px-3 py-2 text-center text-xs font-medium text-[var(--foreground)] hover:bg-[var(--card)]"
          href={`/p2p?side=SELL&asset=USDT&fiat=${encodeURIComponent(localFiat)}${sellUsdtP2pAmountParam ? `&amount=${encodeURIComponent(sellUsdtP2pAmountParam)}` : ""}`}
        >
          Sell USDT (P2P)
        </Link>
      )}
     </div>
   </div>
   </div>
   </div>
 </div>
 ) : null}

 <div
   className="relative min-w-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]/55 p-4 shadow-[var(--shadow)]"
   style={{ clipPath: "polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 0 100%)" }}
 >
   <div
     className="pointer-events-none absolute inset-0 opacity-60"
     aria-hidden
     style={{
       backgroundImage:
         "radial-gradient(circle at 18% 28%, color-mix(in srgb, var(--accent) 18%, transparent) 0, transparent 58%), radial-gradient(circle at 86% 70%, color-mix(in srgb, var(--accent-2) 14%, transparent) 0, transparent 62%)",
     }}
   />
  <div className="relative">
    <div
      className="-mx-4 -mt-4 mb-4 flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--card-2)]/70 px-4 py-3"
      style={{ clipPath: "polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 0 100%)" }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
          <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
          <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
        </span>
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">P2P Desk</div>
          <h3 className="-mt-0.5 truncate text-sm font-extrabold tracking-tight text-[var(--foreground)]">Offload</h3>
        </div>
      </div>
      <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--card)]/25 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
        Local rail
      </span>
    </div>

    <p className="text-xs text-[var(--muted)]">Sell through P2P and settle to your local rail.</p>

    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      <Link
        className="w-full rounded-lg bg-[linear-gradient(90deg,var(--accent),var(--accent-2))] px-3 py-2 text-center text-xs font-extrabold text-[var(--background)] transition hover:brightness-110"
        href={`/p2p?new_ad=1&side=SELL&asset=USDT&fiat=${encodeURIComponent(localFiat)}`}
      >
        Post SELL ad
      </Link>
      <Link
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)]/25 px-3 py-2 text-center text-xs font-bold text-[var(--foreground)] transition hover:bg-[var(--card)]"
        href={`/p2p?side=SELL&asset=USDT&fiat=${encodeURIComponent(localFiat)}${sellUsdtP2pAmountParam ? `&amount=${encodeURIComponent(sellUsdtP2pAmountParam)}` : ""}`}
      >
        Browse buyers
      </Link>
    </div>
  </div>
 </div>


 </div>
 </div>
 </div>
 </section>
 );
}
