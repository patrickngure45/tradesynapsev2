"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { V2Button } from "@/components/v2/Button";
import { V2Card, V2CardBody, V2CardHeader } from "@/components/v2/Card";
import { V2Input } from "@/components/v2/Input";
import { V2Sheet } from "@/components/v2/Sheet";
import { V2Skeleton } from "@/components/v2/Skeleton";

type AssetRow = {
  id: string;
  chain: string;
  symbol: string;
  name: string | null;
  decimals: number;
  is_enabled: boolean;
};

type AssetsResponse = { assets: AssetRow[] };

type BalanceRow = {
  asset_id: string;
  chain: string;
  symbol: string;
  decimals: number;
  posted: string;
  held: string;
  available: string;
};

type BalancesResponse = { user_id: string; balances: BalanceRow[] };

type ConvertQuote = {
  fromSymbol: string;
  toSymbol: string;
  amountIn: string;
  feeIn: string;
  netIn: string;
  rateToPerFrom: string;
  amountOut: string;
};

type QuoteResponse =
  | { ok: true; quote: ConvertQuote; fee_boost: null | { code: string; bps: number } }
  | { error: string; details?: unknown };

type ExecuteResponse =
  | {
      ok: true;
      convert: {
        id: string;
        created_at: string;
        quote: ConvertQuote;
        tx_hash: string;
        block_height: number;
      };
    }
  | { error: string; details?: unknown };

type ConvertHistoryRow = {
  id: string;
  created_at: string;
  tx_hash: string | null;
  block_height: number | null;
  from: string;
  to: string;
  amount_in: string;
  amount_out: string;
  fee_in: string;
  rate_to_per_from: string;
};

type ConvertHistoryResponse =
  | { ok: true; converts: ConvertHistoryRow[] }
  | { error: string; details?: unknown };

