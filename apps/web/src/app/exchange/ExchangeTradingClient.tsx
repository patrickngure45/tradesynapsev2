"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { ApiError, fetchJsonOrThrow } from "@/lib/api/client";
import { ApiErrorBanner, type ClientApiError } from "@/components/ApiErrorBanner";
import { Toast, type ToastKind } from "@/components/Toast";
import { persistActingUserIdPreference, readActingUserIdPreference } from "@/lib/state/actingUser";
import { useExchangeStream } from "@/hooks/useExchangeStream";
import type {
  BalanceRow,
  Candle,
  DepthLevel,
  HoldRow,
  Market,
  MarketStats,
  Order,
  TicketQuoteBreakdown,
  TicketRequirement,
  TopLevel,
  Trade,
} from "./types";
import { BalancesPanel } from "./components/BalancesPanel";
import { MyOrdersPanel } from "./components/MyOrdersPanel";
import { OrderTicketPanel } from "./components/OrderTicketPanel";
import { CandleChart } from "@/components/CandleChart";
import {
  add3818,
  bpsFeeCeil3818,
  cmp3818,
  fromBigInt3818,
  mul3818Ceil,
  mul3818Round,
  sub3818NonNegative,
  toBigInt3818,
} from "@/lib/exchange/fixed3818";
import { digitsFromStep, isMultipleOfStep3818, multiplyStep3818, quantizeDownToStep3818 } from "@/lib/exchange/steps";
import {
  formatDecimal,
  getChangeDisplay,
  getMarkMinusVwapDisplay,
  getMarkVsVwapDisplay,
  getRangePositionPct,
  getSpreadDisplay,
} from "@/lib/exchange/display";
import { applyTradesDeltaToCandles, buildCandlesFromTrades } from "@/lib/exchange/candles";

const SCALE_1E18 = 10n ** 18n;

function isUuid(value: string): boolean {
  const v = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function renderMiniCandlesFromCandles(candles: Candle[]) {
  if (candles.length < 2) return null;

  const width = 240;
  const height = 48;
  const pad = 3;

  const highs = candles.map((c) => toBigInt3818(c.high));
  const lows = candles.map((c) => toBigInt3818(c.low));

  let min = lows[0]!;
  let max = highs[0]!;
  for (let i = 0; i < candles.length; i++) {
    const hi = highs[i]!;
    const lo = lows[i]!;
    if (hi > max) max = hi;
    if (lo < min) min = lo;
  }

  const span = max - min;
  if (span <= 0n) return null;

  const innerH = BigInt(height - pad * 2);
  const yFor = (v: bigint) => {
    const num = (max - v) * innerH;
    const yOff = Number(num / span);
    return pad + yOff;
  };

  const step = (width - pad * 2) / candles.length;
  const bodyW = Math.max(2, Math.floor(step * 0.6));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-12 w-full">
      {candles.map((c, i) => {
        const o = toBigInt3818(c.open);
        const h = toBigInt3818(c.high);
        const l = toBigInt3818(c.low);
        const cl = toBigInt3818(c.close);

        const xCenter = pad + step * i + step / 2;
        const x = xCenter - bodyW / 2;

        const yH = yFor(h);
        const yL = yFor(l);
        const yO = yFor(o);
        const yC = yFor(cl);

        const up = cl >= o;
        const yTop = Math.min(yO, yC);
        const yBot = Math.max(yO, yC);
        const bodyH = Math.max(1, yBot - yTop);

        const colorClass = up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";

        return (
          <g key={c.ts + i} className={colorClass}>
            <line
              x1={xCenter}
              x2={xCenter}
              y1={yH}
              y2={yL}
              stroke="currentColor"
              strokeWidth="1"
              opacity="0.9"
            />
            <rect
              x={x}
              y={yTop}
              width={bodyW}
              height={bodyH}
              fill="currentColor"
              opacity={up ? 0.45 : 0.6}
            />
          </g>
        );
      })}
    </svg>
  );
}

function MarketdataStatusBanner(props: {
  liveEnabled: boolean;
  streamStatus: "disconnected" | "connecting" | "connected" | "error";
  lastMarketdataUpdateAtMs: number | null;
  nowMs: number;
  pollMs: number;
  streamNextRetryAtMs: number | null;
  streamAttempt: number;
  onReconnectNow: () => void;
}) {
  const {
    liveEnabled,
    streamStatus,
    lastMarketdataUpdateAtMs,
    nowMs,
    pollMs,
    streamNextRetryAtMs,
    streamAttempt,
    onReconnectNow,
  } = props;

  // Ideally, show nothing if everything is fine to keep the UI clean.
  if (liveEnabled && streamStatus === "connected") return null;

  const secsSince =
    typeof lastMarketdataUpdateAtMs === "number" ? Math.max(0, Math.floor((nowMs - lastMarketdataUpdateAtMs) / 1000)) : null;

  const retryInSec =
    typeof streamNextRetryAtMs === "number" ? Math.max(0, Math.ceil((streamNextRetryAtMs - nowMs) / 1000)) : null;

  const tone: "off" | "info" | "bad" = !liveEnabled
    ? "off"
    : streamStatus === "connecting"
      ? "info"
      : "bad";

  return (
    <div className="mb-4 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
           <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
           <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
        </span>
        {tone === "info" ? "Connecting to live feed..." : "Live feed disconnected."}
        {tone === "bad" && (
           <button onClick={onReconnectNow} className="underline hover:no-underline ml-2">Reconnect</button>
        )}
      </div>
    </div>
  );
}

function TerminalHeader(props: {
  loading: boolean;
  onRefresh: () => void;
}) {
  const { loading, onRefresh } = props;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-medium">Spot terminal</h2>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_85%,transparent)] px-3 py-2 text-xs font-medium text-[var(--foreground)] hover:bg-[color-mix(in_srgb,var(--card)_96%,transparent)] disabled:opacity-60"
          disabled={loading}
          onClick={onRefresh}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
    </div>
  );
}

function MarketSelector(props: {
  markets: Market[];
  marketId: string;
  onMarketIdChange: (next: string) => void;
}) {
  const { markets, marketId, onMarketIdChange } = props;

  return (
    <div className="mt-4">
      <label className="flex items-center gap-2">
        <span className="text-sm font-medium text-[var(--muted)]">Market</span>
        <select
          className="rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          value={marketId}
          onChange={(e) => onMarketIdChange(e.target.value)}
        >
          <option value="">Select a market...</option>
          {markets.map((m) => (
            <option key={m.id} value={m.id}>
              {m.symbol}
            </option>
          ))}
        </select>
        <div className="ml-2 text-xs text-[var(--muted)]">
           {markets.find(m => m.id === marketId)?.chain}
        </div>
      </label>
    </div>
  );
}

