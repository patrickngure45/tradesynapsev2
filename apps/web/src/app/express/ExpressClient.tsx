"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ALL_CURRENCIES } from "@/lib/p2p/constants";

type QuoteResponse =
  | {
      ok: true;
      quote: {
        side: "BUY" | "SELL";
        asset: string;
        fiat: string;
        amount_fiat: number;
        assumptions: { taker_fee_bps: number; slippage_bps: number };
        p2p: {
          best_ad: {
            id: string;
            side: "BUY" | "SELL";
            fiat_currency: string;
            price_type: "fixed" | "floating";
            fixed_price: string | null;
            remaining_amount: string;
            min_limit: string;
            max_limit: string;
            payment_window_minutes: number;
          };
          price_fiat_per_usdt: number;
          usdt_received?: number;
          usdt_required?: number;
        };
        spot:
          | null
          | {
              best: {
                exchange: "binance" | "bybit";
                symbol: string;
                bid: number;
                ask: number;
                effectiveBid: number;
                effectiveAsk: number;
              };
              errors: Array<{ exchange: string; message: string }>;
            };
        result:
          | { usdt_received: number; usdt_required: null }
          | { usdt_received: null; usdt_required: number }
          | { asset_received: number; effective_fiat_per_asset: number | null }
          | { asset_required: number; effective_fiat_per_asset: number | null };
      };
    }
  | {
      ok: false;
      error: string;
      message?: string;
      details?: unknown;
      quote: null;
    };

function formatNumber(n: number, maxFrac = 6) {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const frac = abs >= 1000 ? 2 : abs >= 1 ? 6 : 8;
  return n.toLocaleString(undefined, { maximumFractionDigits: Math.min(frac, maxFrac) });
}

