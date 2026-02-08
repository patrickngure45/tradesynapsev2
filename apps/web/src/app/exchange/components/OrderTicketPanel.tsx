import { ApiError, fetchJsonOrThrow } from "@/lib/api/client";
import type { ClientApiError } from "@/components/ApiErrorBanner";
import type { ToastKind } from "@/components/Toast";
import { fromBigInt3818, toBigInt3818 } from "@/lib/exchange/fixed3818";
import { isMultipleOfStep3818 } from "@/lib/exchange/steps";

import type { BalanceRow, Market, MarketStats, Order, TicketQuoteBreakdown, TopLevel } from "../types";

const SCALE_1E18 = 10n ** 18n;

type SpreadDisplay = {
  spread: string;
  bps: string;
  bpsX100: bigint;
  mid: string;
  midBi: bigint;
};

export function OrderTicketPanel(props: {
  market: Market | null;
  marketId: string;
  orderType: "limit" | "market";
  setOrderType: (next: "limit" | "market") => void;
  priceDigits: number;
  qtyDigits: number;
  priceStep: string | null;
  qtyStep: string | null;
  topBid: TopLevel | null;
  topAsk: TopLevel | null;
  stats24h: MarketStats | null;
  notionalPreview: string | null;
  ticketQuoteBreakdown: TicketQuoteBreakdown | null;
  insufficientFundsText: string;
  hasSufficientFunds: boolean | null;
  postOnly: boolean;
  setPostOnly: (next: boolean) => void;
  postOnlyBlocked: boolean;
  side: "buy" | "sell";
  setSide: (next: "buy" | "sell") => void;
  price: string;
  setPrice: (next: string) => void;
  quantity: string;
  setQuantity: (next: string) => void;
  normalizedPrice: string;
  normalizedQty: string;
  priceStepWarning: boolean;
  qtyStepWarning: boolean;
  baseBalance: BalanceRow | null;
  quoteBalance: BalanceRow | null;
  maxSellQty: string;
  maxQtyForTicket: string;
  setQtyFromMaxPct: (pct: number) => void;
  takerFeeBps: number;
  reserveFeeBps: number;
  loading: boolean;
  replaceLoading: boolean;
  cancelAllLoading: boolean;
  authMode: "session" | "header";
  canUseHeader: boolean;
  requestHeaders: Record<string, string> | undefined;
  refresh: (opts?: { silent?: boolean; updateMarketdataTimestamp?: boolean }) => Promise<void>;
  setLoading: (next: boolean) => void;
  setReplaceLoading: (next: boolean) => void;
  setError: (err: ClientApiError | null) => void;
  setToastKind: (kind: ToastKind) => void;
  setToastMessage: (msg: string | null) => void;
  loadedOrder: Order | null;
  setLoadedOrderId: (next: string | null) => void;

  formatDecimal: (value: string, digits: number) => string;
  quantizeDownToStep3818: (value: string, step: string) => string;
  multiplyStep3818: (step: string, multiplier: number) => string;
  getSpreadDisplay: (bid: TopLevel | null, ask: TopLevel | null) => SpreadDisplay | null;
}) {
  const {
    market,
    marketId,
    orderType,
    setOrderType,
    priceDigits,
    qtyDigits,
    priceStep,
    qtyStep,
    topBid,
    topAsk,
    stats24h,
    notionalPreview,
    ticketQuoteBreakdown,
    insufficientFundsText,
    hasSufficientFunds,
    postOnly,
    setPostOnly,
    postOnlyBlocked,
    side,
    setSide,
    price,
    setPrice,
    quantity,
    setQuantity,
    normalizedPrice,
    normalizedQty,
    priceStepWarning,
    qtyStepWarning,
    baseBalance,
    quoteBalance,
    maxSellQty,
    maxQtyForTicket,
    setQtyFromMaxPct,
    takerFeeBps,
    loading,
    replaceLoading,
    cancelAllLoading,
    authMode,
    canUseHeader,
    requestHeaders,
    refresh,
    setLoading,
    setError,
    setToastKind,
    setToastMessage,
    loadedOrder,
    setLoadedOrderId,
    setReplaceLoading,
    formatDecimal,
    quantizeDownToStep3818,
    multiplyStep3818,
    getSpreadDisplay,
  } = props;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Place {orderType} order</h3>
        <div className="flex rounded-lg border border-[var(--border)] text-[11px]">
          {(["limit", "market"] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`px-3 py-1 capitalize transition-colors ${
                orderType === t
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              } ${t === "limit" ? "rounded-l-md" : "rounded-r-md"}`}
              onClick={() => setOrderType(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--muted)]">
          <div>
            Tick: <span className="font-mono">{market?.tick_size ?? "—"}</span> · Lot: {" "}
            <span className="font-mono">{market?.lot_size ?? "—"}</span>
          </div>
          <div>
            Notional:{" "}
            <span className="font-mono">{notionalPreview ?? "—"}</span>
            {quoteBalance?.symbol ? <span className="ml-1">{quoteBalance.symbol}</span> : null}
          </div>
        </div>

        {ticketQuoteBreakdown ? (
          <div className="grid gap-1 text-[11px] text-[var(--muted)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                {side === "buy" ? "Gross cost" : "Gross proceeds"}: {" "}
                <span className="font-mono">{formatDecimal(ticketQuoteBreakdown.gross, 6)}</span>
                <span className="ml-1">{ticketQuoteBreakdown.quoteSym}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span>
                  <span title="Expected fee bps assumes maker unless your limit price crosses the top of book (then taker).">Expected:</span>{" "}
                  <span className="font-mono">{ticketQuoteBreakdown.feeBpsExpected ?? "—"}</span>
                  {ticketQuoteBreakdown.liquidityHint ? (
                    <>
                      {" "}
                      <span
                        className={
                          ticketQuoteBreakdown.liquidityHint === "taker"
                            ? "text-amber-700 dark:text-amber-400"
                            : "text-[color-mix(in_srgb,var(--foreground)_85%,var(--muted))]"
                        }
                      >
                        ({ticketQuoteBreakdown.liquidityHint})
                      </span>
                    </>
                  ) : null}
                </span>
                <span>
                  <span title="Max fee bps is used for holds/reserves so the order is safe whether it becomes maker or taker.">Max:</span>{" "}
                  <span className="font-mono">{ticketQuoteBreakdown.feeBpsMax}</span>
                </span>
              </div>
            </div>

            {ticketQuoteBreakdown.expectedThresholdText ? (
              <div className="text-[11px] text-[var(--muted)]" title="Uses best bid/ask from live marketdata.">
                {ticketQuoteBreakdown.expectedThresholdText}
              </div>
            ) : null}

            {ticketQuoteBreakdown.effFeePctExpected && ticketQuoteBreakdown.effFeePctMax ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  Eff fee %: <span className="font-mono">{formatDecimal(ticketQuoteBreakdown.effFeePctExpected, 4)}%</span>
                  {ticketQuoteBreakdown.feeBpsExpected !== ticketQuoteBreakdown.feeBpsMax ? (
                    <>
                      {" "}· max <span className="font-mono">{formatDecimal(ticketQuoteBreakdown.effFeePctMax, 4)}%</span>
                    </>
                  ) : null}
                </div>
                <div>
                  Eff px:{" "}
                  <span className="font-mono">{formatDecimal(ticketQuoteBreakdown.effPriceExpected ?? "0", priceDigits)}</span>
                  <span className="ml-1">{ticketQuoteBreakdown.quoteSym}/{ticketQuoteBreakdown.baseSym}</span>
                  {ticketQuoteBreakdown.feeBpsExpected !== ticketQuoteBreakdown.feeBpsMax ? (
                    <>
                      {side === "buy" ? " · max " : " · min "}
                      <span className="font-mono">{formatDecimal(ticketQuoteBreakdown.effPriceMax ?? "0", priceDigits)}</span>
                      <span className="ml-1">{ticketQuoteBreakdown.quoteSym}/{ticketQuoteBreakdown.baseSym}</span>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}

            {ticketQuoteBreakdown.vsMarkExpected ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] text-[var(--muted)]" title="Mark is mid (best bid/ask).">
                  Mark: <span className="font-mono">{formatDecimal(ticketQuoteBreakdown.markStr ?? "—", priceDigits)}</span>
                </div>
                <div
                  className={`text-[11px] ${ticketQuoteBreakdown.vsMarkExpected.className}`}
                  title="Effective price vs mark (mid), in bps."
                >
                  vs mark: <span className="font-mono">{ticketQuoteBreakdown.vsMarkExpected.text}</span>
                  {ticketQuoteBreakdown.vsMarkMax && ticketQuoteBreakdown.feeBpsExpected !== ticketQuoteBreakdown.feeBpsMax ? (
                    <>
                      {side === "buy" ? " · max " : " · min "}
                      <span className="font-mono">{ticketQuoteBreakdown.vsMarkMax.text}</span>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                Fee:{" "}
                <span className="font-mono">{formatDecimal(ticketQuoteBreakdown.feeExpected, 6)}</span>
                <span className="ml-1">{ticketQuoteBreakdown.quoteSym}</span>
                {ticketQuoteBreakdown.feeBpsExpected !== ticketQuoteBreakdown.feeBpsMax ? (
                  <>
                    {" "}· max <span className="font-mono">{formatDecimal(ticketQuoteBreakdown.feeMax, 6)}</span>
                    <span className="ml-1">{ticketQuoteBreakdown.quoteSym}</span>
                  </>
                ) : null}
              </div>
              <div>
                {side === "buy" ? "Total" : "Net"}: {" "}
                <span className="font-mono">{formatDecimal(ticketQuoteBreakdown.totalExpected, 6)}</span>
                <span className="ml-1">{ticketQuoteBreakdown.quoteSym}</span>
                {ticketQuoteBreakdown.feeBpsExpected !== ticketQuoteBreakdown.feeBpsMax ? (
                  <>
                    {side === "buy" ? " · max " : " · min "}
                    <span className="font-mono">{formatDecimal(ticketQuoteBreakdown.totalMax, 6)}</span>
                    <span className="ml-1">{ticketQuoteBreakdown.quoteSym}</span>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {insufficientFundsText ? <div className="text-[11px] text-rose-600 dark:text-rose-400">{insufficientFundsText}</div> : null}

        {ticketQuoteBreakdown?.liquidityHint === "taker" ? (
          <div
            className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200"
            title="Your limit price crosses the top of book, so it will likely match immediately as a taker."
          >
            Marketable limit: expected taker fill
            {ticketQuoteBreakdown.expectedThresholdText ? ` (${ticketQuoteBreakdown.expectedThresholdText})` : ""}
          </div>
        ) : null}

        {orderType === "limit" ? (
        <label className="mt-1 flex w-fit select-none items-center gap-2 text-[11px] text-[var(--muted)]">
          <input
            type="checkbox"
            className="h-3 w-3 rounded border-[var(--border)] bg-transparent"
            checked={postOnly}
            onChange={(e) => setPostOnly(e.target.checked)}
          />
          <span className="font-medium text-[color-mix(in_srgb,var(--foreground)_85%,var(--muted))]">Post-only (maker only)</span>
          <span className="text-[var(--muted)]">
            {postOnly
              ? ticketQuoteBreakdown?.canInferLiquidity
                ? postOnlyBlocked
                  ? "blocked: would take"
                  : "ok: expected maker"
                : "waiting for top-of-book"
              : ""}
          </span>
        </label>
        ) : null}

        {orderType === "limit" && postOnlyBlocked ? (
          <div
            className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200"
            title="Post-only blocks marketable limits so they don't execute immediately as taker."
          >
            Post-only is enabled, but this limit is marketable (expected taker). Adjust your price away from the top of book.
          </div>
        ) : null}

        <div className={`grid gap-2 ${orderType === "market" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-3"}`}>
          <label className="grid gap-1">
            <span className="text-[11px] text-[var(--muted)]">Side</span>
            <select
              className="rounded border border-[var(--border)] bg-transparent px-2 py-2 text-xs"
              value={side}
              onChange={(e) => setSide(e.target.value as "buy" | "sell")}
            >
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>
          </label>

          {orderType === "limit" ? (
          <label className="grid gap-1">
            <span className="text-[11px] text-[var(--muted)]">Price</span>
            <input
              className="rounded border border-[var(--border)] bg-transparent px-2 py-2 font-mono text-xs"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onBlur={() => {
                try {
                  if (!priceStep) return;
                  const v = price.trim();
                  if (!v) return;
                  if (isMultipleOfStep3818(v, priceStep)) return;
                  const q = quantizeDownToStep3818(v, priceStep);
                  setPrice(formatDecimal(q, priceDigits));
                } catch {
                  // leave as-is
                }
              }}
              inputMode="decimal"
            />
            {priceStepWarning ? (
              <span className="text-[11px] text-amber-600 dark:text-amber-400" title="Will be rounded down to tick size.">
                Not on tick; rounding down
              </span>
            ) : null}
          </label>
          ) : null}

          <label className="grid gap-1">
            <span className="text-[11px] text-[var(--muted)]">Qty</span>
            <input
              className="rounded border border-[var(--border)] bg-transparent px-2 py-2 font-mono text-xs"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              onBlur={() => {
                try {
                  if (!qtyStep) return;
                  const v = quantity.trim();
                  if (!v) return;
                  if (isMultipleOfStep3818(v, qtyStep)) return;
                  const q = quantizeDownToStep3818(v, qtyStep);
                  setQuantity(formatDecimal(q, qtyDigits));
                } catch {
                  // leave as-is
                }
              }}
              inputMode="decimal"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--muted)]">
              <span>
                {market ? (
                  side === "sell" ? (
                    <>
                      Avail: <span className="font-mono">{baseBalance?.available ?? "—"}</span>
                    </>
                  ) : (
                    <>
                      Avail: <span className="font-mono">{quoteBalance?.available ?? "—"}</span>
                    </>
                  )
                ) : (
                  ""
                )}
              </span>
              <span>
                {market ? (
                  side === "sell" ? (
                    <>
                      Max: <span className="font-mono">{maxSellQty || "—"}</span>
                    </>
                  ) : (
                    <>
                      Max: <span className="font-mono">{maxQtyForTicket || "—"}</span>
                    </>
                  )
                ) : (
                  ""
                )}
              </span>
            </div>
            {qtyStepWarning ? (
              <span className="text-[11px] text-amber-600 dark:text-amber-400" title="Will be rounded down to lot size.">
                Not on lot; rounding down
              </span>
            ) : null}
          </label>
        </div>

        {orderType === "limit" ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-[11px] text-[var(--muted)]">Quick price</div>
          {(
            [
              { label: "Bid", get: () => topBid?.price ?? null },
              { label: "Ask", get: () => topAsk?.price ?? null },
              { label: "Mid", get: () => getSpreadDisplay(topBid, topAsk)?.mid ?? null },
              { label: "Last", get: () => stats24h?.last ?? null },
              { label: "VWAP", get: () => stats24h?.vwap ?? null },
            ] as const
          ).map((b) => (
            <button
              key={b.label}
              type="button"
              className="rounded border border-[var(--border)] px-3 py-2 text-[11px] text-[color-mix(in_srgb,var(--foreground)_85%,var(--muted))] hover:bg-[color-mix(in_srgb,var(--card)_96%,transparent)] disabled:opacity-60"
              disabled={!marketId}
              onClick={() => {
                try {
                  const v = b.get();
                  if (!v) return;
                  if (!priceStep) {
                    setPrice(formatDecimal(v, priceDigits));
                    return;
                  }
                  const q = quantizeDownToStep3818(v, priceStep);
                  setPrice(formatDecimal(q, priceDigits));
                } catch {
                  // ignore
                }
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
        ) : null}

        {orderType === "market" ? (
          <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            Market order: fills immediately at best available price (IOC). Unfilled remainder is canceled.
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <div className="text-[11px] text-[var(--muted)]">Quick qty</div>
          {[25, 50, 75].map((pct) => (
            <button
              key={pct}
              type="button"
              className="rounded border border-[var(--border)] px-3 py-2 text-[11px] text-[color-mix(in_srgb,var(--foreground)_85%,var(--muted))] hover:bg-[color-mix(in_srgb,var(--card)_96%,transparent)] disabled:opacity-60"
              disabled={!marketId || !qtyStep || !maxQtyForTicket}
              title={side === "buy" ? "Percent of fee-aware max size." : "Percent of available base."}
              onClick={() => setQtyFromMaxPct(pct)}
            >
              {pct}%
            </button>
          ))}
          <button
            type="button"
            className="rounded border border-[var(--border)] px-3 py-2 text-[11px] text-[color-mix(in_srgb,var(--foreground)_85%,var(--muted))] hover:bg-[color-mix(in_srgb,var(--card)_96%,transparent)] disabled:opacity-60"
            disabled={!marketId || !qtyStep}
            onClick={() => {
              try {
                if (!qtyStep) return;
                setQuantity(formatDecimal(qtyStep, qtyDigits));
              } catch {
                // ignore
              }
            }}
          >
            1×lot
          </button>
          <button
            type="button"
            className="rounded border border-[var(--border)] px-3 py-2 text-[11px] text-[color-mix(in_srgb,var(--foreground)_85%,var(--muted))] hover:bg-[color-mix(in_srgb,var(--card)_96%,transparent)] disabled:opacity-60"
            disabled={!marketId || !qtyStep}
            onClick={() => {
              try {
                if (!qtyStep) return;
                const step10 = multiplyStep3818(qtyStep, 10);
                setQuantity(formatDecimal(step10, qtyDigits));
              } catch {
                // ignore
              }
            }}
          >
            10×lot
          </button>
          <button
            type="button"
            className="rounded border border-[var(--border)] px-3 py-2 text-[11px] text-[color-mix(in_srgb,var(--foreground)_85%,var(--muted))] hover:bg-[color-mix(in_srgb,var(--card)_96%,transparent)] disabled:opacity-60"
            disabled={!marketId || !qtyStep || !maxQtyForTicket}
            title={side === "buy" ? "Max size uses available quote and est. taker fee." : "Max size uses available base."}
            onClick={() => {
              try {
                if (!marketId || !qtyStep) return;

                if (side === "buy") {
                  let p = normalizedPrice;
                  if (!p) {
                    const candidate = topAsk?.price ?? stats24h?.last ?? null;
                    if (candidate) {
                      if (priceStep) {
                        const q = quantizeDownToStep3818(candidate, priceStep);
                        const formatted = formatDecimal(q, priceDigits);
                        setPrice(formatted);
                        p = formatted;
                      } else {
                        const formatted = formatDecimal(candidate, priceDigits);
                        setPrice(formatted);
                        p = formatted;
                      }
                    }
                  }

                  const availQuote = quoteBalance?.available;
                  if (!availQuote || !p) return;
                  const stepBi = toBigInt3818(qtyStep);
                  if (stepBi <= 0n) return;

                  const priceBi = toBigInt3818(p);
                  if (priceBi <= 0n) return;

                  const availBi = toBigInt3818(availQuote);
                  if (availBi <= 0n) return;

                  const feeFactorBi = SCALE_1E18 + (BigInt(Math.max(0, takerFeeBps)) * SCALE_1E18) / 10_000n;
                  const denomProd = priceBi * feeFactorBi;
                  const denomBi = denomProd / SCALE_1E18 + (denomProd % SCALE_1E18 === 0n ? 0n : 1n);
                  if (denomBi <= 0n) return;

                  const qtyBi = (availBi * SCALE_1E18) / denomBi;
                  const qBi = (qtyBi / stepBi) * stepBi;
                  if (qBi <= 0n) return;
                  setQuantity(formatDecimal(fromBigInt3818(qBi), qtyDigits));
                  return;
                }

                if (!maxQtyForTicket) return;
                setQuantity(maxQtyForTicket);
              } catch {
                // ignore
              }
            }}
          >
            Max
          </button>
        </div>

        <button
          type="button"
          className="mt-1 w-fit rounded-lg bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] px-3 py-2 text-xs font-semibold text-white shadow-[var(--shadow)] disabled:opacity-60"
          disabled={
            loading ||
            replaceLoading ||
            !marketId ||
            (orderType === "limit" && !price.trim()) ||
            (orderType === "limit" && !(parseFloat(price) > 0)) ||
            !quantity.trim() ||
            !(parseFloat(quantity) > 0) ||
            (orderType === "limit" && postOnlyBlocked) ||
            hasSufficientFunds === false ||
            (authMode === "header" && !canUseHeader)
          }
          onClick={async () => {
            setLoading(true);
            setError(null);
            try {
              if (postOnlyBlocked) {
                setToastKind("error");
                setToastMessage("Post-only is enabled: adjust price to avoid taking.");
                return;
              }

              const priceSend = normalizedPrice || price;
              let qtySend = normalizedQty || quantity;

              // Best-effort cap to available/max at submit time.
              try {
                const cap = side === "sell" ? maxSellQty : maxQtyForTicket;
                if (cap) {
                  const qBi = toBigInt3818(qtySend);
                  const capBi = toBigInt3818(cap);
                  if (qBi > capBi) {
                    qtySend = cap;
                    setToastKind("info");
                    setToastMessage("Qty capped to max available.");
                  }
                }
              } catch {
                // ignore
              }

              if (priceSend !== price) setPrice(priceSend);
              if (qtySend !== quantity) setQuantity(qtySend);

              const orderPayload = orderType === "market"
                ? { market_id: marketId, side, type: "market" as const, quantity: qtySend }
                : { market_id: marketId, side, type: "limit" as const, price: priceSend, quantity: qtySend };

              await fetchJsonOrThrow("/api/exchange/orders", {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  ...(requestHeaders ?? {}),
                },
                body: JSON.stringify(orderPayload),
              });
              setToastKind("success");
              setToastMessage("Order placed.");
              await refresh();
            } catch (e) {
              if (e instanceof ApiError) setError({ code: e.code, details: e.details });
              else setError({ code: e instanceof Error ? e.message : String(e) });
            } finally {
              setLoading(false);
            }
          }}
        >
          Place order
        </button>

        {loadedOrder && loadedOrder.market_id === marketId ? (
          <div className="mt-1 grid gap-2 rounded border border-[var(--border)] px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] text-[var(--muted)]">Loaded order</div>
              <div className="font-mono text-[11px] text-[var(--muted)]">{loadedOrder.id}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[color-mix(in_srgb,var(--foreground)_85%,var(--muted))] hover:bg-[color-mix(in_srgb,var(--card)_96%,transparent)] disabled:opacity-60"
                onClick={() => setLoadedOrderId(null)}
              >
                Clear
              </button>

              <button
                type="button"
                className="rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[color-mix(in_srgb,var(--foreground)_85%,var(--muted))] hover:bg-[color-mix(in_srgb,var(--card)_96%,transparent)] disabled:opacity-60"
                disabled={
                  replaceLoading ||
                  loading ||
                  cancelAllLoading ||
                  (authMode === "header" && !canUseHeader) ||
                  hasSufficientFunds === false ||
                  postOnlyBlocked ||
                  !marketId ||
                  !price.trim() ||
                  !quantity.trim() ||
                  !(loadedOrder.status === "open" || loadedOrder.status === "partially_filled")
                }
                title="Cancel the loaded open order, then place a new order using the current ticket values."
                onClick={async () => {
                  if (!marketId) return;
                  setReplaceLoading(true);
                  setError(null);
                  try {
                    if (postOnlyBlocked) {
                      setToastKind("error");
                      setToastMessage("Post-only is enabled: adjust price to avoid taking.");
                      return;
                    }

                    const priceSend = normalizedPrice || price;
                    let qtySend = normalizedQty || quantity;

                    // Best-effort cap to available/max at submit time.
                    try {
                      const cap = side === "sell" ? maxSellQty : maxQtyForTicket;
                      if (cap) {
                        const qBi = toBigInt3818(qtySend);
                        const capBi = toBigInt3818(cap);
                        if (qBi > capBi) {
                          qtySend = cap;
                          setToastKind("info");
                          setToastMessage("Qty capped to max available.");
                        }
                      }
                    } catch {
                      // ignore
                    }

                    if (priceSend !== price) setPrice(priceSend);
                    if (qtySend !== quantity) setQuantity(qtySend);

                    await fetchJsonOrThrow(`/api/exchange/orders/${loadedOrder.id}/cancel`, {
                      method: "POST",
                      headers: requestHeaders,
                    });

                    await fetchJsonOrThrow("/api/exchange/orders", {
                      method: "POST",
                      headers: {
                        "content-type": "application/json",
                        ...(requestHeaders ?? {}),
                      },
                      body: JSON.stringify({ market_id: marketId, side, type: "limit", price: priceSend, quantity: qtySend }),
                    });

                    setToastKind("success");
                    setToastMessage("Order replaced.");
                    setLoadedOrderId(null);
                    await refresh();
                  } catch (e) {
                    if (e instanceof ApiError) setError({ code: e.code, details: e.details });
                    else setError({ code: e instanceof Error ? e.message : String(e) });
                  } finally {
                    setReplaceLoading(false);
                  }
                }}
              >
                {replaceLoading ? "Replacing…" : "Cancel & replace"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
