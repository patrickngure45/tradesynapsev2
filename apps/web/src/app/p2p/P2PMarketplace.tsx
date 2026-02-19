"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CreateAdModal } from "./CreateAdModal";
import { TakeAdModal } from "./TakeAdModal";
import { Avatar } from "@/components/Avatar";
import { AssetIcon } from "@/components/AssetIcon";
import { AssetSelect } from "@/components/AssetSelect";
import { FiatSelect } from "@/components/FiatSelect";
import { buttonClassName } from "@/components/ui/Button";
import { ALL_CURRENCIES } from "@/lib/p2p/constants";
import { countryToDefaultFiat, initials2, paymentMethodBadge, safePaymentMethods } from "@/lib/p2p/display";
import { fiatCodeToIso2 } from "@/lib/p2p/fiatIso2";

type Ad = {
  id: string;
  user_id: string;
  side: "BUY" | "SELL";
  fiat_currency: string;
  price_type: "fixed" | "floating";
  fixed_price: string;
  margin_percent: string;
  remaining_amount: string;
  min_limit: string;
  max_limit: string;
  payment_window_minutes: number;
  payment_methods?: string[];
  payment_method_ids?: string[];
  email: string;
  display_name?: string | null;
  rep_positive?: number;
  rep_negative?: number;
  rep_total?: number;
  completed_count?: number;
  is_verified_agent?: boolean;
  terms: string | null;
};

