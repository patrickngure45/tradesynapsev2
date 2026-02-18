import { unstable_noStore as noStore } from "next/cache";

import { getMarketSentiment } from "@/lib/ai/client";
import { getTopTickers } from "@/lib/market/external";

export async function MarketPulse() {
  // This component depends on external services (market data + optional AI).
  // Prevent static prerendering at build-time to avoid flaky network timeouts.
  noStore();

  const tickers = await getTopTickers().catch(() => []);

  const aiInsight = await getMarketSentiment("BTC").catch(() => "AI connectivity interruption. Check back momentarily.");

  return (
    <div
      className="relative w-full rounded-3xl p-[1px] shadow-[var(--shadow-2)]"
      style={{
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--accent) 22%, transparent), color-mix(in srgb, var(--accent-2) 18%, transparent))",
      }}
    >
      <div className="relative overflow-hidden rounded-3xl border border-[color-mix(in_srgb,var(--border)_70%,transparent)] bg-[var(--card)] p-6">
        <div
          className="pointer-events-none absolute inset-x-0 -top-10 h-28 opacity-70"
          aria-hidden
          style={{
            background:
              "radial-gradient(900px 240px at 15% 0%, color-mix(in oklab, var(--accent) 12%, transparent) 0%, transparent 60%), radial-gradient(640px 240px at 92% 10%, color-mix(in oklab, var(--accent-2) 10%, transparent) 0%, transparent 55%)",
          }}
        />

        <div className="relative grid gap-6 lg:grid-cols-12 lg:items-start">
          {/* Left: Insight */}
          <div className="lg:col-span-7">
            <div className="flex items-center gap-3">
              <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
                <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent-2)]" />
                <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
              </span>
              <div className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">AI analyst</div>
              <div className="h-px flex-1 bg-[var(--border)]" />
            </div>

            <p className="mt-4 text-balance text-lg font-medium leading-relaxed text-[var(--foreground)]">{aiInsight}</p>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--muted)]">
              <span className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-hidden />
                Live market feed
              </span>
              <span className="text-[var(--border)]" aria-hidden>
                •
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-2)]" aria-hidden />
                Sentiment layer
              </span>
            </div>
          </div>

          {/* Right: Tickers rail */}
          <div className="lg:col-span-5">
            <div className="rounded-3xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_70%,transparent)] p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">Global pulse</div>
                <div className="text-[11px] font-semibold text-[var(--muted)]">Live</div>
              </div>

              <div className="relative mt-4">
                <div className="absolute left-3 top-3 bottom-3 w-px bg-[var(--border)] opacity-70" aria-hidden />
                <div className="space-y-2 pl-8">
                  {tickers.slice(0, 6).map((t) => {
                    const sym = t.symbol.split("/")[0] ?? t.symbol;
                    const up = t.change24h >= 0;
                    return (
                      <div key={t.symbol} className="relative">
                        <span className="absolute -left-8 top-3 inline-flex h-3 w-3 items-center justify-center" aria-hidden>
                          <span className={"absolute inline-flex h-3 w-3 rounded-full " + (up ? "bg-[var(--up)]" : "bg-[var(--down)]")} />
                          <span className="absolute inline-flex h-5 w-5 rounded-full bg-[var(--ring)]" />
                        </span>
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3">
                          <div className="flex items-center justify-between gap-4">
                            <div className="text-sm font-extrabold tracking-tight text-[var(--foreground)]">{sym}</div>
                            <div className="flex flex-col items-end">
                              <div className="text-sm font-semibold tabular-nums text-[var(--foreground)]">
                                ${t.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                              <div className={"text-xs font-semibold tabular-nums " + (up ? "text-[var(--up)]" : "text-[var(--down)]")}>
                                {up ? "+" : ""}
                                {t.change24h.toFixed(2)}%
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {tickers.length === 0 && (
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-xs text-[var(--muted)]">
                      Market data currently unavailable
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
