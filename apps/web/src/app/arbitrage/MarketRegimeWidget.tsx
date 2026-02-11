"use client";

import { useEffect, useState } from "react";

type RegimeReport = {
  symbol: string;
  regime: string;
  recommendation: string;
  metrics: {
    fundingRate: number;
    volatilityScore: number;
  };
  reason: string;
};

// Map recommendation to visuals
const REC_META: Record<string, { label: string; color: string; icon: string }> = {
  "GRID_NEUTRAL": { label: "Grid (Range)", color: "text-blue-400", icon: "⛓️" },
  "GRID_LONG": { label: "Grid (Long)", color: "text-green-400", icon: "📈" },
  "TREND_FOLLOW": { label: "Trend Follow", color: "text-[var(--up)]", icon: "🚀" },
  "CASH_CARRY": { label: "Cash & Carry", color: "text-purple-400", icon: "💰" },
  "STAY_FLAT": { label: "Stay Cash", color: "text-[var(--muted)]", icon: "🛑" },
};

export function MarketRegimeWidget({ symbol = "BTC/USDT" }: { symbol?: string }) {
  const [report, setReport] = useState<RegimeReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/intelligence/regime?symbol=${encodeURIComponent(symbol)}`)
       .then(res => res.json())
       .then(data => setReport(data))
       .catch(() => setReport(null))
       .finally(() => setLoading(false));
  }, [symbol]);

  if (loading) return <div className="h-24 animate-pulse rounded-xl bg-[var(--card)]/50" />;
  if (!report) return null;

  const meta = REC_META[report.recommendation] || REC_META["STAY_FLAT"];

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 transition hover:border-[var(--accent)]/40">
       <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-bold uppercase text-[var(--muted)]">Market Regime · {symbol}</h3>
            <div className={`mt-1 flex items-center gap-2 text-xl font-bold ${meta.color}`}>
                <span>{meta.icon}</span>
                <span>{meta.label}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed opacity-80 max-w-sm">
               {report.reason}
            </p>
          </div>

          <div className="text-right">
             <div className="mb-3">
                 <div className="text-[10px] uppercase text-[var(--muted)]">Volatility</div>
                 <div className="flex items-center justify-end gap-2">
                     <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--bg)]">
                        <div className="h-full bg-orange-400" style={{width: `${report.metrics.volatilityScore}%`}} />
                     </div>
                     <span className="text-xs font-mono">{report.metrics.volatilityScore.toFixed(0)}/100</span>
                 </div>
             </div>
             
             <div>
                 <div className="text-[10px] uppercase text-[var(--muted)]">Funding Cost</div>
                 <div className={`text-sm font-mono ${report.metrics.fundingRate > 0.0002 ? "text-red-400" : "text-green-400"}`}>
                    {(report.metrics.fundingRate * 100).toFixed(4)}%
                 </div>
             </div>
          </div>
       </div>
    </div>
  );
}
