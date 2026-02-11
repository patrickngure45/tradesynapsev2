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
  return { label: "COOL", class: "bg-blue-500/20 text-blue-400" };
}

export function ArbitrageOpportunityRow({ opp, connectedExchanges, onConnectAction }: { opp: ArbOpp, connectedExchanges: string[], onConnectAction: () => void }) {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [connectTarget, setConnectTarget] = useState<string>("");
  
  // Connect Form
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [connecting, setConnecting] = useState(false);

  const tier = spreadTier(opp.spreadPct);

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
     try {
       const res = await fetch("/api/exchange/arbitrage/execute", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ opp })
       });
       
       const data = await res.json();
       
         if (!res.ok) {
           throw new Error(data.error || data.message || "Execution failed");
       }
       
       // Success Message
       const buyInfo = data.data.buy ? `${data.data.buy.exchange} (${data.data.buy.status})` : "Skipped";
       const sellInfo = data.data.sell ? `${data.data.sell.exchange} (${data.data.sell.status})` : "Skipped";
       
       alert(`✅ Trade Executed!\n\nBought on: ${buyInfo}\nSold on: ${sellInfo}\n\nArbitrage complete.`);

     } catch (e: any) {
        alert(`❌ Execution Error: ${e.message}`);
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
        setShowConnectModal(true);
    } else if (missingSell) {
        setConnectTarget(sellEx);
        setShowConnectModal(true);
    } else {
        executeTradeLogic();
    }
  };

  const connectExchange = async () => {
    if (!connectTarget) return; 

    setConnecting(true);
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
            alert(`Failed to save API Key: ${data.message || data.error || "Unknown error"}`);
        }
    } catch (e) {
        alert("Connection error.");
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
                <div className="text-[9px] uppercase text-[var(--muted)]">Spread</div>
                <div className="font-mono text-sm font-bold text-[var(--up)]">
                +{opp.spreadPct.toFixed(2)}%
                </div>
            </div>
            
            <div className="text-right">
                <div className="text-[9px] uppercase text-[var(--muted)]">Profit/1k</div>
                <div className="font-mono text-sm font-medium">
                ~${opp.potentialProfit.toFixed(1)}
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
                className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
            >
               {executing ? "..." : "Auto-Trade"}
            </button>
        </div>
      </div>

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