export function P2PMarketplace() {
  const params = useSearchParams();

  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [asset, setAsset] = useState("USDT");
  const [fiat, setFiat] = useState("USD");
  const [amount, setAmount] = useState("");

  const [assetOptions, setAssetOptions] = useState<string[]>(["USDT"]);
  const [fiatHint, setFiatHint] = useState<string | null>(null);
  const didAutoFiatRef = useRef<string>("");
  const didAutoSideRef = useRef<string>("");

  const didInitFromQuery = useRef(false);
  const initSideFromQuery = useRef(false);
  const initAssetFromQuery = useRef(false);
  const initFiatFromQuery = useRef(false);
  useEffect(() => {
    if (didInitFromQuery.current) return;
    didInitFromQuery.current = true;

    const qSide = (params.get("side") ?? "").toUpperCase();
    const qAsset = (params.get("asset") ?? "").toUpperCase();
    const qFiat = (params.get("fiat") ?? "").toUpperCase();
    const qAmount = params.get("amount") ?? "";

    if (qSide === "BUY" || qSide === "SELL") {
      initSideFromQuery.current = true;
      setSide(qSide);
    }
    if (qAsset) {
      initAssetFromQuery.current = true;
      setAsset(qAsset);
    }
    if (qFiat) {
      initFiatFromQuery.current = true;
      setFiat(qFiat);
    }
    if (qAmount) setAmount(qAmount);
  }, [params]);

  useEffect(() => {
    fetch("/api/p2p/assets")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const list = Array.isArray(data?.assets) ? (data.assets as any[]).map((x) => String(x).toUpperCase()) : [];
        const uniq = Array.from(new Set(list.filter(Boolean)));
        if (!uniq.length) return;
        setAssetOptions(uniq);
        if (!uniq.includes(asset)) setAsset(uniq[0]!);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const didInitFiatFromWhoami = useRef(false);
  useEffect(() => {
    if (didInitFiatFromWhoami.current) return;
    if ((params.get("fiat") ?? "").trim()) return;
    didInitFiatFromWhoami.current = true;

    fetch("/api/whoami")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const country = data?.user?.country as string | null | undefined;
        const preferred = countryToDefaultFiat(country);
        if (preferred && preferred !== fiat) setFiat(preferred);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedAd, setSelectedAd] = useState<Ad | null>(null);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/whoami")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const id = typeof data?.user?.id === "string" ? data.user.id : null;
        setCurrentUserId(id);
      })
      .catch(() => {
        if (!cancelled) setCurrentUserId(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const didAutoOpenCreateRef = useRef(false);
  useEffect(() => {
    if (didAutoOpenCreateRef.current) return;
    const v = String(params.get("new_ad") ?? "").trim().toLowerCase();
    if (v === "1" || v === "true" || v === "yes") {
      didAutoOpenCreateRef.current = true;
      setShowCreateModal(true);
    }
  }, [params]);

  useEffect(() => {
    async function fetchAds() {
      setLoading(true);
      try {
        const query = new URLSearchParams({ side, asset, fiat, ...(amount ? { amount } : {}) });
        const res = await fetch(`/api/p2p/ads?${query.toString()}`);
        if (!res.ok) {
          let code: string | undefined;
          try {
            const body = await res.json();
            code = body?.error;
          } catch {
            // ignore
          }
          throw new Error(code || `http_${res.status}`);
        }

        const data = await res.json();
        const rawAds = (data.ads || []) as any[];
        const normalized = rawAds.map((a) => ({ ...a, payment_methods: safePaymentMethods(a.payment_methods) }));
        setAds(normalized);
        setFetchError(null);

        if (normalized.length === 0 && !amount) {
          const sideKey = `${asset.toUpperCase()}:${fiat.toUpperCase()}`;
          if (!initSideFromQuery.current && didAutoSideRef.current !== sideKey) {
            didAutoSideRef.current = sideKey;
            const otherSide = side === "BUY" ? "SELL" : "BUY";
            try {
              const otherQuery = new URLSearchParams({ side: otherSide, asset, fiat });
              const otherRes = await fetch(`/api/p2p/ads?${otherQuery.toString()}`);
              const otherJson = otherRes.ok ? await otherRes.json().catch(() => null) : null;
              const otherAds = Array.isArray(otherJson?.ads) ? otherJson.ads : [];
              if (otherAds.length > 0) {
                setSide(otherSide);
                setFiatHint(`No ${side.toLowerCase()} ads available right now. Showing ${otherSide.toLowerCase()} ads instead.`);
                return;
              }
            } catch {
              // ignore
            }
          }

          const key = `${side}:${asset}:${fiat}`;
          if (didAutoFiatRef.current !== key) {
            didAutoFiatRef.current = key;
            fetch(`/api/p2p/fiats?side=${encodeURIComponent(side)}&asset=${encodeURIComponent(asset)}`)
              .then((r) => (r.ok ? r.json() : null))
              .then((fiatData) => {
                const fiats = Array.isArray(fiatData?.fiats) ? (fiatData.fiats as any[]).map((x) => String(x).toUpperCase()) : [];
                if (!fiats.length) return;
                if (fiats.includes(fiat.toUpperCase())) return;
                const nextFiat = fiats[0]!;
                setFiat(nextFiat);
                setFiatHint(`No ads available in ${fiat.toUpperCase()}. Showing ${nextFiat} markets instead.`);
              })
              .catch(() => undefined);
          }
        }
      } catch (err) {
        console.error(err);
        const msg = err instanceof Error ? err.message : "fetch_failed";
        setFetchError(msg);
      } finally {
        setLoading(false);
      }
    }

    const t = setTimeout(fetchAds, 120);
    return () => clearTimeout(t);
  }, [side, asset, fiat, amount, retryNonce]);

  return (
    <div className="space-y-6">
      <div
        className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]"
        style={{ clipPath: "polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 0 100%)" }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          aria-hidden
          style={{
            backgroundImage:
              "radial-gradient(circle at 16% 18%, var(--ring) 0, transparent 55%), radial-gradient(circle at 82% 72%, var(--ring) 0, transparent 55%)",
          }}
        />

        <div className="relative flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--card-2)] px-5 py-4">
          <div
            className="pointer-events-none absolute inset-0 opacity-50"
            aria-hidden
            style={{
              backgroundImage:
                "radial-gradient(circle at 18% 40%, var(--ring) 0, transparent 55%), radial-gradient(circle at 78% 60%, var(--ring) 0, transparent 55%)",
            }}
          />

          <div className="relative flex min-w-0 flex-1 items-center gap-3">
            <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
              <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
              <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
            </span>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">P2P</div>
              <h2 className="-mt-0.5 truncate text-base font-extrabold tracking-tight text-[var(--foreground)]">Marketplace</h2>
            </div>
            <div className="h-px flex-1 bg-[var(--border)] opacity-80" />
          </div>

          <div className="flex items-center gap-4">
            <Link href="/p2p/orders" className="flex items-center gap-1 text-sm font-medium text-[var(--accent)] hover:underline">
              <span>My Orders</span>
              <span>→</span>
            </Link>
            <button
              onClick={() => setShowCreateModal(true)}
              className={buttonClassName({
                variant: "primary",
                size: "md",
                className: "hidden h-9 md:inline-flex",
              })}
            >
              + Post Ad
            </button>
          </div>
        </div>

        <div className="relative flex flex-col gap-4 px-5 py-4 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="flex rounded-xl border border-[var(--border)] bg-[var(--background)] p-1">
              <button
                onClick={() => setSide("BUY")}
                className={`rounded-md px-6 py-2 text-sm font-bold transition ${
                  side === "BUY" ? "bg-[var(--up)] text-white shadow-sm" : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                Buy
              </button>
              <button
                onClick={() => setSide("SELL")}
                className={`rounded-md px-6 py-2 text-sm font-bold transition ${
                  side === "SELL" ? "bg-[var(--down)] text-white shadow-sm" : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                Sell
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[var(--muted)]">Crypto</label>
              <div className="w-full sm:w-48">
                <AssetSelect value={asset} options={assetOptions} onChangeAction={(next) => setAsset(next)} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[var(--muted)]">Fiat</label>
              <div className="w-full sm:w-48">
                <FiatSelect value={fiat} options={ALL_CURRENCIES} onChangeAction={(next) => setFiat(next)} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[var(--muted)]">Amount</label>
              <div className="relative w-40">
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder=""
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 pr-14 text-sm font-semibold text-[var(--foreground)] tabular-nums outline-none focus:border-[var(--accent)]"
                  aria-label={`Amount in ${fiat}`}
                />
                <div
                  className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2"
                  aria-hidden
                >
                  <span className="rounded-md border border-[var(--border)] bg-[var(--card-2)] px-2 py-1 text-[10px] font-bold text-[var(--muted)]">
                    {fiat}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className={buttonClassName({
              variant: "primary",
              size: "md",
              className: "flex h-10 md:hidden",
              fullWidth: true,
            })}
          >
            + Post Ad
          </button>
        </div>

        {fiatHint && (
          <div className="border-t border-[var(--border)] bg-[var(--card-2)] px-5 py-3">
            <div className="flex items-start justify-between gap-3 text-xs">
              <div className="flex min-w-0 items-start gap-2 text-[var(--muted)]">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--ring)] text-[var(--accent)]" aria-hidden>
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-9.25a.75.75 0 0 1 .75.75v4a.75.75 0 0 1-1.5 0v-4a.75.75 0 0 1 .75-.75Zm0-3a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
                <span className="min-w-0 leading-relaxed">{fiatHint}</span>
              </div>
              <button
                type="button"
                className={buttonClassName({ variant: "secondary", size: "xs", className: "shrink-0" })}
                onClick={() => setFiatHint(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {showCreateModal && <CreateAdModal onClose={() => setShowCreateModal(false)} />}

        <div className="relative border-t border-[var(--border)]">
          {fetchError && !loading && (
            <div className="flex items-center justify-between gap-3 px-5 py-4">
              <div>
                <div className="text-sm font-bold text-[var(--foreground)]">Failed to load ads</div>
                <div className="mt-1 text-xs text-[var(--muted)]">Error: {fetchError}</div>
              </div>
              <button
                type="button"
                onClick={() => setRetryNonce((n) => n + 1)}
                className={buttonClassName({ variant: "primary", size: "md", className: "h-9" })}
              >
                Retry
              </button>
            </div>
          )}

          <div className="md:max-h-[70vh] md:overflow-auto">
            <div className="sticky top-0 z-10 hidden border-b border-[var(--border)] bg-[var(--card-2)] px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-[var(--muted)] md:grid md:grid-cols-[200px_180px_1fr_200px_auto] md:items-center md:gap-3 lg:grid-cols-[240px_220px_1fr_240px_auto] lg:gap-4">
              <div>Trader</div>
              <div>Price</div>
              <div>Available / Limits</div>
              <div>Payment</div>
              <div className="text-right">Action</div>
            </div>

            {loading ? (
              <div>
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="h-20 w-full animate-pulse border-b border-[var(--border)] bg-[var(--card)]" />
                ))}
              </div>
            ) : ads.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <div className="text-sm font-extrabold text-[var(--foreground)]">No ads found</div>
                <div className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                  Try switching to <span className="font-semibold text-[var(--foreground)]">{side === "BUY" ? "Sell" : "Buy"}</span>,
                  or change the crypto, fiat, or amount.
                </div>
              </div>
            ) : (
              <div className="pt-3 pb-1 md:pt-0 md:pb-0">
                {ads.map((ad, idx) => (
                  <AdRow
                    key={ad.id}
                    ad={ad}
                    mySide={side}
                    asset={asset}
                    currentUserId={currentUserId}
                    onTake={() => {
                      if (currentUserId && ad.user_id === currentUserId) return;
                      setSelectedAd(ad);
                    }}
                    isLast={idx === ads.length - 1}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedAd && (
        <TakeAdModal
          ad={{
            id: selectedAd.id,
            side: selectedAd.side,
            price: selectedAd.fixed_price,
            asset: asset,
            fiat: selectedAd.fiat_currency,
            min: selectedAd.min_limit,
            max: selectedAd.max_limit,
            payment_window: selectedAd.payment_window_minutes,
            trader: selectedAd.display_name ?? (selectedAd.email ? selectedAd.email.split("@")[0] : null),
            trader_rep: {
              positive: Number(selectedAd.rep_positive ?? 0),
              total: Number(selectedAd.rep_total ?? 0),
            },
            trader_completed: Number(selectedAd.completed_count ?? 0),
            trader_verified: Boolean(selectedAd.is_verified_agent),
            payment_methods: selectedAd.payment_methods ?? null,
            terms: selectedAd.terms ?? null,
          }}
          onClose={() => setSelectedAd(null)}
        />
      )}
    </div>
  );
}

function AdRow({
  ad,
  mySide,
  asset,
  currentUserId,
  onTake,
  isLast,
}: {
  ad: Ad;
  mySide: "BUY" | "SELL";
  asset: string;
  currentUserId: string | null;
  onTake: () => void;
  isLast: boolean;
}) {
  let displayName = "user";
  if (ad.display_name) displayName = ad.display_name;
  else if (ad.email) {
    const parts = ad.email.split("@");
    displayName = parts.length > 1 ? parts[0].slice(0, 3) + "***" : ad.email.slice(0, 5) + "***";
  }

  const priceNum = Number(ad.fixed_price);
  const price = Number.isFinite(priceNum) ? priceNum.toLocaleString() : "—";

  const availableNum = Number(ad.remaining_amount);
  const availableStr = Number.isFinite(availableNum) ? availableNum.toLocaleString() : String(ad.remaining_amount ?? "0");

  const minNum = Number(ad.min_limit);
  const maxNum = Number(ad.max_limit);
  const minStr = Number.isFinite(minNum) ? minNum.toLocaleString() : String(ad.min_limit ?? "0");
  const maxStr = Number.isFinite(maxNum) ? maxNum.toLocaleString() : String(ad.max_limit ?? "0");

  const rails = safePaymentMethods((ad as any).payment_methods);
  const fiatIso2 = fiatCodeToIso2(ad.fiat_currency);

  const repTotal = Number((ad as any).rep_total ?? 0);
  const repPositive = Number((ad as any).rep_positive ?? 0);
  const repPct = repTotal > 0 ? Math.round((repPositive / repTotal) * 100) : null;
  const isVerifiedAgent = Boolean((ad as any).is_verified_agent);
  const completedCount = Number((ad as any).completed_count ?? 0);
  const repLabel =
    repTotal >= 3 && repPct !== null
      ? `${repPct}% (${repTotal})`
      : isVerifiedAgent
        ? "Verified"
        : repTotal > 0
          ? `New (${repTotal})`
          : Number.isFinite(completedCount) && completedCount > 0
            ? "No feedback yet"
            : "New";

  const completedLabel = Number.isFinite(completedCount) && completedCount > 0 ? `${completedCount} completed` : null;

  const isOwnAd = Boolean(currentUserId) && ad.user_id === currentUserId;

  return (
    <div
      className={`mb-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-5 py-4 transition hover:bg-[var(--card-2)] md:mb-0 md:rounded-none md:border-0 md:bg-transparent md:grid md:grid-cols-[200px_180px_1fr_200px_auto] md:items-center md:gap-3 lg:grid-cols-[240px_220px_1fr_240px_auto] lg:gap-4 ${
        isLast ? "" : "md:border-b md:border-[var(--border)]"
      }`}
    >
      <div className="flex items-center justify-between gap-3 md:justify-start">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Avatar seed={ad.email || displayName} label={displayName} size={36} fallbackText={initials2(displayName)} />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-[var(--foreground)]">{displayName}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[var(--muted)]">
              <span className="text-[var(--up)]">Active</span>
              <span>•</span>
              <span className="text-[var(--muted)]">{repLabel === "No feedback yet" ? "No feedback" : repLabel}</span>
              {completedLabel ? (
                <>
                  <span>•</span>
                  <span>{completedLabel}</span>
                </>
              ) : null}
              <span>•</span>
              <span>{ad.payment_window_minutes}m window</span>
            </div>
          </div>
        </div>

        <button
          onClick={onTake}
          disabled={isOwnAd}
          className={`h-9 w-32 shrink-0 rounded-lg px-4 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 md:hidden sm:w-36 ${
            mySide === "BUY" ? "bg-[var(--up)]" : "bg-[var(--down)]"
          }`}
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <AssetIcon symbol={asset} size={18} className="border-white/20 bg-white/10 text-white" />
            <span className="min-w-0 truncate">{isOwnAd ? "Your ad" : mySide === "BUY" ? `Buy ${asset}` : `Sell ${asset}`}</span>
          </span>
        </button>
      </div>

      <div className="mt-3 min-w-0 md:mt-0">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)] md:hidden">Price</div>
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="text-xl font-bold text-[var(--foreground)]">{price}</span>
          <span className="min-w-0 truncate text-xs font-medium text-[var(--muted)]" title={`${ad.fiat_currency}/${asset}`}>
            {fiatIso2 ? (
              <span
                className={`fi fi-${fiatIso2} mr-1 inline-block h-3.5 w-5 rounded-sm border border-[var(--border)] align-[-2px]`}
                aria-hidden
              />
            ) : null}
            {ad.fiat_currency}/{asset}
          </span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-[var(--muted)] md:mt-0 md:grid-cols-1 md:gap-1">
        <div className="flex flex-col">
          <span className="hidden text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)] md:block">Available</span>
          <span className="md:hidden">Available: </span>
          <span className="inline-flex items-center gap-1 font-medium text-[var(--foreground)]">
            <AssetIcon symbol={asset} size={18} />
            <span className="min-w-0 truncate" title={asset}>
              {availableStr} {asset}
            </span>
          </span>
        </div>
        <div className="flex flex-col">
          <span className="hidden text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)] md:block">Limits</span>
          <span className="md:hidden">Limits: </span>
          <span className="font-medium text-[var(--foreground)]">
            {minStr} – {maxStr} {ad.fiat_currency}
          </span>
        </div>
      </div>

      <div className="mt-3 md:mt-0">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)] md:hidden">Payment</div>
        <div className="flex flex-wrap gap-1">
          {rails.map((identifier) => {
            const badge = paymentMethodBadge(identifier);
            return (
              <span key={identifier} className={badge.className}>
                {badge.label}
              </span>
            );
          })}
          {!rails.length && <span className="text-[10px] text-[var(--muted)]">—</span>}
        </div>
      </div>

      <div className="hidden md:flex md:justify-end">
        <button
          onClick={onTake}
          disabled={isOwnAd}
          className={`h-9 rounded-lg px-6 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 ${
            mySide === "BUY" ? "bg-[var(--up)]" : "bg-[var(--down)]"
          }`}
        >
          <span className="inline-flex items-center gap-2">
            <AssetIcon symbol={asset} size={18} className="border-white/20 bg-white/10 text-white" />
            <span>{isOwnAd ? "Your ad" : mySide === "BUY" ? `Buy ${asset}` : `Sell ${asset}`}</span>
          </span>
        </button>
      </div>
    </div>
  );
}
