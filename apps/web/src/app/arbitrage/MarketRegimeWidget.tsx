"use client";

import { useEffect, useState } from "react";

type RegimeReport = {
  symbol: string;
  regime: string;
  recommendation: string;
  metrics: {
    fundingRate: number;
    volatilityScore: number;
    spreadBps?: number;
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

export function MarketRegimeWidget({
  symbol = "BTC/USDT",
  exchange = "binance",
}: {
  symbol?: string;
  exchange?: string;
}) {
  const [report, setReport] = useState<RegimeReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/intelligence/regime?exchange=${encodeURIComponent(exchange)}&symbol=${encodeURIComponent(symbol)}`)
       .then(res => res.json())
       .then(data => setReport(data))
       .catch(() => setReport(null))
       .finally(() => setLoading(false));
  }, [exchange, symbol]);

  if (loading) return <div className="h-24 animate-pulse rounded-xl bg-[var(--card)]/50" />;
  if (!report) return null;

  const meta = REC_META[report.recommendation] || REC_META["STAY_FLAT"];
  const showFunding = (exchange ?? "").toLowerCase() !== "internal";
  const fundingLabel = showFunding ? "Funding Cost" : "Spread";
  const fundingValue = showFunding
    ? `${(report.metrics.fundingRate * 100).toFixed(4)}%`
    : `${(report.metrics.spreadBps ?? 0).toFixed(1)} bps`;

  return (
    <div className="h-full rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--accent)]/40 flex flex-col gap-4">
          <div className="min-w-0">
            <h3 className="text-xs font-bold uppercase text-[var(--muted)] truncate">Market Regime · {symbol}{showFunding ? "" : " (internal)"}</h3>
            <div className={`mt-2 flex items-center gap-2 text-xl font-bold ${meta.color}`}>
                <span className="text-2xl">{meta.icon}</span>
                <span>{meta.label}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-[var(--border)] pt-3">
             <div>
                 <div className="text-[10px] uppercase text-[var(--muted)] mb-1">Volatility</div>
                 <div className="flex items-center gap-2">
                     <div className="h-1.5 w-full max-w-[80px] overflow-hidden rounded-full bg-[var(--bg)]">
                        <div className="h-full bg-orange-400" style={{width: `${report.metrics.volatilityScore}%`}} />
                     </div>
                     <span className="text-xs font-mono opacity-80">{report.metrics.volatilityScore.toFixed(0)}</span>
                 </div>
             </div>
             
             <div>
                <div className="text-[10px] uppercase text-[var(--muted)] mb-1">{fundingLabel}</div>
                <div className={`text-sm font-mono font-medium ${showFunding ? (report.metrics.fundingRate > 0.0002 ? "text-red-400" : "text-green-400") : "text-[var(--muted)]"}`}>
                  {fundingValue}
                </div>
             </div>
          </div>

          <p className="text-xs leading-relaxed opacity-70 line-clamp-2" title={report.reason}>
             {report.reason}
          </p>
    </div>
  );
}
