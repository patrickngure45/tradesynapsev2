"use client";

import { useEffect, useState } from "react";

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
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [execution, setExecution] = useState<any | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [stopLoading, setStopLoading] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);

  const profitEst = (Number(amount) * (signal.payload_json.aprPct / 100)) / 365;

  const status: string | null = execution?.status ?? null;
  const isTerminal = status === "succeeded" || status === "failed" || status === "canceled";
  const mode: string = String(execution?.params_json?.mode ?? execution?.result_json?.mode ?? "simulation");

  useEffect(() => {
    if (!executionId) return;

    let cancelled = false;
    setPollError(null);

    const poll = async () => {
      try {
        const res = await fetch(`/api/trading/bot/${executionId}`, {
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || data?.message || "Failed to fetch execution");
        }
        if (!cancelled) {
          setExecution(data.execution ?? null);
        }
      } catch (e) {
        if (!cancelled) setPollError(e instanceof Error ? e.message : String(e));
      }
    };

    poll();
    const interval = setInterval(() => {
      // Keep polling until the execution reaches a terminal state.
      if (cancelled) return;
      const s = (execution?.status ?? null) as string | null;
      const terminal = stopRequested ? (s === "failed" || s === "canceled") : (s === "succeeded" || s === "failed" || s === "canceled");
      if (terminal) return;
      void poll();
    }, 1200);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // Intentionally not depending on `execution` to avoid interval thrash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executionId, stopRequested]);

  const handleExecute = async () => {
    setLoading(true);
    setResult(null);
    setExecution(null);
    setExecutionId(null);
    setStopRequested(false);
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
        if (data.executionId) setExecutionId(String(data.executionId));
      } else {
        setResult({ error: data.message || data.error || "Failed to start bot" });
      }
    } catch (e) {
      setResult({ error: String(e) });
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    if (!executionId) return;
    setStopLoading(true);
    setPollError(null);
    try {
      const res = await fetch(`/api/trading/bot/${executionId}/stop`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || data?.message || "Failed to request stop");
      }
      setStopRequested(true);
      // Force a refresh right away.
      const st = await fetch(`/api/trading/bot/${executionId}`, {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const stData = await st.json().catch(() => ({}));
      if (st.ok) setExecution(stData.execution ?? null);
    } catch (e) {
      setPollError(e instanceof Error ? e.message : String(e));
    } finally {
      setStopLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl animate-in zoom-in-95">
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--card-2)] p-4">
          <h3 className="font-semibold">Setup Cash & Carry Bot</h3>
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
               {(result.error.toLowerCase().includes("connect") || result.error.toLowerCase().includes("2") || result.error.toLowerCase().includes("two")) && (
                 <a href="/connections" className="ml-2 underline font-bold">Go to Connections</a>
               )}
             </div>
          )}
          
          {result?.success && (
             <div className="mt-4 rounded-lg bg-[var(--up-bg)] p-3 text-sm text-[var(--up)]">
                {result.message}
             </div>
          )}

          {executionId && (
            <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[var(--muted)]">Execution</div>
                <div className="font-mono text-[10px] text-[var(--muted)]">{executionId}</div>
              </div>

              <div className="mt-2 flex items-center justify-between">
                <div className="text-[var(--muted)]">Mode</div>
                <div className="font-semibold text-[var(--foreground)]">
                  {mode}
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between">
                <div className="text-[var(--muted)]">Status</div>
                <div className={`font-semibold ${status === "failed" ? "text-[var(--down)]" : status === "succeeded" ? "text-[var(--up)]" : "text-[var(--foreground)]"}`}>
                  {status ?? "queued"}
                </div>
              </div>

              {pollError && (
                <div className="mt-2 text-[var(--down)]">
                  Status refresh error: {pollError}
                </div>
              )}

              {execution?.error && (
                <div className="mt-2 text-[var(--down)]">
                  {String(execution.error)}
                </div>
              )}

              {execution?.result_json && typeof execution.result_json === "object" && (
                <div className="mt-2 text-[var(--muted)]">
                  {(() => {
                    const r: any = execution.result_json;
                    const usdtFree = r?.checks?.usdtFree;
                    const requiredUsd = r?.checks?.requiredUsd;
                    if (typeof usdtFree === "number" && typeof requiredUsd === "number") {
                      return `USDT free: ${usdtFree} · required: ${requiredUsd}`;
                    }
                    return isTerminal ? "Execution finished." : "Checks running...";
                  })()}
                </div>
              )}

              {mode === "live" && status !== "canceled" && (
                <div className="mt-3">
                  <button
                    onClick={handleStop}
                    disabled={stopLoading || status === "unwinding" || status === "cancel_requested"}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--card-2)] py-2 text-sm font-bold text-[var(--down)] hover:brightness-110 disabled:opacity-50"
                  >
                    {stopLoading ? "Requesting stop..." : status === "unwinding" ? "Unwinding..." : status === "cancel_requested" ? "Stop requested" : "Stop / Unwind"}
                  </button>
                  <div className="mt-1 text-[10px] text-[var(--muted)]">
                    Live only: attempts to close perp then sell back spot.
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-6 flex gap-3">
             <button onClick={onClose} className="flex-1 rounded-lg border border-[var(--border)] py-2.5 text-sm font-medium hover:bg-[var(--card-2)]">
               Cancel
             </button>
             <button 
               onClick={handleExecute} 
               disabled={loading || (executionId != null && !isTerminal)}
               className="flex-1 rounded-lg bg-[var(--accent)] py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
             >
               {loading ? "Allocating..." : executionId && !isTerminal ? "Running..." : "Start Bot"}
             </button>
          </div>
        </div>
      </div>
    </div>
  );
}
