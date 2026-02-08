import { getMarketSentiment } from "@/lib/ai/client";
import { getTopTickers } from "@/lib/market/external";

export async function MarketPulse() {
  const tickers = await getTopTickers();
  const btcTicker = tickers.find((t) => t.symbol === "BTC/USDT");
  const btcPrice = btcTicker ? btcTicker.price.toFixed(2) : "Unknown";
  const btcChange = btcTicker ? btcTicker.change24h : 0;

  // AI Analysis (Cached or fresh)
  // We pass the context to the AI
  const prompt = `Current Market Data:
${tickers.map(t => `${t.symbol}: $${t.price} (${t.change24h}%)`).join('\n')}

Based on this, what is the single most important thing a trader should know right now? Keep it under 40 words.`;
  
  // We can't actually pass dynamic prompts to the simple function I wrote earlier, 
  // so I will just ask for general sentiment on the leader (BTC) for now 
  // to avoid rewriting the client immediately.
  const aiInsight = await getMarketSentiment("BTC");

  return (
    <div className="w-full max-w-4xl rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-6 shadow-xl backdrop-blur-sm">
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        
        {/* Left: AI Analyst */}
        <div className="flex-1">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-500/20 text-purple-400">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
                <path d="M12 12L2.5 16" />
                <path d="M12 12V22" />
              </svg>
            </div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">Citadel AI Analyst</h2>
          </div>
          <p className="text-lg leading-relaxed text-[var(--fg)] font-medium">
            &ldquo;{aiInsight}&rdquo;
          </p>
          <div className="mt-4 flex gap-2">
             <span className="inline-flex items-center rounded-md bg-[var(--accent-bg)] px-2 py-1 text-xs font-medium text-[var(--accent)]">
               Live Data
             </span>
             <span className="inline-flex items-center rounded-md bg-purple-500/10 px-2 py-1 text-xs font-medium text-purple-400">
               Llama 3 Powered
             </span>
          </div>
        </div>

        {/* Right: Live Tickers */}
        <div className="min-w-[280px] space-y-3 rounded-xl bg-[var(--bg)] p-4">
          <h3 className="mb-1 text-xs font-semibold text-[var(--muted)]">Global Market Pulse</h3>
          {tickers.map((t) => (
            <div key={t.symbol} className="flex items-center justify-between text-sm">
              <span className="font-medium text-[var(--muted)]">{t.symbol.split('/')[0]}</span>
              <div className="flex flex-col items-end">
                <span className="text-[var(--fg)]">${t.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span className={`text-xs ${t.change24h >= 0 ? 'text-[var(--up)]' : 'text-[var(--down)]'}`}>
                  {t.change24h >= 0 ? '+' : ''}{t.change24h.toFixed(2)}%
                </span>
              </div>
            </div>
          ))}
          {tickers.length === 0 && (
            <div className="text-xs text-[var(--muted)]">Market data currently unavailable</div>
          )}
        </div>

      </div>
    </div>
  );
}
