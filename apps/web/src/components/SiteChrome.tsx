"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoMark } from "@/components/LogoMark";
import { Avatar } from "@/components/Avatar";
import { fetchJsonOrThrow, ApiError } from "@/lib/api/client";

function withDevUserHeader(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  if (typeof window !== "undefined") {
    const uid = localStorage.getItem("ts_user_id") ?? localStorage.getItem("pp_user_id");
    if (uid && !headers.has("x-user-id")) headers.set("x-user-id", uid);
  }
  return { ...init, headers, credentials: init?.credentials ?? "same-origin" };
}

function initials2(label: string): string {
  const s = String(label ?? "").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/g).filter(Boolean);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]!.slice(0, 1) + parts[parts.length - 1]!.slice(0, 1)).toUpperCase();
}

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

  const [profile, setProfile] = useState<
    | {
        user?: {
          id: string;
          email: string | null;
          display_name: string | null;
          role: string;
          status: string;
          kyc_level: string;
          email_verified: boolean;
          totp_enabled: boolean;
          country: string | null;
          created_at: string;
        };
      }
    | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await fetchJsonOrThrow<{ user?: any }>("/api/account/profile", withDevUserHeader({ cache: "no-store" }));
        if (!cancelled) setProfile(p);
      } catch (e) {
        if (cancelled) return;
        // Not logged in is fine; keep it null.
        if (e instanceof ApiError && (e.code === "unauthorized" || e.code === "missing_x_user_id")) return;
        // Swallow other errors to avoid header flicker.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const userLabel = useMemo(() => {
    const u = profile?.user;
    const name = String(u?.display_name ?? "").trim();
    const email = String(u?.email ?? "").trim();
    return name || email || "Account";
  }, [profile]);

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
            <div className="relative group">
              <Link
                href="/account"
                aria-label="Account"
                className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg)] pr-2 pl-1 py-1 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-2)] transition-colors"
                title={userLabel}
              >
                <Avatar
                  seed={String(profile?.user?.email ?? profile?.user?.id ?? "account")}
                  label={userLabel}
                  size={28}
                  fallbackText={initials2(userLabel)}
                  className="bg-[var(--bg)]"
                />
                <span className="hidden lg:block text-xs font-semibold max-w-[140px] truncate">
                  {userLabel}
                </span>
              </Link>

              {/* Hover card (desktop) */}
              <div className="pointer-events-none absolute right-0 top-full mt-2 w-[260px] opacity-0 translate-y-1 transition group-hover:pointer-events-auto group-hover:opacity-100 group-hover:translate-y-0">
                <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-2)]">
                  <div
                    className="pointer-events-none absolute inset-0 opacity-70"
                    style={{
                      background:
                        "radial-gradient(420px 160px at 20% 0%, color-mix(in oklab, var(--accent) 16%, transparent) 0%, transparent 60%), radial-gradient(320px 140px at 90% 10%, color-mix(in oklab, var(--accent-2) 12%, transparent) 0%, transparent 55%)",
                    }}
                  />
                  <div className="relative px-3 py-2.5">
                    {profile?.user ? (
                      <>
                        <div className="text-xs font-semibold text-[var(--foreground)] truncate">
                          {String(profile.user.display_name ?? "").trim() || "Account"}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[var(--muted)] truncate">
                          {profile.user.email ?? profile.user.id}
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-[var(--muted)]">
                          <div>
                            <div className="font-semibold text-[var(--muted)]">Role</div>
                            <div className="mt-0.5 text-[var(--foreground)]">{String(profile.user.role ?? "user")}</div>
                          </div>
                          <div>
                            <div className="font-semibold text-[var(--muted)]">KYC</div>
                            <div className="mt-0.5 text-[var(--foreground)]">{String(profile.user.kyc_level ?? "none")}</div>
                          </div>
                        </div>
                        <div className="mt-2 text-[10px] text-[var(--muted)]">
                          Status: <span className="text-[var(--foreground)]">{String(profile.user.status ?? "")}</span>
                        </div>
                        <div className="mt-2 text-[10px] text-[var(--muted)]">
                          View settings →
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-xs font-semibold text-[var(--foreground)]">Not logged in</div>
                        <div className="mt-0.5 text-[11px] text-[var(--muted)]">Open Account to sign in</div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </nav>

          {/* Mobile Toggle */}
          <div className="ml-auto flex items-center gap-4 md:hidden">
            <NotificationBell />
            <ThemeToggle />
            <Link
              href="/account"
              aria-label="Account"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--card-2)]"
              title={userLabel}
            >
              <Avatar
                seed={String(profile?.user?.email ?? profile?.user?.id ?? "account")}
                label={userLabel}
                size={26}
                fallbackText={initials2(userLabel)}
                className="bg-[var(--bg)]"
              />
            </Link>
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
