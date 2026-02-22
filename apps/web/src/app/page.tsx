import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

import { SiteChrome } from "@/components/SiteChrome";
import { HomepageStats } from "./HomepageStats";
import { getSessionCookieName, verifySessionToken } from "@/lib/auth/session";

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

export default async function Home() {
  // If the user has a valid session, the real landing page is /home.
  // Keep this server-side to avoid flicker.
  try {
    const secret = String(process.env.PROOFPACK_SESSION_SECRET ?? "").trim();
    if (secret) {
      const cookieStore = await cookies();
      const token = cookieStore.get(getSessionCookieName())?.value ?? "";
      if (token) {
        const verified = verifySessionToken({ token, secret });
        if (verified.ok) redirect("/home");
      }
    }
  } catch {
    // If this fails for any reason, fall back to rendering the public landing page.
  }

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
                    <div className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">Rails online</div>
                    <div className="h-px flex-1 bg-[var(--border)]" />
                  </div>

                  <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight text-[var(--foreground)] sm:text-6xl">
                    <span className="bg-gradient-to-br from-[var(--foreground)] to-[color-mix(in_srgb,var(--accent)_70%,var(--foreground))] bg-clip-text text-transparent">
                      Coinwaka
                    </span>{" "}
                    — your daily crypto command center.
                  </h1>

                  <p className="mt-3 max-w-2xl text-balance text-base leading-relaxed text-[var(--muted)] sm:text-lg">
                    Track balances, manage watchlists and alerts, and settle P2P escrow with clear state.
                    Built to stay clean under pressure: fewer clicks, explainable status, predictable flows.
                  </p>

                  <div className="mt-7 flex flex-wrap items-center gap-3">
                    <Link
                      href="/signup"
                      className="inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] px-6 text-sm font-semibold text-white shadow-[var(--shadow)] transition hover:shadow-[var(--shadow-2)] hover:opacity-95"
                    >
                      Create account
                    </Link>
                    <Link
                      href="/login"
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg)] px-6 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--card-2)]"
                    >
                      Sign in
                    </Link>
                    <Link
                      href="/p2p"
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg)] px-6 text-sm font-semibold text-[var(--muted)] transition hover:bg-[var(--card-2)] hover:text-[var(--foreground)]"
                    >
                      Explore P2P
                    </Link>
                  </div>

                  <div className="mt-7 grid max-w-xl gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-2">
                          <Coin symbol="BTC" />
                          <Coin symbol="ETH" />
                          <Coin symbol="USDT" />
                        </div>
                        <div className="text-sm font-extrabold tracking-tight text-[var(--foreground)]">Wallet</div>
                      </div>
                      <div className="mt-1 text-xs leading-relaxed text-[var(--muted)]">Deposits, balances, withdrawals</div>
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
                          t: "Wallet ops",
                          d: "Deposits, balances, withdrawals",
                        }, {
                          tone: "bg-[var(--up)]",
                          halo: "bg-[var(--up-bg)]",
                          t: "P2P desk",
                          d: "Escrow, payouts, disputes",
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
                href: "/arcade",
                title: "Arcade",
                desc: "Daily drops, reveals, and progression modules.",
                iconTone: "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)]",
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M21 16V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8" />
                    <path d="M7 16v2" />
                    <path d="M17 16v2" />
                    <path d="M9 10h.01" />
                    <path d="M15 10h.01" />
                    <path d="M12 13h.01" />
                  </svg>
                ),
              },
              {
                href: "/support/help",
                title: "Help",
                desc: "Escrow safety tips and common questions.",
                iconTone: "bg-[var(--warn-bg)] text-[var(--warn)]",
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 18h.01" />
                    <path d="M9.09 9a3 3 0 1 1 5.83 1c-.75 1-1.92 1.5-2.42 2.5-.19.38-.28.73-.28 1.5" />
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
