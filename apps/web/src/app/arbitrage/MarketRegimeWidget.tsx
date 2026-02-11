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
    <div className="h-full rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 transition hover:border-[var(--accent)]/40 flex flex-col justify-between">
       <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-bold uppercase text-[var(--muted)] truncate">Market Regime · {symbol}</h3>
            <div className={`mt-1 flex items-center gap-2 text-lg sm:text-xl font-bold ${meta.color} whitespace-nowrap`}>
                <span>{meta.icon}</span>
                <span>{meta.label}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed opacity-80 line-clamp-3 sm:line-clamp-none">
               {report.reason}
            </p>
          </div>

          <div className="flex flex-row sm:flex-col justify-between sm:justify-start gap-4 sm:text-right shrink-0 border-t sm:border-t-0 border-[var(--border)] pt-3 sm:pt-0">
             <div className="sm:mb-3">
                 <div className="text-[10px] uppercase text-[var(--muted)]">Volatility</div>
                 <div className="flex items-center sm:justify-end gap-2">
                     <div className="h-1.5 w-12 sm:w-16 overflow-hidden rounded-full bg-[var(--bg)]">
                        <div className="h-full bg-orange-400" style={{width: `${report.metrics.volatilityScore}%`}} />
                     </div>
                     <span className="text-xs font-mono">{report.metrics.volatilityScore.toFixed(0)}</span>
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
