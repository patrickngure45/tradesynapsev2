"use client";

import { useState } from "react";
import { analyzeTokenAction } from "@/app/actions/ai-analysis";

// Re-using types from parent or redefining them if simple
type ArbOpp = {
  symbol: string;
  buyExchange: string;
  sellExchange: string;
  buyAsk: number;
  sellBid: number;
  spreadPct: number;
  potentialProfit: number;
  netSpreadPct: number;
  netProfit: number;
  netSpreadDepthPct?: number | null;
  notionalUsd?: number;
  execNotionalUsd?: number;
  grossProfitUsd?: number;
  netProfitUsd?: number;
  grossProfitExecUsd?: number;
  netProfitExecUsd?: number;
  readiness?: {
    state: "discoverable" | "action_required" | "executable";
    canExecute: boolean;
    reasons: string[];
  };
  fee?: {
    buyTaker?: number;
    sellTaker?: number;
    feePct?: number;
    sourceBuy?: string;
    sourceSell?: string;
  } | null;
  depth?: {
    buyVwap?: number;
    sellVwap?: number;
    buySlippageBps?: number;
    sellSlippageBps?: number;
  } | null;
  execution?: {
    status: "ready" | "missing" | "unknown";
    blockers: string[];
    required?: { usdtBuy: number; baseSell: number; base: string };
    max?: { notionalUsd: number; baseSell: number; limitedBy: string[] };
  } | null;
  ts: string;
};

const EXCHANGE_META: Record<string, { label: string; color: string }> = {
  binance: { label: "Binance", color: "#f0b90b" },
  bybit: { label: "Bybit", color: "#f7a600" },
  okx: { label: "OKX", color: "#fff" },
  kucoin: { label: "KuCoin", color: "var(--accent)" },
  gateio: { label: "Gate.io", color: "var(--accent-2)" },
  bitget: { label: "Bitget", color: "var(--warn)" },
  mexc: { label: "MEXC", color: "var(--accent)" },
  tradesynapse: { label: "TradeSynapse", color: "var(--accent)" },
};

function exchangeLabel(ex: string) {
  return EXCHANGE_META[ex]?.label ?? ex;
}

function exchangeColor(ex: string) {
  return EXCHANGE_META[ex]?.color ?? "var(--muted)";
}

function spreadTier(pct: number): { label: string; class: string } {
  if (pct >= 1.0) return { label: "HOT", class: "bg-[var(--up)]/20 text-[var(--up)]" };
  if (pct >= 0.5) return { label: "WARM", class: "bg-yellow-500/20 text-yellow-400" };
  if (pct > 0) return { label: "COOL", class: "bg-blue-500/20 text-blue-400" };
  return { label: "WATCH", class: "bg-[var(--muted)]/20 text-[var(--muted)]" };
}

function readinessReasonLabel(reason: string) {
  const map: Record<string, string> = {
    connect_exchange_api: "Connect exchange API",
    execution_data_unavailable: "Execution data unavailable",
    buy_balance_unavailable: "Buy balance unavailable",
    sell_balance_unavailable: "Sell balance unavailable",
    insufficient_usdt_on_buy: "Insufficient buy-side USDT",
    insufficient_base_on_sell: "Insufficient sell-side asset",
    min_amount_buy: "Below buy min amount",
    min_amount_sell: "Below sell min amount",
    min_notional_buy: "Below buy min notional",
    min_notional_sell: "Below sell min notional",
    execution_window_closed: "Window closed (try again soon)",
  };
  return map[reason] ?? reason.replaceAll("_", " ");
}