function DepthPanel(props: {
  depthLevels: 10 | 20 | 50;
  onDepthLevelsChange: (next: 10 | 20 | 50) => void;
  depthMid: { mid: string; spread: string; bpsText: string | null } | null;
  depthBids: DepthLevel[];
  depthAsks: DepthLevel[];
  depthHeat: {
    bids: { rows: Array<DepthLevel & { qtyBi: bigint; cumBi: bigint }>; maxCumBi: bigint };
    asks: { rows: Array<DepthLevel & { qtyBi: bigint; cumBi: bigint }>; maxCumBi: bigint };
  };
  priceDigits: number;
  qtyDigits: number;
  onPickBidPrice: (priceText: string) => void;
  onPickAskPrice: (priceText: string) => void;
}) {
  const {
    depthLevels,
    onDepthLevelsChange,
    depthMid,
    depthBids,
    depthAsks,
    depthHeat,
    priceDigits,
    qtyDigits,
    onPickBidPrice,
    onPickAskPrice,
  } = props;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Depth ({depthLevels} levels)</h3>
        <div className="flex items-center gap-1">
          {[10, 20, 50].map((n) => (
            <button
              key={n}
              type="button"
              className={
                "rounded border border-[var(--border)] px-3 py-2 text-[11px] " +
                (depthLevels === n
                  ? "bg-[color-mix(in_srgb,var(--card)_92%,transparent)] text-[var(--foreground)]"
                  : "text-[color-mix(in_srgb,var(--foreground)_75%,var(--muted))] hover:bg-[color-mix(in_srgb,var(--card)_96%,transparent)]")
              }
              onClick={() => onDepthLevelsChange(n as 10 | 20 | 50)}
              title={`Show ${n} levels`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--border)] px-3 py-2 text-[11px]">
        <div className="text-[var(--muted)]">Mid</div>
        <div className="flex items-center gap-2 font-mono">
          <span>{depthMid?.mid ?? "—"}</span>
          <span className="text-[var(--muted)]">spread</span>
          <span>{depthMid?.spread ?? "—"}</span>
          {depthMid?.bpsText ? <span className="text-[var(--muted)]">({depthMid.bpsText})</span> : null}
        </div>
      </div>
      <div className="mt-3 grid gap-2 text-xs">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-[11px] text-[var(--muted)]">Bids</div>
            <div className="grid max-h-[28rem] gap-1 overflow-y-auto pr-1">
              {depthBids.length === 0 ? (
                <div className="text-xs text-[var(--muted)]">—</div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2 px-2 text-[10px] text-[var(--muted)]">
                    <span>Price</span>
                    <span className="text-right">Qty</span>
                    <span className="text-right">Total</span>
                  </div>
                  {depthHeat.bids.rows.map((l) => {
                    const pct = depthHeat.bids.maxCumBi > 0n ? Number((l.cumBi * 10_000n) / depthHeat.bids.maxCumBi) / 100 : 0;
                    const priceText = (() => {
                      try {
                        return formatDecimal(l.price, priceDigits);
                      } catch {
                        return l.price;
                      }
                    })();
                    const qtyText = (() => {
                      try {
                        return formatDecimal(l.quantity, qtyDigits);
                      } catch {
                        return l.quantity;
                      }
                    })();
                    const totalText = (() => {
                      try {
                        return formatDecimal(fromBigInt3818(l.cumBi), qtyDigits);
                      } catch {
                        return "";
                      }
                    })();

                    return (
                      <button
                        key={`b${l.price}`}
                        type="button"
                        className="relative w-full overflow-hidden rounded border border-[var(--border)] px-2 py-1 font-mono text-left hover:bg-[color-mix(in_srgb,var(--card)_96%,transparent)]"
                        title="Click to set ticket price"
                        onClick={() => onPickBidPrice(priceText)}
                      >
                        <span
                          className="absolute inset-y-0 left-0 bg-emerald-500/15"
                          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                          aria-hidden="true"
                        />
                        <span className="relative z-10 grid grid-cols-3 gap-2">
                          <span className="text-emerald-600 dark:text-emerald-400">{priceText}</span>
                          <span className="text-right">{qtyText}</span>
                          <span className="text-right text-[var(--muted)]">{totalText}</span>
                        </span>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          </div>
          <div>
            <div className="mb-1 text-[11px] text-[var(--muted)]">Asks</div>
            <div className="grid max-h-[28rem] gap-1 overflow-y-auto pr-1">
              {depthAsks.length === 0 ? (
                <div className="text-xs text-[var(--muted)]">—</div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2 px-2 text-[10px] text-[var(--muted)]">
                    <span>Price</span>
                    <span className="text-right">Qty</span>
                    <span className="text-right">Total</span>
                  </div>
                  {depthHeat.asks.rows.map((l) => {
                    const pct = depthHeat.asks.maxCumBi > 0n ? Number((l.cumBi * 10_000n) / depthHeat.asks.maxCumBi) / 100 : 0;
                    const priceText = (() => {
                      try {
                        return formatDecimal(l.price, priceDigits);
                      } catch {
                        return l.price;
                      }
                    })();
                    const qtyText = (() => {
                      try {
                        return formatDecimal(l.quantity, qtyDigits);
                      } catch {
                        return l.quantity;
                      }
                    })();
                    const totalText = (() => {
                      try {
                        return formatDecimal(fromBigInt3818(l.cumBi), qtyDigits);
                      } catch {
                        return "";
                      }
                    })();

                    return (
                      <button
                        key={`a${l.price}`}
                        type="button"
                        className="relative w-full overflow-hidden rounded border border-[var(--border)] px-2 py-1 font-mono text-left hover:bg-[color-mix(in_srgb,var(--card)_96%,transparent)]"
                        title="Click to set ticket price"
                        onClick={() => onPickAskPrice(priceText)}
                      >
                        <span
                          className="absolute inset-y-0 right-0 bg-rose-500/15"
                          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                          aria-hidden="true"
                        />
                        <span className="relative z-10 grid grid-cols-3 gap-2">
                          <span className="text-rose-600 dark:text-rose-400">{priceText}</span>
                          <span className="text-right">{qtyText}</span>
                          <span className="text-right text-[var(--muted)]">{totalText}</span>
                        </span>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TopOfBookPanel(props: {
  liveEnabled: boolean;
  streamStatus: "disconnected" | "connecting" | "connected" | "error";
  marketdataIsStale: boolean;
  marketdataLastTickLocal: string;
  marketdataAgeSec: number | null;
  topBid: TopLevel | null;
  topAsk: TopLevel | null;
  stats24h: MarketStats | null;
  stats24hTsMs: number | null;
  nowMs: number;
  candles1m: Candle[];
  marketId: string;
  maxVolumeSeenByMarketIdRef: { current: Record<string, bigint> };
  priceDigits: number;
}) {
  const {
    liveEnabled,
    streamStatus,
    marketdataIsStale,
    marketdataLastTickLocal,
    marketdataAgeSec,
    topBid,
    topAsk,
    stats24h,
    stats24hTsMs,
    nowMs,
    candles1m,
    marketId,
    maxVolumeSeenByMarketIdRef,
    priceDigits,
  } = props;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Top of book</h3>
        <div className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
          {(() => {
            const tone: "off" | "ok" | "info" | "warn" | "bad" = !liveEnabled
              ? "off"
              : streamStatus === "connecting"
                ? "info"
                : streamStatus === "connected"
                  ? marketdataIsStale
                    ? "warn"
                    : "ok"
                  : "bad";

            const dotCls =
              tone === "ok"
                ? "bg-emerald-500"
                : tone === "info"
                  ? "bg-[var(--accent-2)]"
                  : tone === "warn"
                    ? "bg-amber-500"
                    : tone === "bad"
                      ? "bg-rose-500"
                      : "bg-[color-mix(in_srgb,var(--muted)_55%,transparent)]";

            const pulse = tone === "ok" || tone === "info" ? "animate-pulse" : "";
            const label =
              tone === "off"
                ? "Live updates off"
                : tone === "ok"
                  ? "Live updates active"
                  : tone === "info"
                    ? "Connecting"
                    : tone === "warn"
                      ? "Delayed"
                      : "Disconnected";

            return (
              <>
                <span className={`h-2 w-2 rounded-full ${dotCls} ${pulse}`} aria-label={label} />
                <span>
                  Last tick: <span className="font-mono">{marketdataLastTickLocal}</span>
                  {typeof marketdataAgeSec === "number" ? (
                    <span className="ml-1 font-mono">({marketdataAgeSec}s)</span>
                  ) : null}
                </span>
              </>
            );
          })()}
        </div>
      </div>
      <div className="mt-3 grid gap-2 text-xs">
        <div className="flex items-center justify-between rounded border border-[var(--border)] px-3 py-2">
          <div className="text-[var(--muted)]">Best bid</div>
          <div className="font-mono">{topBid ? `${topBid.price} × ${topBid.quantity}` : "—"}</div>
        </div>
        <div className="flex items-center justify-between rounded border border-[var(--border)] px-3 py-2">
          <div className="text-[var(--muted)]">Best ask</div>
          <div className="font-mono">{topAsk ? `${topAsk.price} × ${topAsk.quantity}` : "—"}</div>
        </div>

        <div className="flex items-center justify-between rounded border border-[var(--border)] px-3 py-2">
          <div className="text-[var(--muted)]">Spread</div>
          <div className="font-mono">
            {(() => {
              const s = getSpreadDisplay(topBid, topAsk);
              if (!s) return "—";

              const tight = s.bpsX100 <= 500n; // <= 5.00 bps
              const wide = s.bpsX100 >= 2500n; // >= 25.00 bps
              const cls = tight
                ? "text-emerald-600 dark:text-emerald-400"
                : wide
                  ? "text-rose-600 dark:text-rose-400"
                  : "";

              return (
                <span className={cls}>
                  {s.spread} ({s.bps} bps)
                </span>
              );
            })()}
          </div>
        </div>

        <div className="flex items-center justify-between rounded border border-[var(--border)] px-3 py-2">
          <div className="text-[var(--muted)]">Mid (mark)</div>
          <div className="font-mono">
            {(() => {
              const s = getSpreadDisplay(topBid, topAsk);
              return s ? s.mid : "—";
            })()}
          </div>
        </div>

        <div className="flex items-center justify-between rounded border border-[var(--border)] px-3 py-2">
          <div
            className="text-[var(--muted)]"
            title="VWAP is 24h volume-weighted average price from executions; Mark is mid (best bid/ask)."
          >
            Mark vs VWAP
          </div>
          <div className="font-mono">
            {(() => {
              if (!stats24h) return "—";
              const s = getSpreadDisplay(topBid, topAsk);
              if (!s) return "—";
              const d = getMarkVsVwapDisplay(stats24h, s.midBi);
              return <span className={d.className}>{d.text}</span>;
            })()}
          </div>
        </div>

        <div className="flex items-center justify-between rounded border border-[var(--border)] px-3 py-2">
          <div className="text-[var(--muted)]" title="Absolute difference: Mark − VWAP.">
            Mark − VWAP
          </div>
          <div className="font-mono">
            {(() => {
              if (!stats24h) return "—";
              const s = getSpreadDisplay(topBid, topAsk);
              if (!s) return "—";
              const d = getMarkMinusVwapDisplay(stats24h, s.midBi, priceDigits);
              return <span className={d.className}>{d.text}</span>;
            })()}
          </div>
        </div>

        <div className="rounded border border-[var(--border)] px-3 py-2">
          <div className="mb-1 flex items-center justify-between">
            <div className="text-[11px] text-[var(--muted)]">Last price (1m candles)</div>
            <div className="font-mono text-[11px] text-[var(--muted)]">{candles1m.length ? candles1m[candles1m.length - 1]!.close : "—"}</div>
          </div>
          <div className="text-[color-mix(in_srgb,var(--foreground)_85%,var(--muted))]">
            {renderMiniCandlesFromCandles(candles1m) ?? <div className="text-xs text-[var(--muted)]">—</div>}
          </div>
        </div>

        <div className="rounded border border-[var(--border)] px-3 py-2">
          <div className="mb-2 flex items-center justify-between text-[11px] text-[var(--muted)]">
            <div>24h stats</div>
            <div className="font-mono">{stats24hTsMs ? `updated ${Math.max(0, Math.floor((nowMs - stats24hTsMs) / 1000))}s ago` : ""}</div>
          </div>
          {stats24h ? (
            <>
              <div className="grid grid-cols-1 gap-y-1 sm:grid-cols-2 sm:gap-x-4">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--muted)]">Last</span>
                  <span className="font-mono">{stats24h.last}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--muted)]">Open</span>
                  <span className="font-mono">{stats24h.open}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--muted)]">High</span>
                  <span className="font-mono">{stats24h.high}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--muted)]">Low</span>
                  <span className="font-mono">{stats24h.low}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--muted)]">Vol</span>
                  <span className="font-mono">{stats24h.volume}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--muted)]">VWAP</span>
                  <span className="font-mono">{stats24h.vwap ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--muted)]">Notional</span>
                  <span className="font-mono">{stats24h.quote_volume ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--muted)]">Trades</span>
                  <span className="font-mono">{stats24h.trade_count}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--muted)]">Change</span>
                  {(() => {
                    const c = getChangeDisplay(stats24h);
                    return (
                      <span className={`font-mono ${c.className}`}>
                        {c.arrow ? `${c.arrow} ` : ""}
                        {c.text}
                      </span>
                    );
                  })()}
                </div>
              </div>

              {(() => {
                const pct = getRangePositionPct(stats24h);
                if (pct == null) return null;
                return (
                  <div className="mt-2">
                    <div className="mb-1 flex items-center justify-between text-[11px] text-[var(--muted)]">
                      <div>24h range</div>
                      <div className="font-mono">{pct.toFixed(2)}%</div>
                    </div>
                    <div className="relative h-2 w-full rounded bg-[color-mix(in_srgb,var(--border)_55%,transparent)]">
                      <div
                        className="absolute top-0 h-2 w-1 rounded bg-[color-mix(in_srgb,var(--foreground)_75%,var(--muted))]"
                        style={{ left: `calc(${pct}% - 2px)` }}
                        aria-label="last price position"
                      />
                    </div>
                  </div>
                );
              })()}

              {(() => {
                try {
                  const maxMap = maxVolumeSeenByMarketIdRef.current;
                  const max = marketId ? (maxMap[marketId] ?? 0n) : 0n;
                  const v = toBigInt3818(stats24h.volume);
                  if (max <= 0n) return null;
                  const pct = Number((v * 10_000n) / max) / 100;
                  const clamped = Math.max(0, Math.min(100, pct));
                  return (
                    <div className="mt-2">
                      <div className="mb-1 flex items-center justify-between text-[11px] text-[var(--muted)]">
                        <div>24h volume (vs max seen)</div>
                        <div className="font-mono">{clamped.toFixed(2)}%</div>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded bg-[color-mix(in_srgb,var(--border)_55%,transparent)]">
                        <div
                          className="h-2 rounded bg-indigo-600/60 dark:bg-indigo-400/60"
                          style={{ width: `${clamped}%` }}
                          aria-label="24h volume relative bar"
                        />
                      </div>
                    </div>
                  );
                } catch {
                  return null;
                }
              })()}
            </>
          ) : (
            <div className="text-xs text-[var(--muted)]">—</div>
          )}
        </div>
      </div>
    </div>
  );
}

