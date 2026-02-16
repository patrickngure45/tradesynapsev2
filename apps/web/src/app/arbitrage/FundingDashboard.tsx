"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { BotExecutionModal } from "./BotExecutionModal";

type FundingSignal = {
  id: string;
  kind: string;
  subject_id: string; // "binance:BTC/USDT:USDT"
  score: number; // Annual Yield %
  recommended_action: string;
  payload_json: {
    exchange: string;
    symbol: string;
    fundingRate: number;
    dailyRatePct: number;
    aprPct: number;
    nextFundingTime: number;
    volume24h?: number;
  };
  created_at: string;
};

export function FundingDashboard() {
  const [signals, setSignals] = useState<FundingSignal[]>([]);
  const [scanning, setScanning] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [selectedSignal, setSelectedSignal] = useState<FundingSignal | null>(null);

  const fetchSignals = async (forceScan = false) => {
    if (forceScan) setScanning(true);
    try {
      const url = `/api/exchange/funding?action=${forceScan ? "scan" : "latest"}`;
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.signals) {
        setSignals(data.signals);
      } else if (data.scanned !== undefined) {
         fetchSignals(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (forceScan) setScanning(false);
    }
  };

  useEffect(() => {
    fetchSignals(false);
  }, []);

  return (
    <div className="space-y-4">
      {/* Modal */}
      {selectedSignal && (
         <BotExecutionModal 
            signal={selectedSignal} 
            onClose={() => setSelectedSignal(null)} 
         />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
           <h2 className="text-lg font-bold">Yield Scanner</h2>
           <Link href="/connections" className="rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white">
              Connect APIs
           </Link>
           <button 
             onClick={() => setShowGuide(!showGuide)}
             className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] text-xs text-[var(--muted)] hover:bg-[var(--accent)] hover:text-white"
             title="How does this work?"
           >
             ?
           </button>
        </div>
        <button 
           onClick={() => fetchSignals(true)}
           disabled={scanning}
           className="rounded-lg bg-[var(--card)] border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--hover-bg)]"
        >
          {scanning ? "Scanning..." : "Refresh Rates"}
        </button>
      </div>

      <div className="text-[11px] text-[var(--muted)]">
        Scanning works without API keys. To auto-trade Cash &amp; Carry you need <span className="font-semibold">1 active connection</span> for that exchange.
        Cross-exchange strategies may require 2.
      </div>

      {/* Guide / Intro */}
      {showGuide && (
         <div className="animate-in fade-in slide-in-from-top-2 rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 text-sm leading-relaxed text-[var(--foreground)]">
            <div className="mb-2 font-bold text-blue-400">Strategy: Cash & Carry (Delta Neutral)</div>
            <p>
            This strategy captures <strong>funding payments</strong> from perp markets to 1x shorts.
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[var(--muted)]">
               <li>We identify coins where Short positions get paid to hold (Positive Funding).</li>
               <li>You execute a <strong>Spot Buy</strong> and a <strong>Perp Short (1x)</strong> simultaneously.</li>
               <li>Your price risk is neutralized ($0 gain/loss from price moves).</li>
               <li>You collect the funding fee every 8 hours as periodic interest.</li>
            </ol>
          <div className="mt-3 text-[11px] text-[var(--muted)]">
            Yields shown are <strong>annualized estimates</strong> based on the current funding rate.
            Funding can change or flip negative, and this does not include fees, slippage, or perp premium/basis.
          </div>
         </div>
      )}

      {/* Grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {signals.length === 0 && !scanning && (
          <div className="col-span-full rounded-xl border border-dashed border-[var(--border)] py-12 text-center">
             <div className="text-2xl opacity-20">💤</div>
             <p className="mt-2 text-sm text-[var(--muted)]">No high-yield opportunities right now.</p>
          </div>
        )}

        {signals.map((sig) => (
          <div
            key={sig.id}
            className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--accent)]/50 flex flex-col"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                    {sig.payload_json.exchange}
                  </div>
                  {sig.payload_json.volume24h ? (
                    <div className="text-[9px] font-medium text-[var(--muted)] bg-[var(--bg)] px-1.5 py-0.5 rounded">
                      Vol: ${(sig.payload_json.volume24h / 1_000_000).toFixed(1)}M
                    </div>
                  ) : null}
                </div>
                <div className="mt-0.5 text-lg font-bold truncate" title={sig.payload_json.symbol}>
                  {sig.payload_json.symbol}
                </div>
              </div>

              <div className="shrink-0 text-right">
                <div className="text-xl font-bold text-[var(--up)]">
                  {Number(sig.payload_json.aprPct ?? sig.score ?? 0).toFixed(2)}%
                </div>
                <div className="text-[9px] font-bold uppercase tracking-wide text-[var(--muted)]">
                  Annual Yield
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-[var(--bg)]/50 px-3 py-2 text-xs">
              <div className="flex flex-col">
                <span className="text-[9px] uppercase text-[var(--muted)]">8h Funding</span>
                <span className="font-mono font-medium text-[var(--foreground)]">
                  +{(sig.payload_json.fundingRate * 100).toFixed(4)}%
                </span>
              </div>
              <div className="flex flex-col text-right">
                <span className="text-[9px] uppercase text-[var(--muted)]">Next</span>
                <span className="font-mono text-[var(--muted)]">
                  {new Date(sig.payload_json.nextFundingTime).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>

            <button
              onClick={() => setSelectedSignal(sig)}
              className="mt-3 w-full rounded-lg bg-[var(--accent)] py-2 text-xs font-bold text-white transition hover:brightness-110"
            >
              Start Bot
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
