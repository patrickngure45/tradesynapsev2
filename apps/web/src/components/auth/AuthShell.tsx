import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/LogoMark";
import { BRAND_NAME } from "@/lib/seo/brand";

function CoinLogo({
  symbol,
  size = 22,
}: {
  symbol: string;
  size?: number;
}) {
  const s = String(symbol || "").trim().toUpperCase();
  const src = s ? `/api/assets/icon?symbol=${encodeURIComponent(s)}` : "";

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)]"
      style={{ width: size, height: size }}
      aria-label={s}
      title={s}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className="h-full w-full rounded-full object-contain"
        loading="lazy"
        aria-hidden
      />
    </span>
  );
}

function MobileIntro({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--card-2)]"
          aria-label="Home"
        >
          <span
            className="flex h-8 w-8 items-center justify-center rounded-xl text-[var(--accent)]"
            style={{
              background: "color-mix(in srgb, var(--background) 35%, transparent)",
              boxShadow: "var(--glow)",
              backdropFilter: "blur(12px)",
            }}
          >
            <LogoMark size={18} className="opacity-95" />
          </span>
          <span className="sr-only">{BRAND_NAME}</span>
        </Link>

        <div className="flex items-center -space-x-2" aria-label="Top markets">
          <CoinLogo symbol="BTC" size={26} />
          <CoinLogo symbol="ETH" size={26} />
          <CoinLogo symbol="USDT" size={26} />
        </div>
      </div>

      <div className="mt-5">
        <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">Exchange</div>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--foreground)]">
          <span className="bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] bg-clip-text text-transparent">{title}</span>
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{subtitle}</p>
      </div>

      <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
        <div className="flex items-center gap-3">
          <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
            <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
            <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
          </span>
          <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Market tape</div>
          <div className="h-px flex-1 bg-[var(--border)]" />
        </div>

        <div className="mt-3 grid gap-2">
          {[
            { base: "BTC", pair: "BTC/USDT", price: "67,420", up: true, chg: "2.14%" },
            { base: "ETH", pair: "ETH/USDT", price: "3,540", up: true, chg: "1.02%" },
          ].map((r) => (
            <div key={r.pair} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <CoinLogo symbol={r.base} size={22} />
                <div className="min-w-0">
                  <div className="truncate text-xs font-extrabold text-[var(--foreground)]">{r.pair}</div>
                  <div className="mt-0.5 font-mono text-[11px] font-semibold text-[var(--muted)]">{r.price}</div>
                </div>
              </div>
              <span className={"rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] font-bold " + (r.up ? "bg-[var(--up-bg)] text-[var(--up)]" : "bg-[var(--down-bg)] text-[var(--down)]")}>
                {r.up ? "+" : ""}{r.chg}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AuthShell({
  title,
  subtitle,
  children,
  switchHint,
  switchHref,
  switchLabel,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  switchHint?: string;
  switchHref?: string;
  switchLabel?: string;
}) {
  const tape = [
    { base: "BTC", pair: "BTC/USDT", price: "67,420", changePct: 2.14 },
    { base: "ETH", pair: "ETH/USDT", price: "3,540", changePct: 1.02 },
  ];

  return (
    <main className="relative mx-auto w-full max-w-6xl overflow-hidden px-6 py-10 lg:py-14">
      {/* Ambient background: aurora + subtle grid texture (token-driven) */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(1100px 520px at 18% -8%, color-mix(in oklab, var(--accent) 18%, transparent) 0%, transparent 62%), radial-gradient(900px 460px at 96% 8%, color-mix(in oklab, var(--accent-2) 14%, transparent) 0%, transparent 58%), radial-gradient(800px 420px at 55% 105%, color-mix(in oklab, var(--accent) 10%, transparent) 0%, transparent 62%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-55"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, color-mix(in srgb, var(--border) 70%, transparent) 0 1px, transparent 1px 52px), repeating-linear-gradient(0deg, color-mix(in srgb, var(--border) 65%, transparent) 0 1px, transparent 1px 52px)",
            maskImage: "radial-gradient(ellipse 80% 60% at 50% 30%, black 0%, transparent 70%)",
            WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 30%, black 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute -left-24 top-8 h-72 w-72 rounded-full blur-3xl"
          style={{
            background: "color-mix(in oklab, var(--accent) 14%, transparent)",
          }}
        />
        <div
          className="absolute -right-24 top-20 h-80 w-80 rounded-full blur-3xl"
          style={{
            background: "color-mix(in oklab, var(--accent-2) 12%, transparent)",
          }}
        />
      </div>

      <div className="grid items-stretch gap-6 lg:grid-cols-2">
        {/* Left: brand + value (desktop only) */}
        <div
          className="fade-in-up relative hidden rounded-3xl p-[1px] shadow-[var(--shadow)] lg:block"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--accent) 45%, transparent), color-mix(in srgb, var(--accent-2) 40%, transparent))",
          }}
        >
          <section className="relative h-full overflow-hidden rounded-3xl border border-[color-mix(in_srgb,var(--border)_60%,transparent)] bg-[color-mix(in_srgb,var(--card)_88%,transparent)] p-7">
            <div
              className="pointer-events-none absolute inset-0 opacity-70"
              style={{
                background:
                  "radial-gradient(900px 320px at 20% 0%, color-mix(in oklab, var(--accent) 14%, transparent) 0%, transparent 62%), radial-gradient(640px 280px at 92% 10%, color-mix(in oklab, var(--accent-2) 11%, transparent) 0%, transparent 58%)",
              }}
            />

            <div className="relative">
              <div className="flex items-center justify-between gap-3">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--card-2)]"
                >
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-xl text-[var(--accent)]"
                    style={{
                      background: "color-mix(in srgb, var(--background) 35%, transparent)",
                      boxShadow: "var(--glow)",
                      backdropFilter: "blur(12px)",
                    }}
                  >
                    <LogoMark size={18} className="opacity-95" />
                  </span>
                  <span className="sr-only">{BRAND_NAME}</span>
                </Link>

                <div className="flex items-center gap-2">
                  <div className="flex items-center -space-x-2" aria-label="Top markets">
                    <CoinLogo symbol="BTC" size={26} />
                    <CoinLogo symbol="ETH" size={26} />
                    <CoinLogo symbol="USDT" size={26} />
                  </div>
                </div>
              </div>

              <h1 className="mt-7 text-3xl font-semibold tracking-tight text-[var(--foreground)] lg:text-4xl">
                <span
                  className="bg-gradient-to-br from-[var(--foreground)] to-[color-mix(in_srgb,var(--accent)_70%,var(--foreground))] bg-clip-text text-transparent"
                >
                  {title}
                </span>
              </h1>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--muted)]">{subtitle}</p>

              {/* P2P-style cue header */}
              <div className="mt-6 flex items-center gap-3">
                <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
                  <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
                  <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
                </span>
                <div className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">Exchange access</div>
                <div className="h-px flex-1 bg-[var(--border)]" />
              </div>

              {/* Connected rail (alive, not busy) */}
              <div className="relative mt-4">
                <div className="absolute left-3 top-3 bottom-3 w-px bg-[var(--border)] opacity-70" aria-hidden />
                <div className="space-y-3 pl-8">
                  {[
                    { tone: "bg-[var(--accent)]", halo: "bg-[var(--ring)]", t: "Spot markets", d: "Execution, depth, and order history" },
                    { tone: "bg-[var(--accent-2)]", halo: "bg-[var(--ring)]", t: "Wallet", d: "Balances, deposits, withdrawals" },
                    { tone: "bg-[var(--up)]", halo: "bg-[var(--up-bg)]", t: "P2P desk", d: "Escrow, reputation, reminders" },
                  ].map((x) => (
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

              {/* Clean crypto-native cue: market tape with real logos (not congested) */}
              <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">Market tape</div>
                  <div className="text-[11px] font-semibold text-[var(--muted)]">Spot</div>
                </div>

                <div className="mt-3 grid gap-2">
                  {tape.map((r) => {
                    const up = r.changePct >= 0;
                    return (
                      <div
                        key={r.pair}
                        className="flex items-center justify-between gap-3 rounded-xl border border-[color-mix(in_srgb,var(--border)_80%,transparent)] bg-[color-mix(in_srgb,var(--card)_62%,transparent)] px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <CoinLogo symbol={r.base} size={26} />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-[var(--foreground)]">{r.pair}</div>
                            <div className="mt-0.5 text-[11px] text-[var(--muted)]">
                              <span className="font-mono font-semibold text-[var(--foreground)]">{r.price}</span>
                            </div>
                          </div>
                        </div>
                        <div
                          className={
                            "shrink-0 rounded-full border border-[var(--border)] px-3 py-1 text-[11px] font-semibold " +
                            (up
                              ? "bg-[var(--up-bg)] text-[var(--up)]"
                              : "bg-[var(--down-bg)] text-[var(--down)]")
                          }
                        >
                          {up ? "+" : ""}
                          {r.changePct.toFixed(2)}%
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Right: form (mobile becomes single-card by including intro) */}
        <div
          className="fade-in-up relative rounded-3xl p-[1px] shadow-[var(--shadow-2)]"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--accent) 38%, transparent), color-mix(in srgb, var(--accent-2) 34%, transparent))",
          }}
        >
          <section className="relative rounded-3xl border border-[color-mix(in_srgb,var(--border)_70%,transparent)] bg-[var(--card)] p-7">
            <MobileIntro title={title} subtitle={subtitle} />

            <div className="mt-6 lg:mt-0">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">Account</div>
                  <div className="mt-1 text-lg font-extrabold tracking-tight text-[var(--foreground)]">Secure sign-in</div>
                </div>
                {switchHref && switchLabel && (
                  <Link
                    href={switchHref}
                    className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--card-2)]"
                  >
                    {switchLabel}
                  </Link>
                )}
              </div>
              {switchHint && <div className="mt-2 hidden text-xs text-[var(--muted)] lg:block">{switchHint}</div>}

              <div className="mt-6">{children}</div>

              <div className="mt-8 text-xs text-[var(--muted)]">
              By continuing, you agree to the platform policies and acknowledge trading risk.
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
