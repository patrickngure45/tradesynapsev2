import Link from "next/link";
import { Suspense } from "react";

import { SiteChrome } from "@/components/SiteChrome";
import { HomepageStats } from "./HomepageStats";
import { MarketPulse } from "@/components/dashboard/MarketPulse";

function SectionHeader({ tone, title }: { tone: "accent" | "accent2" | "up"; title: string }) {
  const dot =
    tone === "up" ? "bg-[var(--up)]" : tone === "accent2" ? "bg-[var(--accent-2)]" : "bg-[var(--accent)]";

  return (
    <div className="mb-5 flex items-center gap-3">
      <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
        <span className={"absolute inline-flex h-2.5 w-2.5 rounded-full " + dot} />
        <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
      </span>
      <div className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">{title}</div>
      <div className="h-px flex-1 bg-[var(--border)]" />
    </div>
  );
}

function Coin({ symbol }: { symbol: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={`/api/assets/icon?symbol=${encodeURIComponent(symbol)}`}
      alt={symbol}
      width={20}
      height={20}
      className="h-5 w-5 rounded-full border border-[var(--border)] bg-[var(--card)] object-contain"
      loading="lazy"
    />
  );
}

export default function Home() {
  return (
    <SiteChrome>
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-14 px-6 py-14 sm:py-16">
        {/* ── Hero ─────────────────────────────────────────────── */}
        <header className="fade-in-up">
          <div
            className="relative rounded-3xl p-[1px] shadow-[var(--shadow-2)]"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--accent) 36%, transparent), color-mix(in srgb, var(--accent-2) 28%, transparent))",
            }}
          >
            <div className="relative overflow-hidden rounded-3xl border border-[color-mix(in_srgb,var(--border)_70%,transparent)] bg-[var(--card)] px-7 py-10 sm:px-10">
              <div
                className="pointer-events-none absolute inset-0 opacity-70"
                aria-hidden
                style={{
                  background:
                    "radial-gradient(900px 320px at 15% 0%, color-mix(in oklab, var(--accent) 14%, transparent) 0%, transparent 60%), radial-gradient(640px 280px at 92% 10%, color-mix(in oklab, var(--accent-2) 12%, transparent) 0%, transparent 58%)",
                }}
              />

              <div className="relative grid gap-10 lg:grid-cols-12 lg:items-start">
                <div className="lg:col-span-7">
                  {/* P2P-style cue header */}
                  <div className="flex items-center gap-3">
                    <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
                      <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
                      <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
                    </span>
                    <div className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">Exchange online</div>
                    <div className="h-px flex-1 bg-[var(--border)]" />
                  </div>

                  <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight text-[var(--foreground)] sm:text-6xl">
                    <span className="bg-gradient-to-br from-[var(--foreground)] to-[color-mix(in_srgb,var(--accent)_70%,var(--foreground))] bg-clip-text text-transparent">
                      Execute faster
                    </span>{" "}
                    across spot, P2P, and wallet rails.
                  </h1>

                  <p className="mt-3 max-w-2xl text-balance text-base leading-relaxed text-[var(--muted)] sm:text-lg">
                    A modern command center for price discovery, escrow settlement, and on-chain deposits.
                    Built to stay clean under pressure: fewer clicks, clearer state, and predictable flows.
                  </p>

                  <div className="mt-7 flex flex-wrap items-center gap-3">
                    <Link
                      href="/signup"
                      className="inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] px-6 text-sm font-semibold text-white shadow-[var(--shadow)] transition hover:shadow-[var(--shadow-2)] hover:opacity-95"
                    >
                      Create account
                    </Link>
                    <Link
                      href="/exchange"
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg)] px-6 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--card-2)]"
                    >
                      Open terminal
                    </Link>
                  </div>

                  <div className="mt-7 grid max-w-xl gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-2">
                          <Coin symbol="BTC" />
                          <Coin symbol="ETH" />
                          <Coin symbol="USDT" />
                        </div>
                        <div className="text-sm font-extrabold tracking-tight text-[var(--foreground)]">Execution</div>
                      </div>
                      <div className="mt-1 text-xs leading-relaxed text-[var(--muted)]">Spot terminal + order history</div>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)]">
                          <span className="absolute inset-0 rounded-xl bg-[color-mix(in_srgb,var(--up)_12%,transparent)]" />
                          <svg className="relative" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--up)" strokeWidth="2" strokeLinecap="round">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                          </svg>
                        </span>
                        <div className="text-sm font-extrabold tracking-tight text-[var(--foreground)]">Escrow</div>
                      </div>
                      <div className="mt-1 text-xs leading-relaxed text-[var(--muted)]">P2P settlement with reputation</div>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)]">
                          <span className="absolute inset-0 rounded-xl bg-[color-mix(in_srgb,var(--accent-2)_12%,transparent)]" />
                          <svg className="relative" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-2)" strokeWidth="2" strokeLinecap="round">
                            <rect x="2" y="6" width="20" height="14" rx="2" />
                            <path d="M2 10h20" />
                            <circle cx="16" cy="15" r="2" />
                          </svg>
                        </span>
                        <div className="text-sm font-extrabold tracking-tight text-[var(--foreground)]">Settlement</div>
                      </div>
                      <div className="mt-1 text-xs leading-relaxed text-[var(--muted)]">Deposits, balances, withdrawals</div>
                    </div>
                  </div>
                </div>

                {/* Right: connected rails */}
                <div className="lg:col-span-5">
                  <div className="rounded-3xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_70%,transparent)] p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">
                        Flow map
                      </div>
                      <div className="text-[11px] font-semibold text-[var(--muted)]">Live</div>
                    </div>

                    <div className="relative mt-4">
                      <div className="absolute left-3 top-3 bottom-3 w-px bg-[var(--border)] opacity-70" aria-hidden />
                      <div className="space-y-3 pl-8">
                        {[{
                          tone: "bg-[var(--accent)]",
                          halo: "bg-[var(--ring)]",
                          t: "Spot terminal",
                          d: "Order book, charts, fills",
                        }, {
                          tone: "bg-[var(--up)]",
                          halo: "bg-[var(--up-bg)]",
                          t: "P2P desk",
                          d: "Escrow, payouts, disputes",
                        }, {
                          tone: "bg-[var(--accent-2)]",
                          halo: "bg-[var(--ring)]",
                          t: "Wallet ops",
                          d: "Deposits, balances, withdrawals",
                        }].map((x) => (
                          <div key={x.t} className="relative">
                            <span className="absolute -left-8 top-2 inline-flex h-3 w-3 items-center justify-center" aria-hidden>
                              <span className={"absolute inline-flex h-3 w-3 rounded-full " + x.tone} />
                              <span className={"absolute inline-flex h-5 w-5 rounded-full " + x.halo} />
                            </span>
                            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3">
                              <div className="text-sm font-extrabold tracking-tight text-[var(--foreground)]">{x.t}</div>
                              <div className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">{x.d}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* ── Signal Desk ─────────────────────────────────────── */}
        <section className="fade-in-up delay-100">
          <SectionHeader tone="accent2" title="Signal desk" />

          <Suspense
            fallback={<div className="h-56 w-full animate-pulse rounded-3xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_55%,transparent)]" />}
          >
            <MarketPulse />
          </Suspense>
        </section>

        {/* ── Network Stats ───────────────────────────────────── */}
        <section className="fade-in-up delay-150">
          <SectionHeader tone="up" title="Snapshot" />
          <HomepageStats />
        </section>

        {/* ── Modules ─────────────────────────────────────────── */}
        <section className="fade-in-up delay-200">
          <SectionHeader tone="accent" title="Modules" />

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                href: "/exchange",
                title: "Spot terminal",
                desc: "Limit/market orders, depth, charts, history.",
                iconTone: "bg-[var(--up-bg)] text-[var(--up)]",
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <polyline points="22,7 13.5,15.5 8.5,10.5 2,17" />
                    <polyline points="16,7 22,7 22,13" />
                  </svg>
                ),
              },
              {
                href: "/p2p",
                title: "P2P desk",
                desc: "Escrow flows, reputation, local rails.",
                iconTone: "bg-[color-mix(in_srgb,var(--up)_12%,transparent)] text-[var(--up)]",
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                ),
              },
              {
                href: "/wallet",
                title: "Wallet",
                desc: "Deposits, balances, withdrawals, controls.",
                iconTone: "bg-[color-mix(in_srgb,var(--accent-2)_12%,transparent)] text-[var(--accent-2)]",
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <rect x="2" y="6" width="20" height="14" rx="2" />
                    <path d="M2 10h20" />
                    <circle cx="16" cy="15" r="2" />
                  </svg>
                ),
              },
              {
                href: "/markets",
                title: "Markets",
                desc: "Pairs, 24h moves, volume, filters.",
                iconTone: "bg-[var(--warn-bg)] text-[var(--warn)]",
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                ),
              },
              {
                href: "/connections",
                title: "API connections",
                desc: "Link exchanges. Keep credentials encrypted.",
                iconTone: "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)]",
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                ),
              },
              {
                href: "/arbitrage",
                title: "Arbitrage scanner",
                desc: "Cross-exchange spread detection.",
                iconTone: "bg-[color-mix(in_srgb,var(--warn)_12%,transparent)] text-[var(--warn)]",
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M2 20h20" />
                    <path d="M5 20V8l5 4 5-8 5 6v10" />
                  </svg>
                ),
              },
            ].map((m) => (
              <Link
                key={m.href}
                href={m.href}
                className="group relative rounded-3xl p-[1px] transition-transform hover:-translate-y-0.5"
                style={{
                  background:
                    "linear-gradient(135deg, color-mix(in srgb, var(--accent) 22%, transparent), color-mix(in srgb, var(--accent-2) 18%, transparent))",
                }}
              >
                <div className="relative h-full rounded-3xl border border-[color-mix(in_srgb,var(--border)_70%,transparent)] bg-[var(--card)] p-6">
                  <div
                    className="pointer-events-none absolute inset-0 rounded-3xl opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden
                    style={{
                      background:
                        "radial-gradient(560px 180px at 15% 0%, color-mix(in oklab, var(--accent) 10%, transparent) 0%, transparent 60%), radial-gradient(520px 200px at 90% 10%, color-mix(in oklab, var(--accent-2) 9%, transparent) 0%, transparent 58%)",
                    }}
                  />

                  <div className="relative flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className={"flex h-10 w-10 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--border)_70%,transparent)] " + m.iconTone}>
                        {m.icon}
                      </div>
                      <span className="mt-1 text-xs font-semibold text-[var(--muted)] transition-colors group-hover:text-[var(--foreground)]" aria-hidden>
                        →
                      </span>
                    </div>

                    <div className="text-sm font-extrabold tracking-tight text-[var(--foreground)]">{m.title}</div>
                    <p className="text-sm leading-relaxed text-[var(--muted)]">{m.desc}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </SiteChrome>
  );
}