export function ExpressClient() {
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [asset, setAsset] = useState("USDT");
  const [fiat, setFiat] = useState("USD");
  const [amountFiat, setAmountFiat] = useState("100");

  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<QuoteResponse | null>(null);

  const amountFiatNum = useMemo(() => {
    const v = Number(amountFiat);
    return Number.isFinite(v) && v > 0 ? v : null;
  }, [amountFiat]);

  useEffect(() => {
    if (!amountFiatNum) {
      setResp(null);
      return;
    }

    const controller = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({
          side,
          asset,
          fiat,
          amount_fiat: String(amountFiatNum),
        });
        const r = await fetch(`/api/express/quote?${qs.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = (await r.json()) as QuoteResponse;
        setResp(data);
      } catch (e) {
        if ((e as any)?.name === "AbortError") return;
        setResp({ ok: false, error: "network_error", message: e instanceof Error ? e.message : String(e), quote: null });
      } finally {
        setLoading(false);
      }
    }, 120);

    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [side, asset, fiat, amountFiatNum]);

  const p2pLink = useMemo(() => {
    const q = new URLSearchParams({
      side: side,
      asset: "USDT",
      fiat,
      ...(amountFiatNum ? { amount: String(amountFiatNum) } : {}),
    });
    return `/p2p?${q.toString()}`;
  }, [side, fiat, amountFiatNum]);

  const spotMarketLink = useMemo(() => {
    // We only have internal spot routing by market_id; send users to Markets as the safe default.
    return "/markets";
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)]/40 p-5">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[var(--muted)]">Action</label>
            <select
              value={side}
              onChange={(e) => setSide(e.target.value as any)}
              className="h-10 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-medium outline-none focus:border-[var(--accent)]"
            >
              <option value="BUY">Buy</option>
              <option value="SELL">Sell</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[var(--muted)]">Asset</label>
            <select
              value={asset}
              onChange={(e) => setAsset(e.target.value)}
              className="h-10 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-medium outline-none focus:border-[var(--accent)]"
            >
              <option value="USDT">USDT</option>
              <option value="BTC">BTC</option>
              <option value="ETH">ETH</option>
              <option value="BNB">BNB</option>
              <option value="SOL">SOL</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[var(--muted)]">Fiat</label>
            <select
              value={fiat}
              onChange={(e) => setFiat(e.target.value)}
              className="h-10 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-medium outline-none focus:border-[var(--accent)]"
            >
              {ALL_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} - {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[var(--muted)]">
              {side === "BUY" ? `I will pay (${fiat})` : `I want to receive (${fiat})`}
            </label>
            <input
              value={amountFiat}
              onChange={(e) => setAmountFiat(e.target.value)}
              type="number"
              min={0}
              className="h-10 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-medium outline-none focus:border-[var(--accent)]"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href={p2pLink}
            className="inline-flex h-9 items-center rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-semibold hover:bg-[var(--muted)]/10"
          >
            Open P2P offers
          </Link>
          <Link
            href={spotMarketLink}
            className="inline-flex h-9 items-center rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-semibold hover:bg-[var(--muted)]/10"
          >
            Open Spot markets
          </Link>
          <div className="text-xs text-[var(--muted)]">
            Quotes are estimates; execution can differ.
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)]/40 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Net Quote</div>
            <div className="text-xs text-[var(--muted)]">
              Uses fixed-price P2P USDT + best external spot estimate.
            </div>
          </div>
          <div className="text-xs text-[var(--muted)]">{loading ? "Updating…" : ""}</div>
        </div>

        {!amountFiatNum ? (
          <div className="mt-4 text-sm text-[var(--muted)]">Enter a fiat amount.</div>
        ) : !resp ? (
          <div className="mt-4 text-sm text-[var(--muted)]">Fetching quote…</div>
        ) : resp.ok === false ? (
          <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
            <div className="text-sm font-semibold text-[var(--foreground)]">No quote</div>
            <div className="mt-1 text-xs text-[var(--muted)]">
              {resp.message ?? resp.error}
            </div>
          </div>
        ) : (
          <QuoteCard q={resp.quote} />
        )}
      </div>
    </div>
  );
}

function QuoteCard({ q }: { q: Extract<QuoteResponse, { ok: true }>['quote'] }) {
  const p2p = q.p2p;
  const spot = q.spot?.best ?? null;

  const headline = (() => {
    if (q.asset === "USDT") {
      if (q.side === "BUY") return `${formatNumber((q.result as any).usdt_received)} USDT (est.)`;
      return `${formatNumber((q.result as any).usdt_required)} USDT required (est.)`;
    }

    if (q.side === "BUY") return `${formatNumber((q.result as any).asset_received)} ${q.asset} (est.)`;
    return `${formatNumber((q.result as any).asset_required)} ${q.asset} required (est.)`;
  })();

  return (
    <div className="mt-4 grid gap-4 md:grid-cols-3">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 md:col-span-2">
        <div className="text-xs text-[var(--muted)]">Result</div>
        <div className="mt-1 text-xl font-bold text-[var(--foreground)]">{headline}</div>
        <div className="mt-2 text-xs text-[var(--muted)]">
          Assumptions: taker fee {q.assumptions.taker_fee_bps} bps, slippage {q.assumptions.slippage_bps} bps.
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-[var(--border)] p-3">
            <div className="text-xs font-semibold">P2P USDT</div>
            <div className="mt-1 text-sm text-[var(--muted)]">
              Best fixed ad price: <span className="font-semibold text-[var(--foreground)]">{formatNumber(p2p.price_fiat_per_usdt, 6)}</span> {q.fiat} / USDT
            </div>
            <div className="mt-1 text-xs text-[var(--muted)]">
              Limits: {Number(p2p.best_ad.min_limit).toLocaleString()}–{Number(p2p.best_ad.max_limit).toLocaleString()} {q.fiat}
            </div>
          </div>

          <div className="rounded-lg border border-[var(--border)] p-3">
            <div className="text-xs font-semibold">Spot (estimate)</div>
            {q.asset === "USDT" ? (
              <div className="mt-1 text-sm text-[var(--muted)]">Not needed for USDT.</div>
            ) : spot ? (
              <div className="mt-1 text-sm text-[var(--muted)]">
                Best venue: <span className="font-semibold text-[var(--foreground)]">{spot.exchange}</span>
                <div className="mt-1 text-xs text-[var(--muted)]">
                  {spot.symbol} effective ask {formatNumber(spot.effectiveAsk, 8)} • effective bid {formatNumber(spot.effectiveBid, 8)}
                </div>
              </div>
            ) : (
              <div className="mt-1 text-sm text-[var(--muted)]">No spot venue available.</div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
        <div className="text-xs text-[var(--muted)]">How to execute</div>
        <ol className="mt-2 space-y-2 text-sm text-[var(--muted)] list-decimal pl-4">
          <li>{q.side === "BUY" ? "Buy USDT via P2P" : "Sell USDT via P2P"} for {q.fiat}.</li>
          {q.asset !== "USDT" && (
            <li>
              {q.side === "BUY" ? `Convert USDT → ${q.asset} on spot.` : `Convert ${q.asset} → USDT on spot.`}
            </li>
          )}
        </ol>
        <div className="mt-4 text-xs text-[var(--muted)]">
          Express is a router/estimator. It does not auto-trade.
        </div>
      </div>
    </div>
  );
}