export function ArbitrageOpportunityRow({ opp, connectedExchanges, onConnectAction }: { opp: ArbOpp, connectedExchanges: string[], onConnectAction: () => void }) {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executeBanner, setExecuteBanner] = useState<
    | null
    | {
        tone: "success" | "error";
        title: string;
        detail?: string;
      }
  >(null);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [connectTarget, setConnectTarget] = useState<string>("");
  
  // Connect Form
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectBanner, setConnectBanner] = useState<null | { title: string; detail?: string }>(null);

  const tier = spreadTier(opp.spreadPct);

  const notionalLabel = (() => {
    const n = opp.notionalUsd;
    if (!n || !Number.isFinite(n) || n <= 0) return null;
    if (n >= 1000) return "$1000";
    if (n >= 100) return `$${Math.round(n)}`;
    return `$${n.toFixed(0)}`;
  })();

  const exec = opp.execution;
  const readiness = opp.readiness;
  const readinessBadge = (() => {
    if (!readiness) return { label: "DISCOVERABLE", className: "bg-[var(--border)] text-[var(--muted)]" };
    if (readiness.state === "executable") return { label: "EXECUTABLE", className: "bg-[var(--up)]/15 text-[var(--up)]" };
    if (readiness.state === "action_required") return { label: "ACTION REQUIRED", className: "bg-yellow-500/15 text-yellow-300" };
    return { label: "DISCOVERABLE", className: "bg-[var(--border)] text-[var(--muted)]" };
  })();
  const execBadge = (() => {
    if (!exec) return null;
    if (exec.status === "ready") return { label: "READY", className: "bg-[var(--up)]/15 text-[var(--up)]" };
    if (exec.status === "missing") return { label: "MISSING FUNDS", className: "bg-red-500/15 text-red-400" };
    return { label: "UNKNOWN", className: "bg-[var(--border)] text-[var(--muted)]" };
  })();
  const displayNetUsd = (() => {
    if (typeof opp.netProfitExecUsd === "number" && Number.isFinite(opp.netProfitExecUsd)) return opp.netProfitExecUsd;
    return opp.netProfitUsd ?? 0;
  })();

  const displayNetSpreadPct = (() => {
    if (typeof opp.netSpreadDepthPct === "number" && Number.isFinite(opp.netSpreadDepthPct)) return opp.netSpreadDepthPct;
    return opp.netSpreadPct ?? 0;
  })();

  const feePct = opp.fee?.feePct;
  const buySlip = opp.depth?.buySlippageBps;
  const sellSlip = opp.depth?.sellSlippageBps;
  const hasDepthOrFees =
    (typeof feePct === "number" && Number.isFinite(feePct)) ||
    (typeof buySlip === "number" && Number.isFinite(buySlip)) ||
    (typeof sellSlip === "number" && Number.isFinite(sellSlip));

  const canConnectToEnable = Boolean(readiness?.reasons?.includes("connect_exchange_api"));
  const canExecute = Boolean(readiness?.canExecute);
  const executeDisabled = executing || displayNetUsd <= 0 || (!canExecute && !canConnectToEnable);

  const handleAnalyze = async () => {
    if (analyzing || analysis) return;
    setAnalyzing(true);
    try {
      const result = await analyzeTokenAction(opp.symbol);
      setAnalysis(result);
    } catch {
      setAnalysis("Analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  };

  const executeTradeLogic = async () => {
     setExecuting(true);
     setExecuteBanner(null);
     try {
       const res = await fetch("/api/exchange/arbitrage/execute", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ opp })
       });

       const data = await res.json().catch(() => ({} as any));

       if (!res.ok) {
         const code = String((data as any)?.error ?? "execution_failed");
         const message = String((data as any)?.message ?? (data as any)?.error ?? "Execution failed");

         const detail = (() => {
           if (code === "min_notional_not_met") {
             const d = (data as any)?.detail;
             const bn = typeof d?.buyNotionalUsd === "number" ? d.buyNotionalUsd : null;
             const sn = typeof d?.sellNotionalUsd === "number" ? d.sellNotionalUsd : null;
             const bmin = typeof d?.costMinBuy === "number" ? d.costMinBuy : null;
             const smin = typeof d?.costMinSell === "number" ? d.costMinSell : null;
             if (bn != null || sn != null || bmin != null || smin != null) {
               return `buy $${(bn ?? 0).toFixed(2)} (min $${(bmin ?? 0).toFixed(2)}) · sell $${(sn ?? 0).toFixed(2)} (min $${(smin ?? 0).toFixed(2)})`;
             }
             return undefined;
           }
           if (code === "min_qty_not_met") {
             const c = (data as any)?.constraints;
             const minBuy = typeof c?.buy?.amountMin === "number" ? c.buy.amountMin : null;
             const minSell = typeof c?.sell?.amountMin === "number" ? c.sell.amountMin : null;
             if (minBuy != null || minSell != null) {
               return `min qty buy ${minBuy ?? "—"} · sell ${minSell ?? "—"}`;
             }
             return undefined;
           }
           if (code === "insufficient_balances") {
             const b = (data as any)?.balances;
             const usdt = typeof b?.buy?.usdtFree === "number" ? b.buy.usdtFree : null;
             const base = typeof b?.sell?.base === "string" ? b.sell.base : null;
             const baseFree = typeof b?.sell?.baseFree === "number" ? b.sell.baseFree : null;
             if (usdt != null || (base && baseFree != null)) {
               return `buy USDT free ${usdt != null ? usdt.toFixed(2) : "—"} · sell ${base ?? "BASE"} free ${baseFree != null ? baseFree.toFixed(6) : "—"}`;
             }
             return undefined;
           }
           if (code === "not_profitable") {
             const q = (data as any)?.quote;
             const net = typeof q?.netSpreadPct === "number" ? q.netSpreadPct : null;
             const gross = typeof q?.grossSpreadPct === "number" ? q.grossSpreadPct : null;
             if (net != null || gross != null) {
               return `net ${(net ?? 0).toFixed(3)}% · gross ${(gross ?? 0).toFixed(3)}%`;
             }
             return undefined;
           }
           return undefined;
         })();

         setExecuteBanner({ tone: "error", title: message, detail });
         return;
       }

       const buyInfo = (data as any)?.data?.buy ? `${(data as any).data.buy.exchange} (${(data as any).data.buy.status})` : "Skipped";
       const sellInfo = (data as any)?.data?.sell ? `${(data as any).data.sell.exchange} (${(data as any).data.sell.status})` : "Skipped";

       setExecuteBanner({
         tone: "success",
         title: "Auto-trade submitted",
         detail: `Bought on: ${buyInfo} · Sold on: ${sellInfo}`,
       });

     } catch (e: any) {
        setExecuteBanner({ tone: "error", title: e?.message || "Execution error" });
     } finally {
        setExecuting(false);
     }
  };

  const handleExecute = () => {
    // Check connections for both sides (ignoring 'tradesynapse' as it's implicit)
    const buyEx = opp.buyExchange.toLowerCase();
    const sellEx = opp.sellExchange.toLowerCase();

    const missingBuy = buyEx !== "tradesynapse" && !connectedExchanges.includes(buyEx);
    const missingSell = sellEx !== "tradesynapse" && !connectedExchanges.includes(sellEx);
    
    if (missingBuy) {
        setConnectTarget(buyEx);
      setConnectBanner(null);
        setShowConnectModal(true);
    } else if (missingSell) {
        setConnectTarget(sellEx);
      setConnectBanner(null);
        setShowConnectModal(true);
    } else {
        executeTradeLogic();
    }
  };

  const connectExchange = async () => {
    if (!connectTarget) return; 

    setConnecting(true);
    setConnectBanner(null);
    try {
        const res = await fetch("/api/exchange/connections", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                exchange: connectTarget,
                label: `Arbitrage ${exchangeLabel(connectTarget)} Key`,
                api_key: apiKey,
                api_secret: apiSecret,
                passphrase: passphrase
            })
        });

        if (res.ok) {
            setShowConnectModal(false);
          onConnectAction(); // refresh parent
            executeTradeLogic();
        } else {
            const data = await res.json().catch(() => ({}));
        const msg = String((data as any)?.message || (data as any)?.error || "Unknown error");
        setConnectBanner({ title: "Failed to save API key", detail: msg });
        }
    } catch (e) {
      setConnectBanner({ title: "Connection error", detail: "Could not reach server." });
    } finally {
        setConnecting(false);
    }
  };

  return (
    <>
    <div className="group flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 transition hover:border-[var(--accent)]/30">
      
      {/* 1. Main Row Info */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Symbol + tier badge */}
        <div className="flex w-24 items-center gap-2">
          <span className="font-mono text-sm font-bold">{opp.symbol}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${tier.class}`}
          >
            {tier.label}
          </span>
        </div>

        {/* Route: Buy → Sell */}
        <div className="flex flex-1 items-center gap-2 text-sm">
          <div className="flex flex-col items-center">
            <span className="text-[9px] uppercase text-[var(--muted)]">Buy</span>
            <span
              className="font-medium"
              style={{ color: exchangeColor(opp.buyExchange) }}
            >
              {exchangeLabel(opp.buyExchange)}
            </span>
            <span className="font-mono text-[10px] text-[var(--muted)]">
              @ {opp.buyAsk.toFixed(4)}
            </span>
          </div>

          <div className="px-2 text-[var(--muted)]">→</div>

          <div className="flex flex-col items-center">
            <span className="text-[9px] uppercase text-[var(--muted)]">Sell</span>
            <span
              className="font-medium"
              style={{ color: exchangeColor(opp.sellExchange) }}
            >
              {exchangeLabel(opp.sellExchange)}
            </span>
            <span className="font-mono text-[10px] text-[var(--muted)]">
              @ {opp.sellBid.toFixed(4)}
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-6">
            <div className="text-right">
                <div className="text-[9px] uppercase text-[var(--muted)]">Net Spread</div>
                <div className={`font-mono text-sm font-bold ${displayNetSpreadPct > 0 ? "text-[var(--up)]" : "text-red-500"}`}>
                {displayNetSpreadPct > 0 ? "+" : ""}{displayNetSpreadPct.toFixed(3)}%
                </div>
                <div className="font-mono text-[10px] text-[var(--muted)]">
                  gross {(opp.spreadPct ?? 0).toFixed(3)}%
                </div>
                {hasDepthOrFees && (
                  <div className="font-mono text-[10px] text-[var(--muted)]">
                    depth {(typeof buySlip === "number" && Number.isFinite(buySlip)) ? `${Math.round(buySlip)}bps` : "—"} / {(typeof sellSlip === "number" && Number.isFinite(sellSlip)) ? `${Math.round(sellSlip)}bps` : "—"} · fees {(typeof feePct === "number" && Number.isFinite(feePct)) ? `${feePct.toFixed(2)}%` : "—"}
                  </div>
                )}
            </div>
            
            <div className="text-right">
                <div className="text-[9px] uppercase text-[var(--muted)]">Net/1k</div>
                <div className={`font-mono text-sm font-medium ${(opp.netProfit ?? 0) > 0 ? "" : "text-[var(--muted)]"}`}>
                ~${(opp.netProfit ?? 0).toFixed(2)}
                </div>
                <div className="font-mono text-[10px] text-[var(--muted)]">
                  gross ~${(opp.potentialProfit ?? 0).toFixed(2)}
                </div>
            </div>

            <div className="text-right">
                <div className="text-[9px] uppercase text-[var(--muted)]">Net {notionalLabel ?? "Your"}</div>
                <div className={`font-mono text-sm font-bold ${displayNetUsd > 0 ? "text-[var(--up)]" : "text-red-500"}`}>
                  {displayNetUsd > 0 ? "+" : ""}${displayNetUsd.toFixed(2)}
                </div>
            </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pl-2 border-l border-[var(--border)]">
            <button
                onClick={handleAnalyze}
                disabled={analyzing}
                className="flex items-center gap-1.5 rounded-lg bg-pink-500/10 px-3 py-1.5 text-xs font-semibold text-pink-500 hover:bg-pink-500/20 disabled:opacity-50"
            >
               {analyzing ? (
                   <span className="animate-spin text-[10px]">↻</span> 
               ) : (
                   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2a10 10 0 1 0 10 10H12V2z"></path></svg>
               )}
               AI Analyze
            </button>

            <button
                onClick={handleExecute}
              disabled={executeDisabled}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50 disabled:grayscale"
              title={
                displayNetUsd <= 0
                  ? "Not profitable after fees"
                  : canConnectToEnable
                    ? "Connect API key to enable trading"
                    : canExecute
                      ? "Execute trade"
                      : "Requirements not yet met"
              }
            >
               {executing ? "..." : displayNetUsd <= 0 ? "Unprofitable" : canConnectToEnable ? "Connect & Trade" : canExecute ? "Auto-Trade" : "Locked"}
            </button>
        </div>
      </div>

      {readiness && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[11px]">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${readinessBadge.className}`}>{readinessBadge.label}</span>
            {readiness.reasons.length > 0 ? (
              <span className="text-[var(--muted)]">
                {readiness.reasons.slice(0, 2).map(readinessReasonLabel).join(" · ")}
              </span>
            ) : (
              <span className="text-[var(--muted)]">Ready for execution checks</span>
            )}
          </div>
        </div>
      )}

      {execBadge && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[11px]">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${execBadge.className}`}>{execBadge.label}</span>
            <span className="text-[var(--muted)]">
              Balance check: {exec?.status === "ready" ? "sufficient" : exec?.status === "missing" ? "insufficient" : "unavailable"}
            </span>
          </div>
          {exec?.max && (
            <div className="font-mono text-[10px] text-[var(--muted)]">
              max ≈ ${exec.max.notionalUsd.toFixed(0)}
            </div>
          )}
          {!exec?.max && exec?.required && (
            <div className="font-mono text-[10px] text-[var(--muted)]">
              need ≈ ${exec.required.usdtBuy.toFixed(0)} USDT (buy) · {exec.required.baseSell.toFixed(6)} {exec.required.base} (sell)
            </div>
          )}
        </div>
      )}

      {executeBanner && (
        <div
          className={
            "flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[11px] " +
            (executeBanner.tone === "success"
              ? "border-[var(--up)]/30 bg-[var(--up)]/10 text-[var(--up)]"
              : "border-red-500/30 bg-red-500/10 text-red-300")
          }
        >
          <div className="min-w-0">
            <div className="font-semibold text-[11px]">{executeBanner.title}</div>
            {executeBanner.detail && (
              <div className="mt-0.5 font-mono text-[10px] opacity-90">{executeBanner.detail}</div>
            )}
          </div>
          <button
            onClick={() => setExecuteBanner(null)}
            className="rounded px-2 py-1 text-[10px] font-semibold hover:bg-black/10"
            aria-label="Dismiss"
            title="Dismiss"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 2. Analysis Result (Expandable) */}
      {analysis && (
          <div className="mt-1 animate-in slide-in-from-top-1 fade-in">
              <div className="flex gap-2 rounded-lg border border-pink-500/20 bg-pink-500/5 p-3 text-xs leading-relaxed text-[var(--foreground)]">
                  <div className="shrink-0 pt-0.5 text-pink-500">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                  </div>
                  <div>
                    <span className="mb-1 block font-bold text-pink-400">AI CONSULTANT</span>
                    {analysis}
                  </div>
              </div>
          </div>
      )}

      {/* 3. Connect Modal (Simple implementation inline for speed) */}
      {showConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
             <div className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl">
                 <h3 className="text-lg font-bold">Connect Exchange</h3>
                 <p className="mt-2 text-sm text-[var(--muted)]">
                    To execute this trade automatically, TradeSynapse needs access to your <b>{exchangeLabel(connectTarget)}</b> account via API.
                    Your keys will be encrypted and saved for future trades.
                 </p>

                 {connectBanner && (
                   <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
                     <div className="font-semibold">{connectBanner.title}</div>
                     {connectBanner.detail && (
                       <div className="mt-0.5 font-mono text-[10px] opacity-90">{connectBanner.detail}</div>
                     )}
                   </div>
                 )}
                 
                 <div className="mt-4 space-y-3">
                     <div>
                         <label className="text-xs font-medium">API Key</label>
                         <input 
                             type="text" 
                             value={apiKey} 
                             onChange={(e) => setApiKey(e.target.value)}
                             className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm" 
                             placeholder="Paste API Key" 
                         />
                     </div>
                     <div>
                         <label className="text-xs font-medium">API Secret</label>
                         <input 
                             type="password" 
                             value={apiSecret}
                             onChange={(e) => setApiSecret(e.target.value)}
                             className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm" 
                             placeholder="Paste API Secret" 
                         />
                     </div>
                     {connectTarget === "okx" && (
                         <div>
                             <label className="text-xs font-medium">Passphrase</label>
                             <input 
                                 type="password" 
                                 value={passphrase}
                                 onChange={(e) => setPassphrase(e.target.value)}
                                 className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm" 
                                 placeholder="Paste Passphrase" 
                             />
                         </div>
                     )}
                 </div>

                 <div className="mt-6 flex justify-end gap-2">
                     <button 
                        onClick={() => setShowConnectModal(false)}
                        className="rounded px-3 py-1.5 text-sm hover:bg-[var(--hover-bg)]"
                     >
                        Cancel
                     </button>
                     <button
                        onClick={connectExchange} 
                        disabled={connecting}
                        className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                     >
                        {connecting ? "Connecting..." : "Save & Trade"}
                     </button>
                 </div>
             </div>
        </div>
      )}

    </div>
    </>
  );
}
