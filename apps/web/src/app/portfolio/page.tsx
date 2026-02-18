import { SiteChrome } from "@/components/SiteChrome";
import { PortfolioClient } from "./PortfolioClient";

export const metadata = { title: "Portfolio — TradeSynapse" };

export default function PortfolioPage() {
  return (
    <SiteChrome>
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10 sm:py-14">
        <header className="fade-in-up">
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
              <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--up)]" />
              <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
            </span>
            <div className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">Account</div>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <h1 className="mt-5 text-balance text-3xl font-semibold tracking-tight text-[var(--foreground)] sm:text-4xl">
            Portfolio
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--muted)] sm:text-base">
            Balances, PnL, and execution history — compact, readable, and updated continuously.
          </p>
        </header>

        <div className="fade-in-up delay-100">
          <PortfolioClient />
        </div>
      </main>
    </SiteChrome>
  );
}