function RecentTradesPanel(props: { trades: Trade[] }) {
  const { trades } = props;
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
      <h3 className="text-sm font-medium">Recent trades</h3>
      <div className="mt-3 grid gap-1 text-xs">
        {trades.length === 0 ? (
          <div className="text-xs text-[var(--muted)]">—</div>
        ) : (
          trades.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between rounded border border-[var(--border)] px-2 py-1 font-mono"
            >
              <span>{t.price}</span>
              <span>{t.quantity}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function ExchangeTradingClient({ initialMarketId }: { initialMarketId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(false);
  const [replaceLoading, setReplaceLoading] = useState(false);
  const [error, setError] = useState<ClientApiError | null>(null);

  const [liveEnabled, setLiveEnabled] = useState(true);
  const [pollMs, setPollMs] = useState(1000);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastKind, setToastKind] = useState<ToastKind>("info");

  const maxVolumeSeenByMarketIdRef = useRef<Record<string, bigint>>({});

  const [authMode, setAuthMode] = useState<"session" | "header">("session");
  const [actingUserId, setActingUserId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return readActingUserIdPreference();
  });

  const canUseHeader = !!(actingUserId.trim() && isUuid(actingUserId.trim()));

  const requestHeaders = useMemo(() => {
    if (authMode !== "header") return undefined;
    const id = actingUserId.trim();
    if (!id) return undefined;
    return { "x-user-id": id };
  }, [authMode, actingUserId]);

  const [markets, setMarkets] = useState<Market[]>([]);
  const [marketId, setMarketId] = useState<string>(() => (initialMarketId ? initialMarketId.trim() : ""));

  useEffect(() => {
    const raw = searchParams.get("market_id") || searchParams.get("market");
    const next = raw ? raw.trim() : "";
    if (!next) return;
    setMarketId((prev) => (prev === next ? prev : next));
  }, [searchParams]);

  useEffect(() => {
    const desired = marketId.trim() ? marketId.trim() : null;
    const current = searchParams.get("market_id");
    if ((current ?? null) === desired) return;

    const params = new URLSearchParams(searchParams.toString());
    if (desired) params.set("market_id", desired);
    else params.delete("market_id");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [marketId, pathname, router, searchParams]);

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"limit" | "market">("limit");
  const [price, setPrice] = useState<string>("10");
  const [quantity, setQuantity] = useState<string>("1");
  const [postOnly, setPostOnly] = useState<boolean>(false);

  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [holds, setHolds] = useState<HoldRow[]>([]);
  const [accountTsMs, setAccountTsMs] = useState<number | null>(null);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loadedOrderId, setLoadedOrderId] = useState<string | null>(null);
  const [cancelingOrderId, setCancelingOrderId] = useState<string | null>(null);
  const [cancelAllLoading, setCancelAllLoading] = useState(false);

  const [trades, setTrades] = useState<Trade[]>([]);
  const [candles1m, setCandles1m] = useState<Candle[]>([]);
  const [stats24h, setStats24h] = useState<MarketStats | null>(null);
  const [stats24hTsMs, setStats24hTsMs] = useState<number | null>(null);

  const [topBid, setTopBid] = useState<TopLevel | null>(null);
  const [topAsk, setTopAsk] = useState<TopLevel | null>(null);
  const [depthBids, setDepthBids] = useState<DepthLevel[]>([]);
  const [depthAsks, setDepthAsks] = useState<DepthLevel[]>([]);
  const [depthLevels, setDepthLevels] = useState<10 | 20 | 50>(10);

  // ── WebSocket live market-data stream ─────────────────────────────
  const stream = useExchangeStream(marketId || null, {
    enabled: liveEnabled,
    levels: depthLevels,
    pollMs,
    tradesLimit: 25,
    onTop: useCallback((bid: TopLevel | null, ask: TopLevel | null) => {
      setTopBid(bid);
      setTopAsk(ask);
    }, []),
    onDepth: useCallback((bids: DepthLevel[], asks: DepthLevel[]) => {
      setDepthBids(bids);
      setDepthAsks(asks);
    }, []),
    onTrades: useCallback((incoming: Trade[], mode: "snapshot" | "delta") => {
      if (mode === "delta") {
        setTrades((prev) => {
          if (incoming.length === 0) return prev;
          const seen = new Set<string>();
          const merged: Trade[] = [];
          for (const t of incoming) {
            if (seen.has(t.id)) continue;
            seen.add(t.id);
            merged.push(t);
          }
          for (const t of prev) {
            if (seen.has(t.id)) continue;
            seen.add(t.id);
            merged.push(t);
          }
          return merged.slice(0, 25);
        });
        setCandles1m((prev) => applyTradesDeltaToCandles(prev, incoming, 60));
      } else {
        setTrades(incoming);
        setCandles1m(buildCandlesFromTrades(incoming, 60));
      }
    }, []),
  });

  // Aliases for stream state (consumed by MarketdataStatusBanner and other UI)
  const streamStatus = stream.status;
  const streamAttempt = stream.attempt;
  const streamNextRetryAtMs = stream.nextRetryAtMs;
  const lastMarketdataUpdateAtMs = stream.lastUpdateAtMs;
  const onReconnectNow = stream.reconnectNow;

  const market = useMemo(() => markets.find((m) => m.id === marketId) ?? null, [markets, marketId]);
  const priceDigits = useMemo(() => digitsFromStep(market?.tick_size, 6, 10), [market?.tick_size]);
  const qtyDigits = useMemo(() => digitsFromStep(market?.lot_size, 6, 10), [market?.lot_size]);

  const makerFeeBps = market?.maker_fee_bps ?? 0;
  const takerFeeBps = market?.taker_fee_bps ?? 0;
  const reserveFeeBps = Math.max(0, makerFeeBps, takerFeeBps);

  const priceStep = market?.tick_size ?? null;
  const qtyStep = market?.lot_size ?? null;

  const normalizedPrice = useMemo(() => {
    try {
      const v = price.trim();
      if (!v) return "";
      if (!priceStep) return formatDecimal(v, priceDigits);
      const q = quantizeDownToStep3818(v, priceStep);
      return formatDecimal(q, priceDigits);
    } catch {
      return "";
    }
  }, [price, priceDigits, priceStep]);

  const normalizedQty = useMemo(() => {
    try {
      const v = quantity.trim();
      if (!v) return "";
      if (!qtyStep) return formatDecimal(v, qtyDigits);
      const q = quantizeDownToStep3818(v, qtyStep);
      return formatDecimal(q, qtyDigits);
    } catch {
      return "";
    }
  }, [quantity, qtyDigits, qtyStep]);

  const priceStepWarning = useMemo(() => {
    try {
      const v = price.trim();
      if (!v || !priceStep) return false;
      return !isMultipleOfStep3818(v, priceStep);
    } catch {
      return false;
    }
  }, [price, priceStep]);

  const qtyStepWarning = useMemo(() => {
    try {
      const v = quantity.trim();
      if (!v || !qtyStep) return false;
      return !isMultipleOfStep3818(v, qtyStep);
    } catch {
      return false;
    }
  }, [quantity, qtyStep]);

  const notionalPreview = useMemo(() => {
    try {
      const p = normalizedPrice;
      const q = normalizedQty;
      if (!p || !q) return null;
      const n = mul3818Round(p, q);
      return formatDecimal(n, 6);
    } catch {
      return null;
    }
  }, [normalizedPrice, normalizedQty]);

  const markPrice = useMemo(() => {
    try {
      const s = getSpreadDisplay(topBid, topAsk);
      return s?.mid ?? null;
    } catch {
      return null;
    }
  }, [topAsk, topBid]);

  const baseBalance = useMemo(() => {
    if (!market) return null;
    return balances.find((b) => b.asset_id === market.base_asset_id) ?? null;
  }, [balances, market]);

  const quoteBalance = useMemo(() => {
    if (!market) return null;
    return balances.find((b) => b.asset_id === market.quote_asset_id) ?? null;
  }, [balances, market]);

  const ticketRequirement = useMemo(() => {
    try {
      if (!market) return null;
      const p = normalizedPrice;
      const q = normalizedQty;
      if (!p || !q) return null;

      const baseSym = baseBalance?.symbol ?? "BASE";
      const quoteSym = quoteBalance?.symbol ?? "QUOTE";

      if (side === "sell") {
        return {
          baseSym,
          quoteSym,
          requiredAsset: baseSym,
          requiredAmount: q,
          notional: null as string | null,
          fee: null as string | null,
          total: null as string | null,
        };
      }

      const notional = mul3818Ceil(p, q);
      const fee = reserveFeeBps > 0 ? bpsFeeCeil3818(notional, reserveFeeBps) : "0";
      const total = reserveFeeBps > 0 ? add3818(notional, fee) : notional;
      return {
        baseSym,
        quoteSym,
        requiredAsset: quoteSym,
        requiredAmount: total,
        notional,
        fee,
        total,
      };
    } catch {
      return null;
    }
  }, [baseBalance?.symbol, market, normalizedPrice, normalizedQty, quoteBalance?.symbol, reserveFeeBps, side]);

  const hasSufficientFunds = useMemo(() => {
    try {
      if (!ticketRequirement || !market) return null;
      if (side === "sell") {
        if (!baseBalance?.available) return null;
        return toBigInt3818(baseBalance.available) >= toBigInt3818(ticketRequirement.requiredAmount);
      }
      if (!quoteBalance?.available) return null;
      return toBigInt3818(quoteBalance.available) >= toBigInt3818(ticketRequirement.requiredAmount);
    } catch {
      return null;
    }
  }, [baseBalance?.available, market, quoteBalance?.available, side, ticketRequirement]);

  const insufficientFundsText = useMemo(() => {
    try {
      if (!ticketRequirement || hasSufficientFunds !== false) return "";
      const asset = ticketRequirement.requiredAsset;
      const need = ticketRequirement.requiredAmount;
      const avail = side === "sell" ? baseBalance?.available : quoteBalance?.available;
      if (!avail) return `Insufficient ${asset}`;
      return `Insufficient ${asset} (need ${formatDecimal(need, 6)}, avail ${formatDecimal(avail, 6)})`;
    } catch {
      return "";
    }
  }, [baseBalance?.available, hasSufficientFunds, quoteBalance?.available, side, ticketRequirement]);

  const maxQtyForTicket = useMemo(() => {
    try {
      if (!market || !qtyStep) return "";

      const stepBi = toBigInt3818(qtyStep);
      if (stepBi <= 0n) return "";

      if (side === "sell") {
        const availBase = baseBalance?.available;
        if (!availBase) return "";
        const availBi = toBigInt3818(availBase);
        const qBi = (availBi / stepBi) * stepBi;
        if (qBi <= 0n) return "";
        return formatDecimal(fromBigInt3818(qBi), qtyDigits);
      }

      const availQuote = quoteBalance?.available;
      if (!availQuote) return "";
      const p = normalizedPrice;
      if (!p) return "";
      const priceBi = toBigInt3818(p);
      if (priceBi <= 0n) return "";

      const availBi = toBigInt3818(availQuote);
      if (availBi <= 0n) return "";

      const feeFactorBi = SCALE_1E18 + (BigInt(reserveFeeBps) * SCALE_1E18) / 10_000n;

      const denomProd = priceBi * feeFactorBi;
      const denomBi = denomProd / SCALE_1E18 + (denomProd % SCALE_1E18 === 0n ? 0n : 1n);
      if (denomBi <= 0n) return "";

      const qtyBi = (availBi * SCALE_1E18) / denomBi;
      const qBi = (qtyBi / stepBi) * stepBi;
      if (qBi <= 0n) return "";
      return formatDecimal(fromBigInt3818(qBi), qtyDigits);
    } catch {
      return "";
    }
  }, [baseBalance?.available, market, normalizedPrice, qtyDigits, qtyStep, quoteBalance?.available, reserveFeeBps, side]);

  const expectedLiquidityForTicket = useMemo(() => {
    try {
      if (!market) return null;
      const p = normalizedPrice;
      if (!p) return null;

      if (side === "buy") {
        const ask = topAsk?.price ?? null;
        const isTaker = ask ? cmp3818(p, ask) >= 0 : false;
        return {
          feeBps: isTaker ? takerFeeBps : makerFeeBps,
          hint: isTaker ? ("taker" as const) : ("maker" as const),
          threshold: ask,
        };
      }

      // sell
      const bid = topBid?.price ?? null;
      const isTaker = bid ? cmp3818(p, bid) <= 0 : false;
      return {
        feeBps: isTaker ? takerFeeBps : makerFeeBps,
        hint: isTaker ? ("taker" as const) : ("maker" as const),
        threshold: bid,
      };
    } catch {
      return null;
    }
  }, [makerFeeBps, market, normalizedPrice, side, takerFeeBps, topAsk?.price, topBid?.price]);

  const ticketQuoteBreakdown = useMemo(() => {
    try {
      if (!market) return null;
      const p = normalizedPrice;
      const q = normalizedQty;
      if (!p || !q) return null;

      const baseSym = baseBalance?.symbol ?? "BASE";
      const quoteSym = quoteBalance?.symbol ?? "QUOTE";
      const gross = side === "buy" ? mul3818Ceil(p, q) : mul3818Round(p, q);

      const feeMax = reserveFeeBps > 0 ? bpsFeeCeil3818(gross, reserveFeeBps) : "0";
      const totalMax = side === "buy" ? add3818(gross, feeMax) : sub3818NonNegative(gross, feeMax);

      const expected = expectedLiquidityForTicket;
      const expectedFeeBps = expected?.feeBps ?? null;
      const feeExpected = expectedFeeBps != null && expectedFeeBps > 0 ? bpsFeeCeil3818(gross, expectedFeeBps) : "0";
      const totalExpected = side === "buy" ? add3818(gross, feeExpected) : sub3818NonNegative(gross, feeExpected);

      const liquidityHint = expected?.hint ?? null;
      let expectedThresholdText: string | null = null;
      if (expected?.threshold) {
        const px = formatDecimal(expected.threshold, priceDigits);
        if (side === "buy") expectedThresholdText = `taker if ≥ ask ${px}`;
        else expectedThresholdText = `taker if ≤ bid ${px}`;
      }

      const qtyBi = toBigInt3818(q);
      const grossBi = toBigInt3818(gross);
      const feeExpectedBi = toBigInt3818(feeExpected);
      const feeMaxBi = toBigInt3818(feeMax);
      const totalExpectedBi = toBigInt3818(totalExpected);
      const totalMaxBi = toBigInt3818(totalMax);

      const effFeePctExpected =
        grossBi > 0n ? fromBigInt3818((feeExpectedBi * 100n * SCALE_1E18) / grossBi) : null;
      const effFeePctMax = grossBi > 0n ? fromBigInt3818((feeMaxBi * 100n * SCALE_1E18) / grossBi) : null;

      const effPriceExpected =
        qtyBi > 0n ? fromBigInt3818((totalExpectedBi * SCALE_1E18) / qtyBi) : null;
      const effPriceMax = qtyBi > 0n ? fromBigInt3818((totalMaxBi * SCALE_1E18) / qtyBi) : null;

      const markStr = markPrice;
      const markBi = markStr ? toBigInt3818(markStr) : null;

      function slippageBpsText(effPriceStr: string | null): { text: string; bpsAbsX1e2?: string; className: string } | null {
        if (!effPriceStr || markBi == null || markBi <= 0n) return null;
        const effBi = toBigInt3818(effPriceStr);

        // signed bps (fixed 18dp) = (eff - mark) / mark * 10_000
        const delta = effBi - markBi;
        const bpsFixed18 = (delta * 10_000n * SCALE_1E18) / markBi;

        const up = bpsFixed18 >= 0n;
        const abs = up ? bpsFixed18 : -bpsFixed18;
        const absStr = formatDecimal(fromBigInt3818(abs), 2);
        const sign = up ? "+" : "-";
        const text = `${sign}${absStr} bps`;

        const isWorse = side === "buy" ? up : !up;
        const className = isWorse ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400";
        return { text, className };
      }

      const vsMarkExpected = slippageBpsText(effPriceExpected);
      const vsMarkMax = slippageBpsText(effPriceMax);

      return {
        baseSym,
        quoteSym,
        gross,
        feeExpected,
        totalExpected,
        feeBpsExpected: expectedFeeBps,
        liquidityHint,
        canInferLiquidity: Boolean(expected?.threshold),
        expectedThresholdText,
        feeMax,
        totalMax,
        feeBpsMax: reserveFeeBps,
        effFeePctExpected,
        effFeePctMax,
        effPriceExpected,
        effPriceMax,
        markStr,
        vsMarkExpected,
        vsMarkMax,
      };
    } catch {
      return null;
    }
  }, [
    baseBalance?.symbol,
    expectedLiquidityForTicket,
    market,
    markPrice,
    normalizedPrice,
    normalizedQty,
    priceDigits,
    quoteBalance?.symbol,
    reserveFeeBps,
    side,
  ]);

  const postOnlyBlocked = Boolean(
    postOnly && ticketQuoteBreakdown?.canInferLiquidity && ticketQuoteBreakdown?.liquidityHint === "taker"
  );

  const maxSellQty = useMemo(() => {
    try {
      if (!market || !qtyStep) return "";
      const avail = baseBalance?.available;
      if (!avail) return "";
      const stepBi = toBigInt3818(qtyStep);
      if (stepBi <= 0n) return "";
      const availBi = toBigInt3818(avail);
      const qBi = (availBi / stepBi) * stepBi;
      if (qBi <= 0n) return "";
      return formatDecimal(fromBigInt3818(qBi), qtyDigits);
    } catch {
      return "";
    }
  }, [baseBalance?.available, market, qtyDigits, qtyStep]);

  const setQtyFromMaxPct = useCallback(
    (pct: number) => {
      try {
        if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return;
        if (!maxQtyForTicket || !qtyStep) return;

        const maxBi = toBigInt3818(maxQtyForTicket);
        const stepBi = toBigInt3818(qtyStep);
        if (maxBi <= 0n || stepBi <= 0n) return;

        const pctBi = BigInt(Math.floor(pct));
        const rawBi = (maxBi * pctBi) / 100n;
        const qBi = (rawBi / stepBi) * stepBi;
        if (qBi <= 0n) return;
        setQuantity(formatDecimal(fromBigInt3818(qBi), qtyDigits));
      } catch {
        // ignore
      }
    },
    [maxQtyForTicket, qtyDigits, qtyStep]
  );

  const ordersSorted = useMemo(() => {
    return orders
      .slice()
      .sort((a, b) => {
        if (a.created_at > b.created_at) return -1;
        if (a.created_at < b.created_at) return 1;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
  }, [orders]);

  const openOrders = useMemo(() => {
    return ordersSorted.filter((o) => o.status === "open" || o.status === "partially_filled");
  }, [ordersSorted]);

  const closedOrders = useMemo(() => {
    return ordersSorted.filter((o) => !(o.status === "open" || o.status === "partially_filled"));
  }, [ordersSorted]);

  useEffect(() => {
    const raw = searchParams.get("depth");
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    const next: 10 | 20 | 50 = parsed === 20 || parsed === 50 ? (parsed as 20 | 50) : 10;
    setDepthLevels((prev) => (prev === next ? prev : next));
  }, [searchParams]);

  useEffect(() => {
    const desired = depthLevels === 10 ? null : String(depthLevels);
    const current = searchParams.get("depth");
    if ((current ?? null) === desired) return;

    const params = new URLSearchParams(searchParams.toString());
    if (desired) params.set("depth", desired);
    else params.delete("depth");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [depthLevels, pathname, router, searchParams]);

  const depthHeat = useMemo(() => {
    const build = (levels: DepthLevel[]) => {
      let cumBi = 0n;
      const rows = levels.map((l) => {
        let qtyBi = 0n;
        try {
          qtyBi = toBigInt3818(l.quantity);
        } catch {
          qtyBi = 0n;
        }
        if (qtyBi > 0n) cumBi += qtyBi;
        return { ...l, qtyBi, cumBi };
      });

      const maxCumBi = rows.length > 0 ? rows[rows.length - 1]!.cumBi : 0n;
      return { rows, maxCumBi };
    };

    return {
      bids: build(depthBids),
      asks: build(depthAsks),
    };
  }, [depthAsks, depthBids]);

  const depthMid = useMemo(() => {
    if (!topBid || !topAsk) return null;
    try {
      const bidBi = toBigInt3818(topBid.price);
      const askBi = toBigInt3818(topAsk.price);
      if (bidBi <= 0n || askBi <= 0n) return null;
      if (askBi < bidBi) return null;

      const midBi = (bidBi + askBi) / 2n;
      const spreadBi = askBi - bidBi;

      const spread = getSpreadDisplay(topBid, topAsk);
      const bpsText = (() => {
        if (!spread) return null;
        const x = spread.bpsX100;
        const whole = x / 100n;
        const frac = x % 100n;
        return `${whole.toString()}.${frac.toString().padStart(2, "0")} bps`;
      })();

      return {
        mid: formatDecimal(fromBigInt3818(midBi), priceDigits),
        spread: formatDecimal(fromBigInt3818(spreadBi), priceDigits),
        bpsText,
      };
    } catch {
      return null;
    }
  }, [priceDigits, topAsk, topBid]);

  const loadedOrder = useMemo(() => {
    if (!loadedOrderId) return null;
    return orders.find((o) => o.id === loadedOrderId) ?? null;
  }, [loadedOrderId, orders]);

  useEffect(() => {
    if (!loadedOrderId) return;
    if (loadedOrder) return;
    setLoadedOrderId(null);
  }, [loadedOrder, loadedOrderId]);

  const refreshStats = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? false;
      if (!marketId) return;
      try {
        const s = await fetchJsonOrThrow<{ stats: MarketStats | null; ts?: string }>(
          `/api/exchange/marketdata/stats?market_id=${encodeURIComponent(marketId)}&window_hours=24`,
          { cache: "no-store" }
        );
        setStats24h(s.stats ?? null);
        setStats24hTsMs(s.ts ? Date.parse(s.ts) : Date.now());
      } catch (e) {
        if (!silent) {
          if (e instanceof ApiError) setError({ code: e.code, details: e.details });
          else setError({ code: e instanceof Error ? e.message : String(e) });
        }
      }
    },
    [marketId]
  );

  async function refresh(opts?: { silent?: boolean }) {
    const silent = opts?.silent ?? false;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const m = await fetchJsonOrThrow<{ markets: Market[] }>("/api/exchange/markets", { cache: "no-store" });
      setMarkets(m.markets ?? []);

      const requested = marketId;
      const hasRequested = Boolean(requested && m.markets?.some((mm) => mm.id === requested));
      const chosen = hasRequested ? requested : m.markets?.[0]?.id || "";
      if (!requested && chosen) setMarketId(chosen);
      if (requested && !hasRequested && chosen) setMarketId(chosen);

      if (!chosen) {
        setTopBid(null);
        setTopAsk(null);
        setDepthBids([]);
        setDepthAsks([]);
        setTrades([]);
        setOrders([]);
        return;
      }

      const top = await fetchJsonOrThrow<{ top?: { bid: TopLevel | null; ask: TopLevel | null } }>(
        `/api/exchange/marketdata/top?market_id=${encodeURIComponent(chosen)}`,
        { cache: "no-store" }
      );
      setTopBid(top.top?.bid ?? null);
      setTopAsk(top.top?.ask ?? null);

      const depth = await fetchJsonOrThrow<{ depth?: { bids: DepthLevel[]; asks: DepthLevel[] } }>(
        `/api/exchange/marketdata/depth?market_id=${encodeURIComponent(chosen)}&levels=${depthLevels}`,
        { cache: "no-store" }
      );
      setDepthBids(depth.depth?.bids ?? []);
      setDepthAsks(depth.depth?.asks ?? []);

      const t = await fetchJsonOrThrow<{ trades: Trade[] }>(
        `/api/exchange/marketdata/trades?market_id=${encodeURIComponent(chosen)}&limit=25`,
        { cache: "no-store" }
      );
      setTrades(t.trades ?? []);

      // Best-effort candles; used for UI only.
      try {
        const c = await fetchJsonOrThrow<{ candles?: Candle[] }>(
          `/api/exchange/marketdata/candles?market_id=${encodeURIComponent(chosen)}&interval=1m&limit=60`,
          { cache: "no-store" }
        );
        setCandles1m(c.candles ?? []);
      } catch {
        // keep whatever we had
      }

      // Best-effort 24h stats.
      try {
        const s = await fetchJsonOrThrow<{ stats: MarketStats | null; ts?: string }>(
          `/api/exchange/marketdata/stats?market_id=${encodeURIComponent(chosen)}&window_hours=24`,
          { cache: "no-store" }
        );
        setStats24h(s.stats ?? null);
        setStats24hTsMs(s.ts ? Date.parse(s.ts) : Date.now());
      } catch {
        // keep whatever we had
      }

      // Orders are behind auth; keep best-effort.
      try {
        const o = await fetchJsonOrThrow<{ orders: Order[] }>(
          `/api/exchange/orders?market_id=${encodeURIComponent(chosen)}`,
          { cache: "no-store", headers: requestHeaders }
        );
        setOrders(o.orders ?? []);
      } catch {
        setOrders([]);
      }

      // Balances + holds are behind auth; keep best-effort.
      try {
        const b = await fetchJsonOrThrow<{ balances: BalanceRow[] }>("/api/exchange/balances", {
          cache: "no-store",
          headers: requestHeaders,
        });
        setBalances(b.balances ?? []);
        setAccountTsMs(Date.now());
      } catch {
        setBalances([]);
      }

      try {
        const h = await fetchJsonOrThrow<{ holds: HoldRow[] }>("/api/exchange/holds?status=active", {
          cache: "no-store",
          headers: requestHeaders,
        });
        setHolds(h.holds ?? []);
        setAccountTsMs(Date.now());
      } catch {
        setHolds([]);
      }
    } catch (e) {
      if (!silent) {
        if (e instanceof ApiError) setError({ code: e.code, details: e.details });
        else setError({ code: e instanceof Error ? e.message : String(e) });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authMode]);

  useEffect(() => {
    if (!marketId) return;
    void refresh();
    void refreshStats({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketId, refreshStats]);

  useEffect(() => {
    if (!marketId) return;
    if (!stats24h?.volume) return;
    try {
      const v = toBigInt3818(stats24h.volume);
      const map = maxVolumeSeenByMarketIdRef.current;
      const prev = map[marketId] ?? 0n;
      if (v > prev) map[marketId] = v;
    } catch {
      // ignore
    }
  }, [marketId, stats24h?.volume]);

  useEffect(() => {
    if (!marketId) return;
    const t = setInterval(() => {
      void refreshStats({ silent: true });
    }, 30_000);
    return () => clearInterval(t);
  }, [marketId, refreshStats]);

  // ── Depth-level change (when live is off, fetch once) ─────────
  useEffect(() => {
    if (!marketId) return;
    if (!liveEnabled) {
      void refresh({ silent: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depthLevels]);

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const marketdataAgeSec = useMemo(() => {
    if (typeof lastMarketdataUpdateAtMs !== "number") return null;
    return Math.max(0, Math.floor((nowMs - lastMarketdataUpdateAtMs) / 1000));
  }, [lastMarketdataUpdateAtMs, nowMs]);

  const marketdataIsStale = useMemo(() => {
    if (!liveEnabled) return false;
    if (streamStatus !== "connected") return false;
    if (typeof lastMarketdataUpdateAtMs !== "number") return false;
    const staleMs = Math.max(20_000, pollMs * 6);
    return nowMs - lastMarketdataUpdateAtMs > staleMs;
  }, [lastMarketdataUpdateAtMs, liveEnabled, nowMs, pollMs, streamStatus]);

  const marketdataLastTickLocal = useMemo(() => {
    if (typeof lastMarketdataUpdateAtMs !== "number") return "—";
    try {
      return new Date(lastMarketdataUpdateAtMs).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return "—";
    }
  }, [lastMarketdataUpdateAtMs]);

  // ── Fallback HTTP polling when WS is down ─────────────────────
  useEffect(() => {
    if (!marketId) return;
    if (!liveEnabled) return;
    if (streamStatus === "connected" || streamStatus === "connecting") return;

    const timer = setInterval(() => {
      void refresh({ silent: true });
    }, Math.max(5000, pollMs * 5));

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketId, streamStatus]);

  const isProd = process.env.NODE_ENV === "production";

  const onSeedDev = () => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        await fetchJsonOrThrow("/api/exchange/dev/seed-assets", { method: "POST" });
        await fetchJsonOrThrow("/api/exchange/dev/seed-markets", { method: "POST" });
        setToastKind("success");
        setToastMessage("Seeded assets + market.");
        await refresh();
      } catch (e) {
        if (e instanceof ApiError) setError({ code: e.code, details: e.details });
        else setError({ code: e instanceof Error ? e.message : String(e) });
      } finally {
        setLoading(false);
      }
    })();
  };

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-[var(--shadow)]">
      <Toast message={toastMessage} kind={toastKind} onDone={() => setToastMessage(null)} />

      <MarketdataStatusBanner
        liveEnabled={liveEnabled}
        streamStatus={streamStatus}
        lastMarketdataUpdateAtMs={lastMarketdataUpdateAtMs}
        nowMs={nowMs}
        pollMs={pollMs}
        streamNextRetryAtMs={streamNextRetryAtMs}
        streamAttempt={streamAttempt}
        onReconnectNow={onReconnectNow}
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <TerminalHeader
          loading={loading}
          onRefresh={() => void refresh()}
        />

        <MarketSelector
          markets={markets}
          marketId={marketId}
          onMarketIdChange={setMarketId}
        />
      </div>

      <ApiErrorBanner error={error} className="mt-4" onRetry={() => void refresh()} />

      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <div className="grid gap-4 lg:col-span-3 lg:sticky lg:top-24 lg:self-start">
          <DepthPanel
            depthLevels={depthLevels}
            onDepthLevelsChange={setDepthLevels}
            depthMid={depthMid}
            depthBids={depthBids}
            depthAsks={depthAsks}
            depthHeat={depthHeat}
            priceDigits={priceDigits}
            qtyDigits={qtyDigits}
            onPickBidPrice={(priceText) => {
              setSide("sell");
              setPrice(priceText);
            }}
            onPickAskPrice={(priceText) => {
              setSide("buy");
              setPrice(priceText);
            }}
          />
        </div>

        <div className="grid gap-4 lg:col-span-6">
          <TopOfBookPanel
            liveEnabled={liveEnabled}
            streamStatus={streamStatus}
            marketdataIsStale={marketdataIsStale}
            marketdataLastTickLocal={marketdataLastTickLocal}
            marketdataAgeSec={marketdataAgeSec}
            topBid={topBid}
            topAsk={topAsk}
            stats24h={stats24h}
            stats24hTsMs={stats24hTsMs}
            nowMs={nowMs}
            candles1m={candles1m}
            marketId={marketId}
            maxVolumeSeenByMarketIdRef={maxVolumeSeenByMarketIdRef}
            priceDigits={priceDigits}
          />

          <CandleChart marketId={marketId || null} height={380} />

          <RecentTradesPanel trades={trades} />
        </div>

        <div className="lg:col-span-3 lg:sticky lg:top-24 lg:self-start">
          <div className="grid gap-4 lg:max-h-[calc(100vh-9rem)] lg:overflow-auto lg:pr-1">

            <OrderTicketPanel
              market={market}
              marketId={marketId}
              orderType={orderType}
              setOrderType={setOrderType}
              priceDigits={priceDigits}
              qtyDigits={qtyDigits}
              priceStep={priceStep}
              qtyStep={qtyStep}
              topBid={topBid}
              topAsk={topAsk}
              stats24h={stats24h}
              notionalPreview={notionalPreview}
              ticketQuoteBreakdown={ticketQuoteBreakdown}
              insufficientFundsText={insufficientFundsText}
              hasSufficientFunds={hasSufficientFunds}
              postOnly={postOnly}
              setPostOnly={setPostOnly}
              postOnlyBlocked={postOnlyBlocked}
              side={side}
              setSide={setSide}
              price={price}
              setPrice={setPrice}
              quantity={quantity}
              setQuantity={setQuantity}
              normalizedPrice={normalizedPrice}
              normalizedQty={normalizedQty}
              priceStepWarning={priceStepWarning}
              qtyStepWarning={qtyStepWarning}
              baseBalance={baseBalance}
              quoteBalance={quoteBalance}
              maxSellQty={maxSellQty}
              maxQtyForTicket={maxQtyForTicket}
              setQtyFromMaxPct={setQtyFromMaxPct}
              takerFeeBps={takerFeeBps}
              reserveFeeBps={reserveFeeBps}
              loading={loading}
              replaceLoading={replaceLoading}
              cancelAllLoading={cancelAllLoading}
              authMode={authMode}
              canUseHeader={canUseHeader}
              requestHeaders={requestHeaders}
              refresh={refresh}
              setLoading={setLoading}
              setReplaceLoading={setReplaceLoading}
              setError={setError}
              setToastKind={setToastKind}
              setToastMessage={setToastMessage}
              loadedOrder={loadedOrder}
              setLoadedOrderId={setLoadedOrderId}
              formatDecimal={formatDecimal}
              quantizeDownToStep3818={quantizeDownToStep3818}
              multiplyStep3818={multiplyStep3818}
              getSpreadDisplay={getSpreadDisplay}
            />

            <BalancesPanel
              nowMs={nowMs}
              accountTsMs={accountTsMs}
              market={market}
              baseBalance={baseBalance}
              quoteBalance={quoteBalance}
              ticketRequirement={ticketRequirement}
              hasSufficientFunds={hasSufficientFunds}
              holds={holds}
              formatDecimal={formatDecimal}
            />

            <MyOrdersPanel
              nowMs={nowMs}
              marketId={marketId}
              authMode={authMode}
              canUseHeader={canUseHeader}
              requestHeaders={requestHeaders}
              ordersSorted={ordersSorted}
              openOrders={openOrders}
              closedOrders={closedOrders}
              qtyDigits={qtyDigits}
              priceDigits={priceDigits}
              cancelAllLoading={cancelAllLoading}
              setCancelAllLoading={setCancelAllLoading}
              cancelingOrderId={cancelingOrderId}
              setCancelingOrderId={setCancelingOrderId}
              refresh={refresh}
              setError={setError}
              setToastKind={setToastKind}
              setToastMessage={setToastMessage}
              setSide={setSide}
              setPrice={setPrice}
              setQuantity={setQuantity}
              setLoadedOrderId={setLoadedOrderId}
              formatDecimal={formatDecimal}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
