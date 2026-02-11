"use client";

import { useState } from "react";

type FundingSignal = {
  id: string;
  kind: string;
  payload_json: {
    exchange: string;
    symbol: string;
    fundingRate: number;
    aprPct: number;
    volume24h?: number;
  };
};

export function BotExecutionModal({
  signal,
  onClose,
}: {
  signal: FundingSignal;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState<string>("100");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success?: boolean; message?: string; error?: string } | null>(null);

  const profitEst = (Number(amount) * (signal.payload_json.aprPct / 100)) / 365;

  const handleExecute = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/trading/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signalId: signal.id,
          amount: Number(amount),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ success: true, message: data.message });
      } else {
        setResult({ error: data.message || "Failed to start bot" });
      }
    } catch (e) {
      setResult({ error: String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl animate-in zoom-in-95">
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--card-2)] p-4">
          <h3 className="font-semibold">Setup Cash & Curry Bot</h3>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--foreground)]">
            ✕
          </button>
        </div>

        <div className="p-6">
          <div className="mb-6 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-xl font-bold text-[var(--accent)]">
               {signal.payload_json.symbol.split('/')[0]}
            </div>
            <div>
              <div className="text-sm text-[var(--muted)]">{signal.payload_json.exchange}</div>
              <div className="text-xl font-bold">{signal.payload_json.symbol}</div>
            </div>
            <div className="ml-auto text-right">
                <div className="text-sm text-[var(--muted)]">Annual Yield</div>
                <div className="text-lg font-bold text-[var(--up)]">{signal.payload_json.aprPct.toFixed(2)}%</div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Investment Amount (USDT)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-lg font-bold"
                min="10"
              />
            </div>

            <div className="rounded-lg bg-[var(--bg)] p-3 text-xs space-y-2">
               <div className="flex justify-between">
                  <span className="text-[var(--muted)]">Spot Buy</span>
                  <span className="font-mono">${(Number(amount)/2).toFixed(2)}</span>
               </div>
               <div className="flex justify-between">
                  <span className="text-[var(--muted)]">Perp Short (1x)</span>
                  <span className="font-mono">${(Number(amount)/2).toFixed(2)}</span>
               </div>
               <div className="mt-2 border-t border-[var(--border)] pt-2 flex justify-between font-bold">
                  <span className="text-[var(--up)]">Est. Daily Profit</span>
                  <span className="font-mono text-[var(--up)]">+${profitEst.toFixed(4)}</span>
               </div>
            </div>
          </div>

          {result?.error && (
             <div className="mt-4 rounded-lg bg-[var(--down-bg)] p-3 text-sm text-[var(--down)]">
               {result.error}
               {result.error.includes("connect") && (
                   <a href="/connections" className="ml-2 underline font-bold">Connect Now</a>
               )}
             </div>
          )}
          
          {result?.success && (
             <div className="mt-4 rounded-lg bg-[var(--up-bg)] p-3 text-sm text-[var(--up)]">
                {result.message}
             </div>
          )}

          <div className="mt-6 flex gap-3">
             <button onClick={onClose} className="flex-1 rounded-lg border border-[var(--border)] py-2.5 text-sm font-medium hover:bg-[var(--card-2)]">
               Cancel
             </button>
             <button 
               onClick={handleExecute} 
               disabled={loading || !!result?.success}
               className="flex-1 rounded-lg bg-[var(--accent)] py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
             >
               {loading ? "Allocating..." : "Start Bot"}
             </button>
          </div>
        </div>
      </div>
    </div>
  );
}
