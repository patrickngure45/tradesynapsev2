import Link from "next/link";
import type { ReactNode } from "react";
import { Suspense } from "react";

import { SiteChrome } from "@/components/SiteChrome";
import { HomepageStats } from "./HomepageStats";
import { MarketPulse } from "@/components/dashboard/MarketPulse";

/* ── Feature-card data ─────────────────────────────────────────── */
const features: {
  href: string;
  title: string;
  desc: string;
  iconBg: string;
  icon: ReactNode;
}[] = [
  {
    href: "/exchange",
    title: "Spot Trading",
    desc: "Limit & market orders, real-time order book, TradingView candle charts, maker/taker fees.",
    iconBg: "bg-[var(--up-bg)]",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--up)" strokeWidth="2" strokeLinecap="round">
        <polyline points="22,7 13.5,15.5 8.5,10.5 2,17" />
        <polyline points="16,7 22,7 22,13" />
      </svg>
    ),
  },
  {
    href: "/p2p",
    title: "P2P Marketplace",
    desc: "Buy & sell USDT instantly via M-Pesa, Airtel Money, and bank transfer. Local escrow protection.",
    iconBg: "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)]",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
        <circle cx="9" cy="7" r="4"></circle>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
      </svg>
    ),
  },
  {
    href: "/wallet",
    title: "Wallet",
    desc: "BSC on-chain deposit addresses, custodial ledger, allowlist-only withdrawals.",
    iconBg: "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round">
        <rect x="2" y="6" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
        <circle cx="16" cy="15" r="2" />
      </svg>
    ),
  },
  {
    href: "/arbitrage",
    title: "Arbitrage Scanner",
    desc: "Cross-exchange price comparison. Spot spread detection across Binance, Bybit, and more.",
    iconBg: "bg-[color-mix(in_srgb,var(--warn)_12%,transparent)]",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--warn)" strokeWidth="2" strokeLinecap="round">
        <path d="M2 20h20" />
        <path d="M5 20V8l5 4 5-8 5 6v10" />
      </svg>
    ),
  },
  {
    href: "/copy-trading",
    title: "Copy Trading",
    desc: "Follow top traders and mirror their orders automatically with configurable ratios.",
    iconBg: "bg-[color-mix(in_srgb,var(--accent-2)_12%,transparent)]",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-2)" strokeWidth="2" strokeLinecap="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: "/connections",
    title: "API Connections",
    desc: "Connect Binance, Bybit, OKX exchange APIs. Encrypted credential storage.",
    iconBg: "bg-[color-mix(in_srgb,var(--accent-2)_12%,transparent)]",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-2)" strokeWidth="2" strokeLinecap="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
  },
  {
    href: "/markets",
    title: "Markets",
    desc: "Live market overview, 24h stats, volume, price changes across all trading pairs.",
    iconBg: "bg-[var(--warn-bg)]",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--warn)" strokeWidth="2" strokeLinecap="round">
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
    ),
  },
];

export default function Home() {
  return (
    <SiteChrome>
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-14 px-6 py-16">
        {/* ── Hero ─────────────────────────────────────────────── */}
        <header className="fade-in-up flex flex-col items-center gap-5 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/20 bg-[var(--accent)]/5 px-3 py-1 text-xs font-medium text-[var(--accent)]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]"></span>
            </span>
            System Online
          </div>
          
          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-6xl">
            Trade smarter with <span className="mr-2 text-[var(--accent)]">TradeSynapse.</span>
          </h1>
          
          <p className="max-w-2xl text-balance text-lg text-[var(--muted)]">
            A clean command center for spot trading, P2P exchange, wallet operations, and market intelligence.
            Track opportunities, execute quickly, and manage risk from one place.
          </p>
          
          <div className="mt-4 flex flex-wrap justify-center gap-4">
            <Link
              href="/exchange"
              className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--accent)] px-8 text-sm font-medium text-[var(--bg)] transition-colors hover:bg-[var(--accent-hover)]"
            >
              Open Trading Terminal
            </Link>
            <Link
              href="/p2p"
              className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--card-bg)] px-8 text-sm font-medium transition-colors hover:bg-[var(--hover-bg)]"
            >
              Start P2P Trade
            </Link>
          </div>
        </header>

        {/* ── AI Intelligence Dashboard ────────────────────────── */}
        <section className="fade-in-up delay-100 flex justify-center">
            <Suspense fallback={<div className="h-48 w-full max-w-4xl animate-pulse rounded-2xl bg-[var(--card-bg)]/50" />}>
                <MarketPulse />
            </Suspense>
        </section>

        {/* ── Stats ────────────────────────────────────────────── */}
        <HomepageStats />

        {/* ── Features ─────────────────────────────────────────── */}
        <section className="fade-in-up delay-200">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Quick Access</h2>
              <p className="text-sm text-[var(--muted)]">Everything you need to operate the platform day to day.</p>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Link
              key={feature.title}
              href={feature.href}
              className="group relative flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-6 transition-all hover:-translate-y-1 hover:border-[var(--accent)]/50 hover:shadow-lg"
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${feature.iconBg} transition-transform group-hover:scale-110`}
              >
                {feature.icon}
              </div>
              <h3 className="font-semibold text-[var(--fg)]">{feature.title}</h3>
              <p className="text-sm leading-relaxed text-[var(--muted)]">
                {feature.desc}
              </p>

              <div className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)]">
                Open
                <span className="transition-transform group-hover:translate-x-0.5">→</span>
              </div>
            </Link>
          ))}
          </div>
        </section>
      </main>
    </SiteChrome>
  );
}
