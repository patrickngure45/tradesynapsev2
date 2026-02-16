"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { ApiError, fetchJsonOrThrow } from "@/lib/api/client";
import { ApiErrorBanner, type ClientApiError } from"@/components/ApiErrorBanner";
import { Toast, type ToastKind } from"@/components/Toast";
import { persistActingUserIdPreference, readActingUserIdPreference } from"@/lib/state/actingUser";
import { formatTokenAmount, isNonZeroDecimalString } from "@/lib/format/amount";
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
  const withdrawSectionRef = useRef<HTMLDivElement | null>(null);
  const convertSectionRef = useRef<HTMLDivElement | null>(null);

 const [balances, setBalances] = useState<BalanceRow[]>([]);
 const [holds, setHolds] = useState<Hold[]>([]);
 const [localFiat, setLocalFiat] = useState<string>("USD");
 const [assetLocalRates, setAssetLocalRates] = useState<Record<string, number>>({});
 const [assetLocalRateSource, setAssetLocalRateSource] = useState<Record<string, string>>({});
 const [localValueReady, setLocalValueReady] = useState(false);

 const [authMode, setAuthMode] = useState<"session"|"header">("session");
 const [actingUserId, setActingUserId] = useState<string>(() => {
 if (typeof window ==="undefined") return"";
 return readActingUserIdPreference();
 });

 const [devUsers, setDevUsers] = useState<DevUser[]>([]);

 const [allowlist, setAllowlist] = useState<AllowlistRow[]>([]);
 const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);

 const [newAllowlistAddress, setNewAllowlistAddress] = useState<string>("");
 const [newAllowlistLabel, setNewAllowlistLabel] = useState<string>("");

 const [withdrawAssetId, setWithdrawAssetId] = useState<string>("");
 const [withdrawAmount, setWithdrawAmount] = useState<string>("");
 const [withdrawDestination, setWithdrawDestination] = useState<string>("");
 const [withdrawTotpCode, setWithdrawTotpCode] = useState<string>("");
 const [gasQuote, setGasQuote] = useState<GasQuote | null>(null);

 const [gasQuoteLoading, setGasQuoteLoading] = useState(false);
 const [gasQuoteUpdatedAt, setGasQuoteUpdatedAt] = useState<number | null>(null);

 const [transferGasQuoteLoading, setTransferGasQuoteLoading] = useState(false);
 const [transferGasQuoteUpdatedAt, setTransferGasQuoteUpdatedAt] = useState<number | null>(null);

 const [transferAssetId, setTransferAssetId] = useState<string>("");
 const [transferAmount, setTransferAmount] = useState<string>("");
 const [transferRecipientEmail, setTransferRecipientEmail] = useState<string>("");
 const [transferTotpCode, setTransferTotpCode] = useState<string>("");
 const [transferGasQuote, setTransferGasQuote] = useState<GasQuote | null>(null);

 const [depositSymbol, setDepositSymbol] = useState<string>("USDT");
 const [depositAmount, setDepositAmount] = useState<string>("25");
 const [depositTxHash, setDepositTxHash] = useState<string>("");
 const [depositAddress, setDepositAddress] = useState<string | null>(null);
 const [depositAddressLoading, setDepositAddressLoading] = useState(false);
 const [depositAddressCopied, setDepositAddressCopied] = useState(false);

 const [convertFromSymbol, setConvertFromSymbol] = useState<string>("");
 const [convertToSymbol, setConvertToSymbol] = useState<string>("USDT");
 const [convertAmountIn, setConvertAmountIn] = useState<string>("");
 const [convertTotpCode, setConvertTotpCode] = useState<string>("");
 const [convertQuote, setConvertQuote] = useState<ConvertQuote | null>(null);
 const [convertQuoteLoading, setConvertQuoteLoading] = useState(false);
 const [convertQuoteUpdatedAt, setConvertQuoteUpdatedAt] = useState<number | null>(null);
 const [convertQuoteNonce, setConvertQuoteNonce] = useState(0);

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

 const requestHeaders = useMemo(() => {
 if (authMode !=="header") return undefined;
 const id = actingUserId.trim();
 if (!id) return undefined;
 return {"x-user-id": id };
 }, [authMode, actingUserId]);

 const canUseHeader = actingUserId.trim() && isUuid(actingUserId.trim());

 const withdrawableAssets = useMemo(() => assets, [assets]);

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

 const selectedWithdrawAsset = useMemo(
 () => withdrawableAssets.find((asset) => asset.id === withdrawAssetId) ?? null,
 [withdrawableAssets, withdrawAssetId]
 );

 const selectedTransferAsset = useMemo(
 () => transferableAssets.find((asset) => asset.id === transferAssetId) ?? null,
 [transferableAssets, transferAssetId]
 );

 const selectedConvertFromAsset = useMemo(() => {
  const sym = convertFromSymbol.trim().toUpperCase();
  if (!sym) return null;
  return assets.find((a) => a.symbol.toUpperCase() === sym) ?? null;
 }, [assets, convertFromSymbol]);

 const selectedConvertToAsset = useMemo(() => {
  const sym = convertToSymbol.trim().toUpperCase();
  if (!sym) return null;
  return assets.find((a) => a.symbol.toUpperCase() === sym) ?? null;
 }, [assets, convertToSymbol]);

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

 const selectedWithdrawAvailable = useMemo(() => {
  if (!selectedWithdrawAsset) return 0;
  const row = balances.find((b) => b.asset_id === selectedWithdrawAsset.id);
  const available = Number(row?.available ?? NaN);
  return Number.isFinite(available) ? available : 0;
 }, [balances, selectedWithdrawAsset]);

 const transferAmountNumber = Number(transferAmount);
 const isTransferAmountValid = Number.isFinite(transferAmountNumber) && transferAmountNumber > 0;
 const isTransferAmountTooHigh = isTransferAmountValid && transferAmountNumber > selectedTransferAvailable;
 const isRecipientEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(transferRecipientEmail.trim());

 const withdrawAmountNumber = Number(withdrawAmount);
 const isWithdrawAmountValid = Number.isFinite(withdrawAmountNumber) && withdrawAmountNumber > 0;
 const isWithdrawAmountTooHigh = isWithdrawAmountValid && withdrawAmountNumber > selectedWithdrawAvailable;
 const isWithdrawDestinationValid = /^0x[a-fA-F0-9]{40}$/.test(withdrawDestination.trim());

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
  if (!localValueReady) return "";
  const row = balances.find((b) => b.symbol.toUpperCase() === "USDT");
  const available = Number(row?.available ?? NaN);
  const rate = assetLocalRates["USDT"];
  if (!Number.isFinite(available) || available <= 0) return "";
  if (!Number.isFinite(rate) || rate <= 0) return "";
  const fiatAmount = Math.floor(available * rate);
  return fiatAmount >= 1 ? String(fiatAmount) : "";
 }, [balances, assetLocalRates, localValueReady]);

 const balancesToDisplay = useMemo(() => {
  return nonZeroBalances.length > 0 ? nonZeroBalances : balances;
 }, [nonZeroBalances, balances]);

 const sortedBalances = useMemo(() => {
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
 return rows;
 }, [balancesToDisplay, localValueReady, assetLocalRates]);

 const balancesSummary = useMemo(() => {
 const activeHolds = holds.filter((h) => String(h.status ?? "").toLowerCase() === "active").length;
 if (!localValueReady) {
  return { assetCount: balancesToDisplay.length, activeHolds, totalLocal: null as number | null };
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
  return { assetCount: balancesToDisplay.length, activeHolds, totalLocal: hasAny ? total : null };
  }, [holds, balancesToDisplay, localValueReady, assetLocalRates]);

 async function loadAssetLocalRates(fiat: string) {
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
 const q = new URLSearchParams({ fiat });
 const market = await fetchWithTimeout<{
 assets?: Array<{ symbol: string; index_fiat?: string | null; index_usdt?: string | null }>;
 fx?: { usdt_fiat?: { mid?: number | string } | null };
 }>(`/api/exchange/markets/overview?${q.toString()}`, 4500);

 const rates: Record<string, number> = {};
 const rateSource: Record<string, string> = {};
 const indexUsdtBySymbol: Record<string, number> = {};

 for (const a of market.assets ?? []) {
 const sym = String(a.symbol ?? "").trim().toUpperCase();
 if (!sym) continue;

 const fiatVal = Number(a.index_fiat ?? NaN);
 if (Number.isFinite(fiatVal) && fiatVal > 0) {
 rates[sym] = fiatVal;
 rateSource[sym] = "Market index";
 }

 const usdtVal = Number(a.index_usdt ?? NaN);
 if (Number.isFinite(usdtVal) && usdtVal > 0) indexUsdtBySymbol[sym] = usdtVal;
 }

 const usdtFx = Number(market.fx?.usdt_fiat?.mid ?? NaN);
 if (Number.isFinite(usdtFx) && usdtFx > 0) {
 rates.USDT = usdtFx;
 rateSource.USDT = "Live FX";
 }

 let usdtLocal = rates.USDT ?? null;
 if (!(usdtLocal != null && Number.isFinite(usdtLocal) && usdtLocal > 0)) {
 try {
 const p2pUsdt = await fetchWithTimeout<{ ads?: Array<{ fixed_price?: string | number }> }>(
 `/api/p2p/ads?side=BUY&asset=USDT&fiat=${encodeURIComponent(fiat)}`,
 2500,
 );
 const px = Number(p2pUsdt.ads?.[0]?.fixed_price ?? NaN);
 if (Number.isFinite(px) && px > 0) {
 usdtLocal = px;
 rates.USDT = px;
 rateSource.USDT = "P2P";
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
 // For the anchor currency, always use freshest authoritative quote (no damping).
 out[symbol] = next;
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
 } catch {
 // Keep previous rates on transient failures to avoid flicker/jumps.
 }
 }

 async function refreshAll() {
 setLoadingAction("refresh");
 setError(null);
 setLocalValueReady(Object.keys(assetLocalRates).length > 0);

 try {
 const a = await fetchJsonOrThrow<{ assets: Asset[] }>("/api/exchange/assets", {
 cache:"no-store",
 });
 setAssets(a.assets ?? []);

 const b = await fetchJsonOrThrow<{ user_id: string; balances: BalanceRow[] }>(
"/api/exchange/balances",
 {
 cache:"no-store",
 headers: requestHeaders,
 }
 );
 setBalances(b.balances ?? []);

 try {
 const h = await fetchJsonOrThrow<{ holds: Hold[] }>("/api/exchange/holds?status=all", {
 cache:"no-store",
 headers: requestHeaders,
 });
 setHolds(h.holds ?? []);
 } catch {
 setHolds([]);
 }

 // Withdrawals are behind auth; keep them best-effort so balances still load.
 try {
 const wl = await fetchJsonOrThrow<{ addresses: AllowlistRow[] }>(
"/api/exchange/withdrawals/allowlist",
 { cache:"no-store", headers: requestHeaders }
 );
 setAllowlist(wl.addresses ?? []);
 } catch {
 setAllowlist([]);
 }

 try {
 const w = await fetchJsonOrThrow<{ withdrawals: WithdrawalRow[] }>(
"/api/exchange/withdrawals",
 { cache:"no-store", headers: requestHeaders }
 );
 setWithdrawals(w.withdrawals ?? []);
 } catch {
 setWithdrawals([]);
 }

 try {
 const p = await fetchJsonOrThrow<ProfileResponse>("/api/account/profile", {
 cache:"no-store",
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

 if (!holdAssetId && a.assets?.[0]?.id) setHoldAssetId(a.assets[0].id);
 if (!transferAssetId) {
 const firstTransferable = (a.assets ?? []).find((asset) => {
 const bal = b.balances?.find((row) => row.asset_id === asset.id);
 const available = Number(bal?.available ?? NaN);
 return Number.isFinite(available) && available > 0;
 })?.id;
 if (firstTransferable) setTransferAssetId(firstTransferable);
 }
 if (!withdrawAssetId && a.assets?.length) {
 const defaultWithdrawAsset = a.assets[0]?.id;
 if (defaultWithdrawAsset) setWithdrawAssetId(defaultWithdrawAsset);
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

 const tick = async () => {
 if (cancelled) return;
 await loadAssetLocalRates(localFiat);
 };

 void tick();
 const timer = window.setInterval(() => {
 void tick();
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
 if (!withdrawAssetId || withdrawableAssets.some((asset) => asset.id === withdrawAssetId)) return;
 setWithdrawAssetId(withdrawableAssets[0]?.id ?? "");
 }, [withdrawAssetId, withdrawableAssets]);

 useEffect(() => {
 if (!transferAssetId || transferableAssets.some((asset) => asset.id === transferAssetId)) return;
 setTransferAssetId(transferableAssets[0]?.id ?? "");
 }, [transferAssetId, transferableAssets]);

 useEffect(() => {
 if (authMode ==="header"&& !canUseHeader) {
  setGasQuote(null);
  setGasQuoteLoading(false);
  setGasQuoteUpdatedAt(null);
  return;
 }
 if (!selectedWithdrawAsset) {
  setGasQuote(null);
  setGasQuoteLoading(false);
  setGasQuoteUpdatedAt(null);
  return;
 }

  let cancelled = false;
  const chain = selectedWithdrawAsset.chain;
  const sym = selectedWithdrawAsset.symbol;

  const timer = window.setTimeout(() => {
  void (async () => {
   setGasQuoteLoading(true);
   try {
    const qs = new URLSearchParams({
    action: "withdrawal_request",
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
    setGasQuote(json.quote ?? null);
    setGasQuoteUpdatedAt(Date.now());
    }
   } catch {
    if (!cancelled) setGasQuote(null);
   } finally {
    if (!cancelled) setGasQuoteLoading(false);
   }
  })();
  }, 250);

  return () => {
  cancelled = true;
  window.clearTimeout(timer);
  };
 }, [authMode, canUseHeader, requestHeaders, selectedWithdrawAsset?.chain, selectedWithdrawAsset?.symbol]);

 useEffect(() => {
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
  const timer = window.setTimeout(() => {
    void (async () => {
      setConvertQuoteLoading(true);
      try {
        const qs = new URLSearchParams({
          from,
          to,
          amount_in: convertAmountIn,
        });
        const json = await fetchJsonOrThrow<{ ok: boolean; quote: ConvertQuote }>(
          `/api/exchange/convert/quote?${qs.toString()}`,
          { cache: "no-store" },
        );
        if (!cancelled) {
          setConvertQuote(json.quote ?? null);
          setConvertQuoteUpdatedAt(Date.now());
        }
      } catch {
        if (!cancelled) setConvertQuote(null);
      } finally {
        if (!cancelled) setConvertQuoteLoading(false);
      }
    })();
  }, 250);

  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
 }, [convertFromSymbol, convertToSymbol, convertAmountIn, isConvertAmountValid, isConvertAmountTooHigh, convertQuoteNonce]);

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
 }, [convertFromSymbol, convertToSymbol, convertAmountIn, isConvertAmountValid, isConvertAmountTooHigh]);

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
 <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-6">
 <Toast message={toastMessage} kind={toastKind} onDone={() => setToastMessage(null)} />

 <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
 <div className="min-w-0">
 <h2 className="text-lg font-medium">Trading Balance (P2P & Spot)</h2>
 <p className="mt-1 text-sm text-[var(--muted)]">
 Funds available for P2P trading and spot markets.
 </p>
 </div>

 <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
   <button
   type="button"
   className="w-full whitespace-normal break-words sm:w-auto rounded border border-[var(--border)] px-3 py-2 text-xs text-[var(--foreground)] hover:bg-[var(--card)] disabled:opacity-60"
   disabled={loadingAction === "refresh"}
   onClick={() => void refreshAll()}
   >
   {loadingAction === "refresh" ?"Refreshing…":"Refresh"}
   </button>
   <button
   type="button"
  onClick={() => void runEvacuation()}
  disabled={loadingAction === "evacuate" || (authMode === "header" && !canUseHeader)}
  className="w-full whitespace-normal break-words sm:w-auto rounded border border-[var(--up)]/30 bg-[var(--up)]/10 px-3 py-2 text-xs font-bold text-[var(--up)] hover:bg-[var(--up)]/20"
   >
  {loadingAction === "evacuate" ? "Processing…" : "Add funds"}
   </button>
 </div>
 </div>

 <div className="mt-4 grid min-w-0 gap-3">
 <ApiErrorBanner error={error} className="p-3"onRetry={() => void refreshAll()} />

 {/* ── Deposit Address ─────────────────────────────── */}
 <div ref={depositSectionRef} className="mt-2 rounded border border-[var(--border)] bg-[var(--card)]/50 p-4">
 <h3 className="text-sm font-medium">Deposit (BSC)</h3>
 <p className="mt-1 text-[11px] text-[var(--muted)]">
 Send supported BEP-20 tokens or native BNB to your unique deposit address. The deposit watcher credits your ledger automatically.
 </p>
 {depositAddress ? (
 <div className="mt-2 flex flex-wrap items-center gap-2">
 <code className="min-w-0 break-all rounded bg-[var(--border)] px-2.5 py-1.5 font-mono text-xs text-[var(--foreground)]">
 {depositAddress}
 </code>
 <button
 type="button"
 className="rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--card)_90%,transparent)]"
 onClick={() => {
 void navigator.clipboard.writeText(depositAddress);
 setDepositAddressCopied(true);
 setTimeout(() => setDepositAddressCopied(false), 2000);
 }}
 >
 {depositAddressCopied ?"Copied!":"Copy"}
 </button>
 </div>
 ) : (
 <button
 type="button"
 className="mt-2 rounded bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--background)] disabled:opacity-60"
 disabled={depositAddressLoading || (authMode ==="header"&& !canUseHeader)}
 onClick={async () => {
 setDepositAddressLoading(true);
 setError(null);
 try {
 const res = await fetchJsonOrThrow<{ address: string }>(
"/api/exchange/deposit/address",
 {
 method:"POST",
 headers: {
"content-type":"application/json",
 ...(requestHeaders ?? {}),
 },
 }
 );
 setDepositAddress(res.address);
 } catch (e) {
 if (e instanceof ApiError) {
 setError({ code: e.code, details: e.details });
 } else {
 setError({ code: e instanceof Error ? e.message : String(e) });
 }
 } finally {
 setDepositAddressLoading(false);
 }
 }}
 >
 {depositAddressLoading ?"Generating…":"Generate deposit address"}
 </button>
 )}
 </div>

 <div className="mt-2 min-w-0">
 <h3 className="text-sm font-medium">Balances</h3>

 {nonZeroBalances.length === 0 ? (
   <div className="mt-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)]/50 px-4 py-4 text-xs">
     <div className="font-medium text-[var(--foreground)]">No funds yet</div>
     <div className="mt-1 text-[var(--muted)]">
       Your wallet supports {balances.length} assets. Generate a deposit address above and send tokens to get started.
     </div>
   </div>
 ) : null}

 <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)]">
 <span className="rounded border border-[var(--border)] px-2 py-1">Assets: {balancesSummary.assetCount}</span>
 <span className="rounded border border-[var(--border)] px-2 py-1">Active holds: {balancesSummary.activeHolds}</span>
 <span className="rounded border border-[var(--border)] px-2 py-1">
 Est. total (available): {!localValueReady ? "Updating…" : balancesSummary.totalLocal == null ? `— ${localFiat}` : fmtFiat(balancesSummary.totalLocal, localFiat)}
 </span>
 </div>

 {/* Mobile layout (no horizontal scrolling) */}
 {/* Wallet-style card grid (all breakpoints) */}
 <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
   {sortedBalances.length === 0 ? (
     <div className="rounded border border-[var(--border)] px-3 py-3 text-xs text-[var(--muted)]">
       No balances available.
     </div>
   ) : (
     sortedBalances.map((b) => {
       const meta = assetById.get(b.asset_id) ?? null;
       const symbol = String(b.symbol ?? "").toUpperCase();
       const displayName = String(meta?.name ?? "").trim() || symbol;
       const chain = String(b.chain ?? meta?.chain ?? "").toUpperCase();

       const availableNum = Number(b.available);
       const rate = assetLocalRates[symbol] ?? null;
       const rowLocalEquivalent =
         Number.isFinite(availableNum) && rate != null ? availableNum * rate : null;

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
        <div key={b.asset_id} className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--card)]/50 p-4">
           <div className="flex min-w-0 items-start justify-between gap-4">
             <div className="min-w-0">
               <div className="flex min-w-0 flex-wrap items-center gap-2">
                 <div className="min-w-0 truncate text-sm font-semibold text-[var(--foreground)]">{displayName}</div>
                 <span className="shrink-0 rounded border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted)]">
                   {symbol}
                 </span>
                 {chain ? (
                   <span className="shrink-0 rounded border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted)]">
                     {chain}
                   </span>
                 ) : null}
               </div>
               {localValueReady && assetLocalRateSource[symbol] ? (
                 <div className="mt-1 break-words text-[10px] text-[var(--muted)]">
                   {assetLocalRateSource[symbol]}
                 </div>
               ) : null}
             </div>

             <div className="shrink-0 text-right">
               <div className="text-[10px] text-[var(--muted)]">Available</div>
               <div className="mt-0.5 break-all font-mono text-sm font-bold text-[var(--foreground)]">
                 {fmtAmount(b.available, b.decimals)} {symbol}
               </div>
               <div className="mt-0.5 text-[11px] text-[var(--muted)]">
                 ≈ {!localValueReady
                   ? "Updating…"
                   : rowLocalEquivalent == null
                     ? `— ${localFiat}`
                     : fmtFiat(rowLocalEquivalent, localFiat)}
               </div>
             </div>
           </div>

           <div className="mt-3 flex flex-wrap gap-2">
             <button
               type="button"
               className="rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--foreground)] hover:bg-[var(--card)]"
               onClick={() => scrollToSection(depositSectionRef)}
             >
               Deposit
             </button>

             {canSellP2p ? (
               <Link
                 className="rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--foreground)] hover:bg-[var(--card)]"
                 href={`/p2p?side=SELL&asset=${encodeURIComponent(symbol)}&fiat=${encodeURIComponent(localFiat)}${sellP2pAmountParam ? `&amount=${encodeURIComponent(sellP2pAmountParam)}` : ""}`}
               >
                 Sell (P2P)
               </Link>
             ) : null}

             {canConvertToUsdt ? (
               <button
                 type="button"
                 className="rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--foreground)] hover:bg-[var(--card)]"
                 onClick={() => {
                   setConvertFromSymbol(symbol);
                   setConvertToSymbol("USDT");
                   setConvertAmountIn(String(b.available));
                   scrollToSection(convertSectionRef);
                 }}
               >
                 Convert to USDT
               </button>
             ) : null}

             <button
               type="button"
               className="rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--foreground)] hover:bg-[var(--card)] disabled:opacity-50"
               disabled={!canSend}
               onClick={() => {
                 if (!canSend) return;
                 setTransferAssetId(b.asset_id);
                 scrollToSection(sendSectionRef);
               }}
             >
               Send
             </button>
             <button
               type="button"
               className="rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--foreground)] hover:bg-[var(--card)] disabled:opacity-50"
               disabled={!canWithdraw}
               onClick={() => {
                 if (!canWithdraw) return;
                 setWithdrawAssetId(b.asset_id);
                 scrollToSection(withdrawSectionRef);
               }}
             >
               Withdraw
             </button>
           </div>

           <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
             <div className="min-w-0">
               <div className="text-[10px] text-[var(--muted)]">Total</div>
               <div className="break-all font-mono text-[var(--muted)]">{fmtAmount(b.posted, b.decimals)}</div>
             </div>
             <div className="min-w-0 text-right">
               <div className="text-[10px] text-[var(--muted)]">Locked</div>
               <div className="break-all font-mono text-[var(--muted)]">{fmtAmount(b.held, b.decimals)}</div>
             </div>
           </div>
         </div>
       );
     })
   )}
 </div>
 </div>

 <div className="mt-2 grid min-w-0 gap-3 md:grid-cols-2">
 <div ref={sendSectionRef} className="min-w-0 rounded-xl border border-[var(--border)] p-4">
 <h3 className="text-sm font-medium">Send funds to another user</h3>
 <p className="mt-1 text-xs text-[var(--muted)]">
 Instant internal transfer by recipient email. Network fee is estimated in BNB and may be charged in the asset you send.
 </p>
 <div className="mt-3 grid gap-2">
 <label className="grid gap-1">
 <span className="text-[11px] text-[var(--muted)]">Asset</span>
 <select
 className="rounded border border-[var(--border)] bg-transparent px-2 py-2 text-xs"
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
 className="flex-1 rounded border border-[var(--border)] bg-transparent px-2 py-2 font-mono text-xs"
 value={transferAmount}
 onChange={(e) => setTransferAmount(e.target.value)}
 placeholder="e.g. 100"
 inputMode="decimal"
 />
 <button
 type="button"
 className="rounded border border-[var(--border)] px-2 py-2 text-[11px] text-[var(--foreground)] hover:bg-[var(--card)] disabled:opacity-60"
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
 className="rounded border border-[var(--border)] bg-transparent px-2 py-2 text-xs"
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
 className="rounded border border-[var(--border)] bg-transparent px-2 py-2 font-mono text-xs"
 value={transferTotpCode}
 onChange={(e) => setTransferTotpCode(e.target.value.replace(/\D/g,"").slice(0, 6))}
 placeholder="6-digit code"
 inputMode="numeric"
 maxLength={6}
 autoComplete="one-time-code"
 />
 </label>

 <div className="rounded border border-[var(--border)] px-2 py-2 text-[11px] text-[var(--muted)]">
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
 className="mt-1 w-full sm:w-fit rounded bg-[var(--foreground)] px-3 py-2 text-xs font-medium text-[var(--background)] disabled:opacity-60"
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

 <div ref={convertSectionRef} className="min-w-0 rounded-xl border border-[var(--border)] p-4">
   <h3 className="text-sm font-medium">Convert (internal)</h3>
   <p className="mt-1 text-xs text-[var(--muted)]">
     Convert one asset to another instantly using a quoted rate (updates automatically). Best for turning non-P2P assets into USDT for offloading.
   </p>

   <div className="mt-3 grid gap-2">
    <div className="grid gap-2 sm:grid-cols-2">
       <label className="grid gap-1">
         <span className="text-[11px] text-[var(--muted)]">From</span>
         <select
           className="rounded border border-[var(--border)] bg-transparent px-2 py-2 text-xs"
           value={convertFromSymbol}
           onChange={(e) => setConvertFromSymbol(e.target.value)}
         >
           <option value="">(select)</option>
           {assets
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
                   {a.symbol.toUpperCase()} ({a.chain}){has ? "" : " — 0"}
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
           className="rounded border border-[var(--border)] bg-transparent px-2 py-2 text-xs"
           value={convertToSymbol}
           onChange={(e) => setConvertToSymbol(e.target.value)}
         >
          {assets
            .slice()
            .sort((a, b) => a.symbol.localeCompare(b.symbol))
            .map((a) => (
              <option key={a.id} value={a.symbol.toUpperCase()}>
                {a.symbol.toUpperCase()} ({a.chain})
              </option>
            ))}
         </select>
       </label>
     </div>

    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--foreground)] hover:bg-[var(--card)] disabled:opacity-60"
        disabled={!convertFromSymbol || !convertToSymbol}
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
        className="rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--foreground)] hover:bg-[var(--card)] disabled:opacity-60"
        disabled={!!convertDisableReason}
        onClick={() => setConvertQuoteNonce((n) => n + 1)}
      >
        Refresh quote
      </button>
    </div>

     <label className="grid gap-1">
       <span className="text-[11px] text-[var(--muted)]">Amount</span>
       <div className="flex items-center gap-2">
         <input
           className="flex-1 rounded border border-[var(--border)] bg-transparent px-2 py-2 font-mono text-xs"
           value={convertAmountIn}
           onChange={(e) => setConvertAmountIn(e.target.value)}
           placeholder="e.g. 10"
           inputMode="decimal"
         />
         <button
           type="button"
           className="rounded border border-[var(--border)] px-2 py-2 text-[11px] text-[var(--foreground)] hover:bg-[var(--card)] disabled:opacity-60"
          disabled={!selectedConvertFromAsset || selectedConvertAvailableBig <= 0n}
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
         className="rounded border border-[var(--border)] bg-transparent px-2 py-2 font-mono text-xs"
         value={convertTotpCode}
         onChange={(e) => setConvertTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
         placeholder="6-digit code"
         inputMode="numeric"
         maxLength={6}
         autoComplete="one-time-code"
       />
     </label>

     <div className="rounded border border-[var(--border)] px-2 py-2 text-[11px] text-[var(--muted)]">
       {convertQuoteLoading ? (
         <div className="mb-1 break-words text-[10px] text-[var(--muted)]">Updating quote…</div>
       ) : null}
       {convertQuote ? (
         <>
           <div className="break-words">
             Rate:{" "}
             <span className="break-all font-mono text-[var(--foreground)]">{fmtAmount(convertQuote.rateToPerFrom, 8)}</span>
             <span className="ml-1">{convertQuote.toSymbol} per {convertQuote.fromSymbol}</span>
             {typeof convertQuoteUpdatedAt === "number" ? (
               <span className="ml-1">• updated {new Date(convertQuoteUpdatedAt).toLocaleTimeString()}</span>
             ) : null}
           </div>
           <div className="mt-1 break-words">
            You receive:{" "}
             <span className="break-all font-mono text-[var(--foreground)]">
               {fmtAmount(convertQuote.amountOut, selectedConvertToAsset?.decimals ?? 6)} {convertQuote.toSymbol}
             </span>
            <span className="ml-1">(fee {fmtAmount(convertQuote.feeIn, selectedConvertFromAsset?.decimals ?? 6)} {convertQuote.fromSymbol})</span>
           </div>
          <div className="mt-1 break-words text-[10px] text-[var(--muted)]">
            Price source: {convertQuote.priceSource.kind}
          </div>
         </>
       ) : (
         <>Quote: <span className="font-mono">—</span></>
       )}
     </div>

     <div className="flex flex-wrap gap-2">
       <button
         type="button"
         className="w-full sm:w-fit rounded bg-[var(--foreground)] px-3 py-2 text-xs font-medium text-[var(--background)] disabled:opacity-60"
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
                 ...(convertTotpCode.length === 6 ? { totp_code: convertTotpCode } : {}),
               }),
             });

             const q = res.convert?.quote;
             setToastKind("success");
             setToastMessage(
               q
                 ? `Converted ${q.amountIn} ${q.fromSymbol} → ${q.amountOut} ${q.toSymbol}.`
                 : "Conversion completed.",
             );
             setConvertAmountIn("");
             setConvertTotpCode("");
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
         {loadingAction === "convert:execute" ? "Converting…" : "Convert"}
       </button>

       <Link
         className="w-full sm:w-fit rounded border border-[var(--border)] px-3 py-2 text-center text-xs font-medium text-[var(--foreground)] hover:bg-[var(--card)]"
         href={`/p2p?side=SELL&asset=USDT&fiat=${encodeURIComponent(localFiat)}${sellUsdtP2pAmountParam ? `&amount=${encodeURIComponent(sellUsdtP2pAmountParam)}` : ""}`}
       >
         Sell USDT (P2P)
       </Link>
     </div>
   </div>
 </div>

 <div ref={withdrawSectionRef} className="min-w-0 rounded-xl border border-[var(--border)] p-4">
   <h3 className="text-sm font-medium">Withdraw to external address</h3>
   <p className="mt-1 text-xs text-[var(--muted)]">
     Withdrawals require an allowlisted destination address (BSC). Network fee is estimated in BNB and may be charged in the asset you withdraw.
   </p>

   <div className="mt-3 grid gap-2">
     <label className="grid gap-1">
       <span className="text-[11px] text-[var(--muted)]">Asset</span>
       <select
         className="rounded border border-[var(--border)] bg-transparent px-2 py-2 text-xs"
         value={withdrawAssetId}
         onChange={(e) => setWithdrawAssetId(e.target.value)}
       >
         <option value="">(select)</option>
         {withdrawableAssets.map((a) => (
           <option key={a.id} value={a.id}>
             {a.symbol} ({a.chain})
           </option>
         ))}
       </select>
       {selectedWithdrawAsset ? (
         <span className="break-words text-[11px] text-[var(--muted)]">
           Available:{" "}
           <span className="break-all font-mono text-[var(--foreground)]">
             {fmtAmount(String(selectedWithdrawAvailable), selectedWithdrawAsset.decimals)} {selectedWithdrawAsset.symbol.toUpperCase()}
           </span>
         </span>
       ) : null}
     </label>

     <label className="grid gap-1">
       <span className="text-[11px] text-[var(--muted)]">Amount</span>
       <div className="flex items-center gap-2">
         <input
           className="flex-1 rounded border border-[var(--border)] bg-transparent px-2 py-2 font-mono text-xs"
           value={withdrawAmount}
           onChange={(e) => setWithdrawAmount(e.target.value)}
           placeholder="e.g. 25"
           inputMode="decimal"
         />
         <button
           type="button"
           className="rounded border border-[var(--border)] px-2 py-2 text-[11px] text-[var(--foreground)] hover:bg-[var(--card)] disabled:opacity-60"
           disabled={!selectedWithdrawAsset || selectedWithdrawAvailable <= 0}
           onClick={() => setWithdrawAmount(String(selectedWithdrawAvailable))}
         >
           Max
         </button>
       </div>
       {isWithdrawAmountTooHigh ? (
         <span className="text-[11px] text-[var(--down)]">Amount exceeds available balance.</span>
       ) : null}
     </label>

     <label className="grid gap-1">
       <span className="text-[11px] text-[var(--muted)]">Destination address (BSC)</span>
       <input
         className="rounded border border-[var(--border)] bg-transparent px-2 py-2 font-mono text-xs"
         value={withdrawDestination}
         onChange={(e) => setWithdrawDestination(e.target.value)}
         placeholder="0x…"
         autoCapitalize="none"
         autoCorrect="off"
         spellCheck={false}
       />
       {withdrawDestination && !isWithdrawDestinationValid ? (
         <span className="text-[11px] text-[var(--down)]">Enter a valid 0x address.</span>
       ) : null}

       {allowlist.filter((a) => String(a.status ?? "").toLowerCase() === "active").length > 0 ? (
         <div className="mt-1 text-[11px] text-[var(--muted)]">
           Allowlisted:{" "}
           {allowlist
             .filter((a) => String(a.status ?? "").toLowerCase() === "active")
             .slice(0, 3)
             .map((a) => a.address)
             .join(" • ")}
           {allowlist.filter((a) => String(a.status ?? "").toLowerCase() === "active").length > 3 ? " …" : ""}
         </div>
       ) : isProd ? (
         <div className="mt-1 text-[11px] text-[var(--muted)]">No allowlisted addresses found. Ask support/admin to add one.</div>
       ) : (
         <div className="mt-1 text-[11px] text-[var(--muted)]">No allowlisted addresses found (dev). Add one via the withdrawals allowlist API.</div>
       )}
     </label>

     <label className="grid gap-1">
       <span className="text-[11px] text-[var(--muted)]">2FA Code (if enabled)</span>
       <input
         className="rounded border border-[var(--border)] bg-transparent px-2 py-2 font-mono text-xs"
         value={withdrawTotpCode}
         onChange={(e) => setWithdrawTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
         placeholder="6-digit code"
         inputMode="numeric"
         maxLength={6}
         autoComplete="one-time-code"
       />
     </label>

     <div className="rounded border border-[var(--border)] px-2 py-2 text-[11px] text-[var(--muted)]">
       {gasQuoteLoading ? (
         <div className="mb-1 break-words text-[10px] text-[var(--muted)]">Updating network fee…</div>
       ) : null}
       {gasQuote && !gasQuote.enabled ? (
         <div className="break-words">
           {Number(gasQuote.amount) > 0 ? (
             <>
               Estimated network fee:{" "}
               <span className="break-all font-mono text-[var(--foreground)]">{fmtAmount(gasQuote.amount, 8)} {gasQuote.gasSymbol}</span>
               <span className="ml-1">(waived)</span>
             </>
           ) : (
             <>
               Network fee: <span className="font-mono text-[var(--foreground)]">off</span>
               <span className="ml-1">({gasQuote.gasSymbol})</span>
             </>
           )}
         </div>
       ) : gasQuote?.enabled && Number(gasQuote.amount) > 0 ? (
         <>
           <div className="break-words">
             Estimated network fee:{" "}
             <span className="break-all font-mono text-[var(--foreground)]">{fmtAmount(gasQuote.amount, 8)} {gasQuote.gasSymbol}</span>
             <span className="ml-1">({gasQuote.mode === "realtime" ? "live" : "fixed"})</span>
             {typeof gasQuoteUpdatedAt === "number" ? (
               <span className="ml-1">• updated {new Date(gasQuoteUpdatedAt).toLocaleTimeString()}</span>
             ) : null}
           </div>
           {gasQuote.chargeAmount && gasQuote.chargeSymbol && selectedWithdrawAsset ? (
             <div className="break-words text-[11px] text-[var(--muted)]">
               Charged as{" "}
               <span className="break-all font-mono text-[var(--foreground)]">{fmtAmount(gasQuote.chargeAmount, selectedWithdrawAsset.decimals)} {gasQuote.chargeSymbol.toUpperCase()}</span>
             </div>
           ) : (
             <div className="break-words text-[11px] text-[var(--up)]">Covered by the platform (conversion unavailable)</div>
           )}
         </>
       ) : (
         <>Network fee: <span className="font-mono">—</span></>
       )}
     </div>

     <button
       type="button"
       className="mt-1 w-full sm:w-fit rounded bg-[var(--foreground)] px-3 py-2 text-xs font-medium text-[var(--background)] disabled:opacity-60"
       disabled={
         loadingAction === "withdraw:request" ||
         !withdrawAssetId ||
         !withdrawableAssets.some((asset) => asset.id === withdrawAssetId) ||
         !withdrawAmount ||
         !isWithdrawAmountValid ||
         isWithdrawAmountTooHigh ||
         !withdrawDestination ||
         !isWithdrawDestinationValid ||
         (authMode === "header" && !canUseHeader)
       }
       onClick={async () => {
         setLoadingAction("withdraw:request");
         setError(null);
         try {
           const res = await fetchJsonOrThrow<{
             withdrawal?: {
               id: string;
               symbol?: string;
               amount?: string;
               fees?: {
                 network_fee_display_amount?: string;
                 network_fee_display_symbol?: string;
                 fee_charged_in_asset_amount?: string;
                 fee_charged_in_asset_symbol?: string;
               };
             };
           }>("/api/exchange/withdrawals/request", {
             method: "POST",
             headers: {
               "content-type": "application/json",
               ...(requestHeaders ?? {}),
             },
             body: JSON.stringify({
               asset_id: withdrawAssetId,
               amount: withdrawAmount,
               destination_address: withdrawDestination.trim(),
               ...(withdrawTotpCode.length === 6 ? { totp_code: withdrawTotpCode } : {}),
             }),
           });

           setToastKind("success");
           const sym = (res.withdrawal?.symbol ?? selectedWithdrawAsset?.symbol ?? "").toUpperCase();
           const amt = res.withdrawal?.amount ?? withdrawAmount;
           const feeAmt = res.withdrawal?.fees?.network_fee_display_amount;
           const feeSym = res.withdrawal?.fees?.network_fee_display_symbol;
           setToastMessage(
             feeAmt && feeSym
               ? `Withdrawal requested: ${amt} ${sym} • network ${feeAmt} ${feeSym}.`
               : `Withdrawal requested: ${amt} ${sym}.`,
           );
           setWithdrawAmount("");
           setWithdrawDestination("");
           setWithdrawTotpCode("");
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
       {loadingAction === "withdraw:request" ? "Requesting…" : "Request withdrawal"}
     </button>
   </div>
 </div>

 <div className="rounded-xl border border-[var(--border)] p-4 hidden">
 <h3 className="text-sm font-medium">Create hold</h3>
 <div className="mt-3 grid gap-2">
 <label className="grid gap-1">
 <span className="text-[11px] text-[var(--muted)]">Asset</span>
 <select
 className="rounded border border-[var(--border)] bg-transparent px-2 py-2 text-xs"
 value={holdAssetId}
 onChange={(e) => setHoldAssetId(e.target.value)}
 >
 <option value="">(select)</option>
 {assets.map((a) => (
 <option key={a.id} value={a.id}>
 {a.symbol} ({a.chain})
 </option>
 ))}
 </select>
 </label>

 <label className="grid gap-1">
 <span className="text-[11px] text-[var(--muted)]">Amount</span>
 <input
 className="rounded border border-[var(--border)] bg-transparent px-2 py-2 font-mono text-xs"
 value={holdAmount}
 onChange={(e) => setHoldAmount(e.target.value)}
 placeholder="e.g. 25"
 inputMode="decimal"
 />
 </label>

 <div className="rounded border border-[var(--border)] px-2 py-2 text-[11px] text-[var(--muted)]">
 {gasQuoteLoading ? (
 <div className="mb-1 break-words text-[10px] text-[var(--muted)]">Updating network fee…</div>
 ) : null}
 {gasQuote && !gasQuote.enabled ? (
 <div className="break-words">
 {Number(gasQuote.amount) > 0 ? (
 <>
 Estimated network fee: <span className="break-all font-mono text-[var(--foreground)]">{fmtAmount(gasQuote.amount, 8)} {gasQuote.gasSymbol}</span>
 <span className="ml-1">(waived)</span>
 </>
 ) : (
 <>
 Network fee: <span className="font-mono text-[var(--foreground)]">off</span>
 <span className="ml-1">({gasQuote.gasSymbol})</span>
 </>
 )}
 </div>
 ) : gasQuote?.enabled && Number(gasQuote.amount) > 0 ? (
 <>
 <div className="break-words">
 Estimated network fee: <span className="break-all font-mono text-[var(--foreground)]">{fmtAmount(gasQuote.amount, 8)} {gasQuote.gasSymbol}</span>
 <span className="ml-1">({gasQuote.mode ==="realtime" ? "live" : "fixed"})</span>
 {typeof gasQuoteUpdatedAt === "number" ? (
 <span className="ml-1">• updated {new Date(gasQuoteUpdatedAt).toLocaleTimeString()}</span>
 ) : null}
 </div>
 {gasQuote.chargeAmount && gasQuote.chargeSymbol ? (
 <div className="mt-1 break-words text-[11px] text-[var(--muted)]">
 Charged as <span className="break-all font-mono text-[var(--foreground)]">{fmtAmount(gasQuote.chargeAmount, 8)} {gasQuote.chargeSymbol}</span>
 </div>
 ) : null}
 </>
 ) : (
 <>Network fee: <span className="font-mono">—</span></>
 )}
 </div>

 <label className="grid gap-1">
 <span className="text-[11px] text-[var(--muted)]">Reason</span>
 <input
 className="rounded border border-[var(--border)] bg-transparent px-2 py-2 text-xs"
 value={holdReason}
 onChange={(e) => setHoldReason(e.target.value)}
 placeholder="order_hold"
 />
 </label>

 <button
 type="button"
 className="mt-1 w-fit rounded bg-[var(--foreground)] px-3 py-2 text-xs font-medium text-[var(--background)] disabled:opacity-60"
 disabled={loadingAction === "hold:create" || !holdAssetId || !holdAmount || (authMode ==="header"&& !canUseHeader)}
 onClick={async () => {
 setLoadingAction("hold:create");
 setError(null);
 try {
 const res = await fetchJsonOrThrow<{ hold?: { id: string; asset_id: string; amount: string; reason: string; status: string } }>(
"/api/exchange/holds",
 {
 method:"POST",
 headers: {
"content-type":"application/json",
 ...(requestHeaders ?? {}),
 },
 body: JSON.stringify({
 asset_id: holdAssetId,
 amount: holdAmount,
 reason: holdReason,
 }),
 }
 );

 if (!res.hold?.id) throw new Error("hold_create_missing_id");

 setToastKind("success");
 setToastMessage("Hold created.");
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
 Create hold
 </button>
 </div>
 </div>

 <div className="rounded-xl border border-[var(--border)] p-4 hidden">
 <h3 className="text-sm font-medium">Holds (this page)</h3>
 <p className="mt-1 text-xs text-[var(--muted)]">
 Holds are loaded from the server.
 </p>

 <div className="mt-3 grid gap-2">
 {holds.length === 0 ? (
 <div className="text-xs text-[var(--muted)]">No holds created yet.</div>
 ) : (
 holds.map((h) => (
 <div
 key={h.id}
 className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--border)] px-3 py-2 text-xs"
 >
 <div className="min-w-0 flex-1">
 <div className="font-medium">
 {h.symbol} {h.amount} <span className="text-[var(--muted)]">({h.status})</span>
 </div>
 <div className="truncate max-w-[8rem] font-mono text-[11px] text-[var(--muted)]" title={h.id}>{h.id}</div>
 </div>

 <button
 type="button"
 className="rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--foreground)] hover:bg-[var(--card)] disabled:opacity-60"
 disabled={loadingAction === `hold:release:${h.id}` || h.status !=="active"|| (authMode ==="header"&& !canUseHeader)}
 onClick={async () => {
 setLoadingAction(`hold:release:${h.id}`);
 setError(null);
 try {
 await fetchJsonOrThrow<{ ok: true }>(`/api/exchange/holds/${h.id}`, {
 method:"DELETE",
 headers: requestHeaders,
 });
 setToastKind("success");
 setToastMessage("Hold released.");
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
 Release
 </button>
 </div>
 ))
 )}
 </div>
 </div>
 </div>

 </div>

{/* Dev tools removed */}

 {isAdmin ? (
 <div className="mt-2 rounded-xl border border-[var(--border)] p-4">
 <div>
 <h3 className="text-sm font-medium">Admin: Reverse transfer</h3>
 <p className="mt-1 text-xs text-[var(--muted)]">
 Creates a compensating ledger entry. Only succeeds if the recipient still has enough available balance.
 </p>
 </div>

 <div className="mt-3 grid gap-2 md:grid-cols-2">
 <label className="grid gap-1">
 <span className="text-[11px] text-[var(--muted)]">Transfer entry id</span>
 <input
 className="rounded border border-[var(--border)] bg-transparent px-2 py-2 font-mono text-xs"
 value={reverseTransferId}
 placeholder="uuid"
 onChange={(e) => setReverseTransferId(e.target.value)}
 />
 </label>
 <label className="grid gap-1">
 <span className="text-[11px] text-[var(--muted)]">Reason (optional)</span>
 <input
 className="rounded border border-[var(--border)] bg-transparent px-2 py-2 text-xs"
 value={reverseTransferReason}
 placeholder="customer_support"
 onChange={(e) => setReverseTransferReason(e.target.value)}
 />
 </label>
 </div>

 <button
 type="button"
 className="mt-3 w-fit rounded bg-[var(--foreground)] px-3 py-2 text-xs font-medium text-[var(--background)] disabled:opacity-60"
 disabled={
 loadingAction === "admin:transfer:reverse" ||
 !reverseTransferId.trim() ||
 !isUuid(reverseTransferId.trim()) ||
 (authMode === "header" && !canUseHeader)
 }
 onClick={async () => {
 const id = reverseTransferId.trim();
 if (!isUuid(id)) {
 setError({ code: "invalid_input", details: "transfer entry id must be a uuid" });
 return;
 }

 setLoadingAction("admin:transfer:reverse");
 setError(null);
 try {
 const res = await fetchJsonOrThrow<{ reversal?: { id: string; amount?: string; symbol?: string } }>(
 `/api/exchange/admin/transfers/${id}/reverse`,
 {
 method: "POST",
 headers: {
 "content-type": "application/json",
 ...(requestHeaders ?? {}),
 ...adminHeaders,
 },
 body: JSON.stringify({
 ...(reverseTransferReason.trim() ? { reason: reverseTransferReason.trim() } : {}),
 }),
 },
 );

 setToastKind("success");
 const sym = (res.reversal?.symbol ?? "").toUpperCase();
 const amt = res.reversal?.amount;
 setToastMessage(
 amt && sym
 ? `Transfer reversed. Returned ${amt} ${sym}.`
 : "Transfer reversed.",
 );
 setReverseTransferId("");
 setReverseTransferReason("");
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
 {loadingAction === "admin:transfer:reverse" ? "Reversing…" : "Reverse transfer"}
 </button>
 </div>
 ) : null}

 {isAdmin && false ? (
 <div className="mt-2 rounded-xl border border-[var(--border)] p-4">
 <div className="flex flex-wrap items-center justify-between gap-2">
 <div>
 <h3 className="text-sm font-medium">Admin review</h3>
 <p className="mt-1 text-xs text-[var(--muted)]">
 Manual approval/rejection stub for withdrawal requests.
 </p>
 </div>

 <button
 type="button"
 className="rounded border border-[var(--border)] px-3 py-2 text-xs text-[var(--foreground)] hover:bg-[var(--card)] disabled:opacity-60"
 disabled={loadingAction === "admin:load"}
 onClick={async () => {
 setLoadingAction("admin:load");
 setError(null);
 try {
 const json = await fetchJsonOrThrow<{ withdrawals: AdminWithdrawalRow[] }>(
"/api/exchange/admin/withdrawals?status=review",
 { cache:"no-store", headers: adminHeaders }
 );
 setAdminRequested(json.withdrawals ?? []);
 setToastKind("success");
 setToastMessage("Loaded requested withdrawals.");
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
 Load requested
 </button>
 </div>

 <div className="mt-3 grid gap-2 md:grid-cols-2">
 <label className="grid gap-1">
 <span className="text-[11px] text-[var(--muted)]">x-admin-key (optional)</span>
 <input
 className="rounded border border-[var(--border)] bg-transparent px-2 py-2 font-mono text-xs"
 value={adminKey}
 type="password"
 placeholder="EXCHANGE_ADMIN_KEY"
 onChange={(e) => setAdminKey(e.target.value)}
 />
 </label>
 <label className="grid gap-1">
 <span className="text-[11px] text-[var(--muted)]">x-admin-id</span>
 <input
 className="rounded border border-[var(--border)] bg-transparent px-2 py-2 text-xs"
 value={adminId}
 placeholder="admin@local"
 onChange={(e) => setAdminId(e.target.value)}
 />
 </label>
 </div>

 <div className="mt-3 grid gap-2">
 {adminRequested.length === 0 ? (
 <div className="text-xs text-[var(--muted)]">No requested withdrawals loaded.</div>
 ) : (
 adminRequested.map((w) => (
 <div
 key={w.id}
 className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--border)] px-3 py-2 text-xs"
 >
 <div className="min-w-0 flex-1">
 <div className="font-medium">
 {w.symbol} {w.amount} → <span className="truncate font-mono">{w.destination_address}</span>
 <span className="ml-2 rounded bg-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--foreground)]">
 {w.status}
 </span>
 </div>
 {typeof w.risk_score ==="number"? (
 <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
 <span className="text-[var(--muted)]">Risk</span>
 <span
 className={
"rounded px-2 py-0.5 font-mono"+
 (w.risk_score >= 85
 ?" bg-[var(--down-bg)] text-[var(--down)]"
 : w.risk_score >= 60
 ?" bg-[var(--warn-bg)] text-[var(--warn)]"
 : w.risk_score >= 25
 ?" bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)]"
 :" bg-[var(--up-bg)] text-[var(--up)]")
 }
 title={w.risk_model_version ? `model ${w.risk_model_version}` :"risk signal"}
 >
 {w.risk_score}
 {w.risk_recommended_action ? ` • ${w.risk_recommended_action}` :""}
 </span>
 {w.risk_created_at ? (
 <span className="text-[var(--muted)]"title={w.risk_created_at}>
 {new Date(w.risk_created_at).toLocaleTimeString([], {
 hour:"2-digit",
 minute:"2-digit",
 })}
 </span>
 ) : null}
 </div>
 ) : (
 <div className="mt-1 text-[11px] text-[var(--muted)]">
 No risk signal yet (run <span className="font-mono">npm run outbox:worker:once</span>).
 </div>
 )}
 <div className="font-mono text-[11px] text-[var(--muted)]">
 {w.id} <span className="ml-2">user {w.user_id}</span>
 </div>
 </div>

 <div className="flex items-center gap-2">
 <button
 type="button"
 className="rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--foreground)] hover:bg-[var(--card)] disabled:opacity-60"
 disabled={loadingAction === `admin:approve:${w.id}`}
 onClick={async () => {
 setLoadingAction(`admin:approve:${w.id}`);
 setError(null);
 try {
 await fetchJsonOrThrow(`/api/exchange/admin/withdrawals/${w.id}/approve`, {
 method:"POST",
 headers: {"content-type":"application/json", ...adminHeaders },
 body: JSON.stringify({ approved_by: adminId }),
 });
 setToastKind("success");
 setToastMessage("Approved.");
 setAdminRequested((prev) => prev.filter((x) => x.id !== w.id));
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
 Approve
 </button>

 <button
 type="button"
 className="rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--foreground)] hover:bg-[var(--card)] disabled:opacity-60"
 disabled={loadingAction === `admin:reject:${w.id}`}
 onClick={async () => {
 setLoadingAction(`admin:reject:${w.id}`);
 setError(null);
 try {
 await fetchJsonOrThrow(`/api/exchange/admin/withdrawals/${w.id}/reject`, {
 method:"POST",
 headers: {"content-type":"application/json", ...adminHeaders },
 body: JSON.stringify({ reason:"manual_reject", rejected_by: adminId }),
 });
 setToastKind("success");
 setToastMessage("Rejected.");
 setAdminRequested((prev) => prev.filter((x) => x.id !== w.id));
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
 Reject
 </button>
 </div>
 </div>
 ))
 )}
 </div>
 </div>
 ) : null}
 </section>
 );
}