function addCommas(intStr: string): string {
  const s = intStr.replace(/^0+(?=\d)/, "");
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function fmt3818(raw: string | null | undefined, maxDecimals = 8): string {
  const s = String(raw ?? "").trim();
  if (!s) return "—";
  const neg = s.startsWith("-");
  const t = neg ? s.slice(1) : s;
  const parts = t.split(".");
  const intPart = parts[0] ?? "0";
  const fracPart = parts[1] ?? "";
  let frac = fracPart.replace(/0+$/, "");
  if (maxDecimals >= 0 && frac.length > maxDecimals) frac = frac.slice(0, maxDecimals).replace(/0+$/, "");
  const out = frac.length ? `${addCommas(intPart || "0")}.${frac}` : addCommas(intPart || "0");
  return neg ? `-${out}` : out;
}

function upperSym(v: string): string {
  return String(v ?? "").trim().toUpperCase();
}

export function ConvertClient() {
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [assets, setAssets] = useState<AssetRow[]>([]);

  const [balances, setBalances] = useState<Record<string, BalanceRow>>({});

  const [fromSym, setFromSym] = useState<string>("BTC");
  const [toSym, setToSym] = useState<string>("USDT");
  const [amountIn, setAmountIn] = useState<string>("");

  const [assetSheetOpen, setAssetSheetOpen] = useState(false);
  const [assetSheetKind, setAssetSheetKind] = useState<"from" | "to">("from");
  const [assetSearch, setAssetSearch] = useState("");

  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quote, setQuote] = useState<ConvertQuote | null>(null);

  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [history, setHistory] = useState<ConvertHistoryRow[]>([]);

  const [execute, setExecute] = useState<{ kind: "idle" | "working" | "ok" | "error"; message?: string }>(
    { kind: "idle" },
  );
  const lastQuoteReqRef = useRef<number>(0);

  const load = async (signal?: AbortSignal) => {
    setAssetsError(null);
    setAssetsLoading(true);
    try {
      const [assetsRes, balRes] = await Promise.all([
        fetch("/api/exchange/assets", { cache: "no-store", credentials: "include", signal }),
        fetch("/api/exchange/balances", { cache: "no-store", credentials: "include", signal }).catch(() => null as any),
      ]);

      const assetsJson = (await assetsRes.json().catch(() => null)) as AssetsResponse | null;
      if (!assetsRes.ok) {
        const msg = (assetsJson as any)?.error;
        throw new Error(typeof msg === "string" && msg.length ? msg : `assets_unavailable_http_${assetsRes.status}`);
      }

      const rows = Array.isArray(assetsJson?.assets) ? assetsJson!.assets : [];
      const bsc = rows.filter((a) => String(a.chain).toLowerCase() === "bsc" && a.is_enabled);
      setAssets(bsc);

      // Balances may fail when not logged in. Treat as optional.
      if (balRes && typeof balRes?.ok === "boolean") {
        const balJson = (await balRes.json().catch(() => null)) as BalancesResponse | null;
        if (balRes.ok && Array.isArray(balJson?.balances)) {
          const map: Record<string, BalanceRow> = {};
          for (const r of balJson!.balances) {
            const sym = upperSym(r.symbol);
            if (sym) map[sym] = r;
          }
          setBalances(map);
        } else {
          setBalances({});
        }
      } else {
        setBalances({});
      }

      // Ensure defaults exist.
      if (bsc.length) {
        const hasFrom = bsc.some((a) => upperSym(a.symbol) === upperSym(fromSym));
        const hasTo = bsc.some((a) => upperSym(a.symbol) === upperSym(toSym));
        if (!hasFrom) setFromSym(upperSym(bsc[0]!.symbol));
        if (!hasTo) {
          const usdt = bsc.find((a) => upperSym(a.symbol) === "USDT");
          setToSym(upperSym((usdt ?? bsc[Math.min(1, bsc.length - 1)]!)!.symbol));
        }
      }
    } catch (e) {
      setAssetsError(e instanceof Error ? e.message : String(e));
    } finally {
      setAssetsLoading(false);
    }
  };

  const loadHistory = async (signal?: AbortSignal) => {
    setHistoryError(null);
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/exchange/convert/history?limit=20", {
        cache: "no-store",
        credentials: "include",
        signal,
      });
      const json = (await res.json().catch(() => null)) as ConvertHistoryResponse | null;

      if (!res.ok) {
        const msg = (json as any)?.details?.message || (json as any)?.message || (json as any)?.error;
        setHistory([]);
        setHistoryError(typeof msg === "string" && msg.length ? msg : `History unavailable (HTTP ${res.status}).`);
        return;
      }

      const rows = Array.isArray((json as any)?.converts) ? ((json as any).converts as ConvertHistoryRow[]) : [];
      setHistory(rows);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setHistory([]);
      setHistoryError(e instanceof Error ? e.message : String(e));
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    void loadHistory(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fromAsset = useMemo(() => assets.find((a) => upperSym(a.symbol) === upperSym(fromSym)) ?? null, [assets, fromSym]);
  const toAsset = useMemo(() => assets.find((a) => upperSym(a.symbol) === upperSym(toSym)) ?? null, [assets, toSym]);

  const fromAvail = balances[upperSym(fromSym)]?.available ?? "0";

  const filteredAssets = useMemo(() => {
    const q = assetSearch.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter((a) => {
      const sym = String(a.symbol ?? "").toLowerCase();
      const name = String(a.name ?? "").toLowerCase();
      return sym.includes(q) || name.includes(q);
    });
  }, [assets, assetSearch]);

  const openAssetSheet = (kind: "from" | "to") => {
    setAssetSheetKind(kind);
    setAssetSearch("");
    setAssetSheetOpen(true);
  };

  const pickAsset = (sym: string) => {
    const s = upperSym(sym);
    if (!s) return;
    if (assetSheetKind === "from") {
      setFromSym(s);
      if (upperSym(toSym) === s) {
        const alt = assets.find((a) => upperSym(a.symbol) !== s);
        if (alt) setToSym(upperSym(alt.symbol));
      }
    } else {
      setToSym(s);
      if (upperSym(fromSym) === s) {
        const alt = assets.find((a) => upperSym(a.symbol) !== s);
        if (alt) setFromSym(upperSym(alt.symbol));
      }
    }
    setAssetSheetOpen(false);
  };

  const swap = () => {
    setFromSym((prev) => {
      setToSym(prev);
      return upperSym(toSym);
    });
    setQuote(null);
    setQuoteError(null);
    setExecute({ kind: "idle" });
  };

  // Quote (debounced)
  useEffect(() => {
    const from = upperSym(fromSym);
    const to = upperSym(toSym);
    const amt = amountIn.trim();

    setQuoteError(null);
    setExecute({ kind: "idle" });

    if (!amt) {
      setQuote(null);
      return;
    }
    if (!from || !to) {
      setQuote(null);
      return;
    }
    if (from === to) {
      setQuote(null);
      setQuoteError("Choose two different assets.");
      return;
    }

    const now = Date.now();
    lastQuoteReqRef.current = now;

    const controller = new AbortController();
    const id = window.setTimeout(() => {
      void (async () => {
        setQuoteLoading(true);
        setQuoteError(null);
        try {
          const qs = new URLSearchParams({ from, to, amount_in: amt });
          const res = await fetch(`/api/exchange/convert/quote?${qs.toString()}`, {
            cache: "no-store",
            credentials: "include",
            signal: controller.signal,
          });
          const json = (await res.json().catch(() => null)) as QuoteResponse | null;
          if (controller.signal.aborted) return;

          // Only apply latest.
          if (lastQuoteReqRef.current !== now) return;

          if (!res.ok) {
            const msg = (json as any)?.details?.message || (json as any)?.message || (json as any)?.error;
            setQuote(null);
            setQuoteError(typeof msg === "string" && msg.length ? msg : `Quote failed (HTTP ${res.status}).`);
            return;
          }

          const q = (json as any)?.quote as ConvertQuote | undefined;
          if (!q) {
            setQuote(null);
            setQuoteError("Quote unavailable.");
            return;
          }
          setQuote(q);
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setQuote(null);
          setQuoteError(e instanceof Error ? e.message : String(e));
        } finally {
          if (lastQuoteReqRef.current === now) setQuoteLoading(false);
        }
      })();
    }, 420);

    return () => {
      window.clearTimeout(id);
      controller.abort();
    };
  }, [fromSym, toSym, amountIn]);

  const executeConvert = async () => {
    const from = upperSym(fromSym);
    const to = upperSym(toSym);
    const amt = amountIn.trim();
    const q = quote;
    if (!from || !to || !amt || !q) return;

    setExecute({ kind: "working" });
    try {
      const res = await fetch("/api/exchange/convert/execute", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          from,
          to,
          amount_in: amt,
          client_quote: {
            amount_out: q.amountOut,
            rate_to_per_from: q.rateToPerFrom,
          },
        }),
      });
      const json = (await res.json().catch(() => null)) as ExecuteResponse | null;
      if (!res.ok) {
        const msg = (json as any)?.details?.message || (json as any)?.message || (json as any)?.error;
        setExecute({ kind: "error", message: typeof msg === "string" && msg.length ? msg : `Failed (HTTP ${res.status}).` });
        // If price changed, we want user to re-quote.
        if ((json as any)?.error === "price_changed") {
          setQuote(null);
          setQuoteError("Price moved. Review the new quote and try again.");
        }
        return;
      }

      setExecute({ kind: "ok", message: "Converted" });
      setAmountIn("");
      setQuote(null);
      setQuoteError(null);
      await load();
      await loadHistory();
    } catch (e) {
      setExecute({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const disabled = assetsLoading || !fromAsset || !toAsset;

  return (
    <main className="space-y-4">
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">Convert</div>
            <div className="mt-0.5 text-[15px] font-semibold text-[var(--v2-text)]">Instant swap (no order book)</div>
            <div className="mt-1 text-[12px] text-[var(--v2-muted)]">Quotes use a simple fee and system liquidity.</div>
          </div>
        </div>
      </header>

      <V2Card>
        <V2CardHeader title="Swap" subtitle="Choose assets and enter an amount" />
        <V2CardBody>
          {assetsError ? <div className="text-sm text-[var(--v2-down)]">{assetsError}</div> : null}
          {assetsLoading ? (
            <div className="grid gap-2">
              <V2Skeleton className="h-11 w-full" />
              <V2Skeleton className="h-11 w-full" />
              <V2Skeleton className="h-11 w-full" />
            </div>
          ) : (
            <div className="grid gap-3">
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => openAssetSheet("from")}
                  className="h-11 w-full rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 text-left text-[14px] font-semibold text-[var(--v2-text)] shadow-[var(--v2-shadow-sm)] hover:bg-[var(--v2-surface-2)] disabled:opacity-60"
                >
                  From: {upperSym(fromSym) || "—"}
                </button>
                <V2Button variant="secondary" size="sm" onClick={swap} disabled={disabled}>
                  Swap
                </V2Button>
              </div>

              <button
                type="button"
                disabled={disabled}
                onClick={() => openAssetSheet("to")}
                className="h-11 w-full rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 text-left text-[14px] font-semibold text-[var(--v2-text)] shadow-[var(--v2-shadow-sm)] hover:bg-[var(--v2-surface-2)] disabled:opacity-60"
              >
                To: {upperSym(toSym) || "—"}
              </button>

              <div className="grid gap-1">
                <V2Input
                  inputMode="decimal"
                  placeholder="Amount"
                  value={amountIn}
                  onChange={(e) => setAmountIn(e.target.value)}
                />
                <div className="text-[12px] text-[var(--v2-muted)]">
                  Available: {fmt3818(fromAvail)} {upperSym(fromSym)}
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] p-3">
                {quoteError ? <div className="text-sm text-[var(--v2-down)]">{quoteError}</div> : null}
                {!quoteError && quoteLoading ? <div className="text-sm text-[var(--v2-muted)]">Quoting…</div> : null}
                {!quoteError && !quoteLoading && quote ? (
                  <div className="grid gap-1 text-[13px]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[var(--v2-muted)]">You pay</span>
                      <span className="font-semibold text-[var(--v2-text)]">{fmt3818(quote.amountIn)} {quote.fromSymbol}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[var(--v2-muted)]">Fee</span>
                      <span className="font-semibold text-[var(--v2-text)]">{fmt3818(quote.feeIn)} {quote.fromSymbol}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[var(--v2-muted)]">Rate</span>
                      <span className="font-semibold text-[var(--v2-text)]">1 {quote.fromSymbol} ≈ {fmt3818(quote.rateToPerFrom)} {quote.toSymbol}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3 border-t border-[var(--v2-border)] pt-2">
                      <span className="text-[var(--v2-muted)]">You receive</span>
                      <span className="text-[15px] font-extrabold text-[var(--v2-text)]">{fmt3818(quote.amountOut)} {quote.toSymbol}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[12px] text-[var(--v2-muted)]">Enter an amount to get a quote.</div>
                )}
              </div>

              <V2Button
                variant="primary"
                fullWidth
                disabled={!quote || quoteLoading || disabled || execute.kind === "working"}
                onClick={() => void executeConvert()}
              >
                {execute.kind === "working" ? "Converting…" : "Convert"}
              </V2Button>

              {execute.kind === "error" ? (
                <div className="text-sm text-[var(--v2-down)]">{execute.message ?? "Convert failed."}</div>
              ) : execute.kind === "ok" ? (
                <div className="text-sm text-[var(--v2-up)]">Convert completed.</div>
              ) : null}
            </div>
          )}
        </V2CardBody>
      </V2Card>

      <V2Sheet
        open={assetSheetOpen}
        title={assetSheetKind === "from" ? "From asset" : "To asset"}
        onClose={() => setAssetSheetOpen(false)}
      >
        <div className="grid gap-2">
          <V2Input
            placeholder="Search"
            value={assetSearch}
            onChange={(e) => setAssetSearch(e.target.value)}
          />

          <div className="grid gap-1">
            {filteredAssets.map((a) => {
              const sym = upperSym(a.symbol);
              const active = sym === (assetSheetKind === "from" ? upperSym(fromSym) : upperSym(toSym));
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => pickAsset(sym)}
                  className={
                    "flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left shadow-[var(--v2-shadow-sm)] " +
                    (active
                      ? "border-[var(--v2-border)] bg-[var(--v2-surface-2)]"
                      : "border-[var(--v2-border)] bg-[var(--v2-surface)] hover:bg-[var(--v2-surface-2)]")
                  }
                >
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold text-[var(--v2-text)]">{sym}</div>
                    <div className="truncate text-[12px] text-[var(--v2-muted)]">{a.name ?? ""}</div>
                  </div>
                  <div className="text-[12px] font-semibold text-[var(--v2-muted)]">
                    {fmt3818(balances[sym]?.available ?? "0")} avail
                  </div>
                </button>
              );
            })}
            {filteredAssets.length === 0 ? (
              <div className="text-sm text-[var(--v2-muted)]">No assets found.</div>
            ) : null}
          </div>
        </div>
      </V2Sheet>

      <V2Card>
        <V2CardHeader title="Recent converts" subtitle="Your latest swaps" />
        <V2CardBody>
          {historyError ? <div className="text-sm text-[var(--v2-down)]">{historyError}</div> : null}
          {historyLoading ? (
            <div className="grid gap-2">
              <V2Skeleton className="h-14 w-full" />
              <V2Skeleton className="h-14 w-full" />
              <V2Skeleton className="h-14 w-full" />
            </div>
          ) : history.length ? (
            <div className="grid gap-2">
              {history.map((h) => {
                const ts = h.created_at ? new Date(h.created_at).toLocaleString() : "";
                return (
                  <div key={h.id} className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold text-[var(--v2-text)]">
                          {fmt3818(h.amount_in)} {upperSym(h.from)} → {fmt3818(h.amount_out)} {upperSym(h.to)}
                        </div>
                        <div className="mt-0.5 text-[12px] text-[var(--v2-muted)]">Fee {fmt3818(h.fee_in)} {upperSym(h.from)} · {ts}</div>
                      </div>
                      <div className="shrink-0 text-right text-[12px] text-[var(--v2-muted)]">
                        {h.tx_hash ? (
                          <div className="font-mono">{String(h.tx_hash).slice(0, 10)}…</div>
                        ) : (
                          <div>—</div>
                        )}
                        {typeof h.block_height === "number" ? <div>blk {h.block_height}</div> : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-[12px] text-[var(--v2-muted)]">No converts yet.</div>
          )}
        </V2CardBody>
      </V2Card>
    </main>
  );
}
