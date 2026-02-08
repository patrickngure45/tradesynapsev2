"use client";

import { useState } from "react";
import { analyzeTokenAction } from "@/app/actions/ai-analysis";

export function AIArbitrageAnalyst() {
  const [symbol, setSymbol] = useState("");
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol) return;
    setLoading(true);
    setAnalysis(null);
    try {
      const result = await analyzeTokenAction(symbol);
      setAnalysis(result);
    } catch (err) {
      setAnalysis("Analysis unavailable. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-pink-500/20 text-pink-400">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
            <path d="M12 12L2.5 16" />
            <path d="M12 12V22" />
          </svg>
        </div>
        <div>
           <h2 className="text-lg font-semibold text-[var(--fg)]">AI Arbitrage Consultant</h2>
           <p className="text-xs text-[var(--muted)]">Powered by Llama 3 via Groq</p>
        </div>
      </div>

      <form onSubmit={handleAnalyze} className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="Enter symbol (e.g. BTC, ETH)"
          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <button
          type="submit"
          disabled={loading || !symbol}
          className="rounded-lg bg-[var(--accent)] px-6 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Analyzing..." : "Ask Agent"}
        </button>
      </form>

      {analysis && (
        <div className="mt-4 animate-in fade-in slide-in-from-top-2">
            <div className="rounded-lg bg-[var(--bg)] p-4 text-sm leading-relaxed text-[var(--fg)] border-l-2 border-pink-500">
                <span className="mb-1 block text-xs font-bold text-pink-400">ANALYSIS REPORT</span>
                {analysis}
            </div>
        </div>
      )}
    </div>
  );
}
