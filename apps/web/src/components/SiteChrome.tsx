"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoMark } from "@/components/LogoMark";

const products = [
  { href: "/markets", label: "Markets" },
  { href: "/exchange", label: "Spot" },
  { href: "/p2p", label: "P2P" },
  { href: "/express", label: "Express" },
  { href: "/arbitrage", label: "Arbitrage" },
  { href: "/copy-trading", label: "Copy Trade" },
] as const;

const tools = [
  { href: "/portfolio", label: "Portfolio" },
  { href: "/wallet", label: "Wallet" },
  { href: "/connections", label: "Connections" },
  { href: "/order-history", label: "Orders" },
  { href: "/ai", label: "AI Advisor" },
] as const;

export function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const NLink = ({
    href,
    label,
    onClick,
    className,
  }: {
    href: string;
    label: string;
    onClick?: () => void;
    className?: string;
  }) => {
    const active = pathname === href || (href !== "/" && pathname?.startsWith(href + "/"));
    return (
      <Link
        href={href}
        onClick={onClick}
        className={
          (className ? className + " " : "") +
          "rounded-lg px-2 py-1 text-sm font-semibold transition-colors " +
          (active
            ? "bg-[color-mix(in_srgb,var(--accent)_10%,var(--card))] text-[var(--foreground)]"
            : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-2)]")
        }
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="flex min-h-screen flex-col font-sans text-[var(--foreground)]">
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur-md">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 opacity-70"
          style={{
            background:
              "radial-gradient(800px 240px at 20% 0%, color-mix(in oklab, var(--accent) 14%, transparent) 0%, transparent 60%), radial-gradient(520px 220px at 90% 10%, color-mix(in oklab, var(--accent-2) 10%, transparent) 0%, transparent 55%)",
          }}
        />

        <div className="relative mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-2 gap-y-2 px-4 py-3 lg:gap-x-4 lg:px-6 xl:flex-nowrap">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 transition hover:opacity-80">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-xl text-[var(--accent)]"
              style={{
                background: "color-mix(in srgb, var(--background) 35%, transparent)",
                boxShadow: "var(--glow)",
                backdropFilter: "blur(12px)",
              }}
            >
              <LogoMark size={18} className="opacity-95" />
            </div>
            <span className="hidden text-lg font-bold tracking-tight lg:block">TradeSynapse</span>
          </Link>

          {/* Desktop Product Nav */}
          <nav className="hidden items-center gap-1 md:flex lg:gap-1.5">
            {products.map((p) => (
              <NLink
                key={p.href}
                {...p}
                className={
                  p.href === "/copy-trading"
                    ? "hidden xl:inline"
                    : p.href === "/arbitrage" || p.href === "/express"
                      ? "hidden lg:inline"
                      : ""
                }
              />
            ))}
          </nav>

          {/* Desktop User Nav */}
          <nav className="hidden ml-auto items-center gap-2 md:flex lg:gap-3">
            {tools.map((t) => (
              <NLink
                key={t.href}
                {...t}
                className={
                  t.href === "/ai"
                    ? "hidden xl:inline"
                    : t.href === "/connections"
                      ? "hidden lg:inline"
                      : ""
                }
              />
            ))}
            <div className="h-4 w-px bg-[var(--border)]" />
            <NotificationBell />
            <ThemeToggle />
            <Link
              href="/account"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-2)] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </Link>
          </nav>

          {/* Mobile Toggle */}
          <div className="ml-auto flex items-center gap-4 md:hidden">
            <NotificationBell />
            <ThemeToggle />
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="group flex h-9 w-9 flex-col items-center justify-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--card-2)]"
              aria-label="Menu"
            >
              <span className={`h-0.5 w-4 bg-current transition-all ${mobileOpen ? "rotate-45 translate-y-1.5" : ""}`} />
              <span className={`h-0.5 w-4 bg-current transition-all ${mobileOpen ? "opacity-0" : ""}`} />
              <span className={`h-0.5 w-4 bg-current transition-all ${mobileOpen ? "-rotate-45 -translate-y-1.5" : ""}`} />
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        {mobileOpen && (
          <div className="border-t border-[var(--border)] bg-[var(--background)] px-6 py-4 md:hidden animate-in slide-in-from-top-2">
            <nav className="grid gap-4 text-base">
              <div className="font-semibold text-[var(--muted)] text-xs uppercase tracking-wider">Products</div>
              {products.map((p) => (
                <Link key={p.href} href={p.href} onClick={() => setMobileOpen(false)} className="block py-1">
                  {p.label}
                </Link>
              ))}
              <div className="my-2 h-px bg-[var(--border)]" />
              <div className="font-semibold text-[var(--muted)] text-xs uppercase tracking-wider">Account</div>
              {tools.map((t) => (
                <Link key={t.href} href={t.href} onClick={() => setMobileOpen(false)} className="block py-1">
                  {t.label}
                </Link>
              ))}
              <Link href="/account" onClick={() => setMobileOpen(false)} className="block py-1">
                Settings
              </Link>
            </nav>
          </div>
        )}
      </header>

      <div className="flex-1">
        {children}
      </div>

      <footer className="relative border-t border-[var(--border)] bg-[var(--card)]/30 py-12 text-center text-sm text-[var(--muted)] overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(900px 320px at 15% 0%, color-mix(in oklab, var(--accent) 12%, transparent) 0%, transparent 60%), radial-gradient(600px 260px at 90% 15%, color-mix(in oklab, var(--accent-2) 10%, transparent) 0%, transparent 55%)",
          }}
        />

        <div className="relative mx-auto w-full max-w-7xl px-6 grid gap-8 md:grid-cols-4 text-left">
          <div className="space-y-3">
             <div className="flex items-center gap-2 font-bold text-[var(--foreground)]">
                <span className="h-4 w-4 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] rounded-sm"></span>
                TradeSynapse
             </div>
             <p className="text-xs leading-relaxed max-w-[200px]">
               Next-generation spot trading platform with built-in P2P execution and AI-driven risk management.
             </p>
             <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-[10px] font-semibold text-[var(--muted)]">
               <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
               Synapse network online
             </div>
          </div>
          <div>
            <h4 className="font-medium text-[var(--foreground)] mb-3">Exchange</h4>
            <ul className="space-y-2 text-xs">
              <li><Link href="/markets" className="hover:text-[var(--accent)]">Markets</Link></li>
              <li><Link href="/exchange" className="hover:text-[var(--accent)]">Spot Trading</Link></li>
              <li><Link href="/p2p" className="hover:text-[var(--accent)]">P2P Express</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-[var(--foreground)] mb-3">Earn & Learn</h4>
            <ul className="space-y-2 text-xs">
              <li><Link href="/arbitrage" className="hover:text-[var(--accent)]">Arbitrage Scanner</Link></li>
              <li><Link href="/copy-trading" className="hover:text-[var(--accent)]">Copy Trading</Link></li>
              <li><Link href="/ai" className="hover:text-[var(--accent)]">Security Center</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-[var(--foreground)] mb-3">Support</h4>
            <ul className="space-y-2 text-xs">
               <li><Link href="/support/help" className="hover:text-[var(--accent)]">Help Center</Link></li>
               <li><Link href="/support/api" className="hover:text-[var(--accent)]">API Documentation</Link></li>
               <li><Link href="/support/fees" className="hover:text-[var(--accent)]">Fees</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-12 text-xs border-t border-[var(--border)] pt-8">
           © 2026 TradeSynapse. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
