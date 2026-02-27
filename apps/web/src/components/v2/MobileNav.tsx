"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type Item = { href: string; label: string };

const items: Item[] = [
  { href: "/markets", label: "Mkts" },
  { href: "/trade", label: "Trade" },
  { href: "/p2p", label: "P2P" },
  { href: "/orders", label: "Orders" },
  { href: "/wallet", label: "Wallet" },
  { href: "/account", label: "Acct" },
];

export function MobileNav({ basePath = "" }: { basePath?: string }) {
  const pathname = usePathname() ?? "";
  const [unread, setUnread] = useState<number>(0);
  const esRef = useRef<EventSource | null>(null);

  const accountHref = useMemo(() => `${basePath}/account`, [basePath]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/notifications?limit=1", { cache: "no-store", credentials: "include" });
        const json = (await res.json().catch(() => null)) as any;
        if (!res.ok) {
          if (alive) setUnread(0);
          return;
        }
        const n = Number(json?.unread_count ?? 0);
        if (alive) setUnread(Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0);
      } catch {
        if (alive) setUnread(0);
      }
    };

    const stopSse = () => {
      try {
        esRef.current?.close();
      } catch {
        // ignore
      }
      esRef.current = null;
    };

    const startSse = () => {
      if (typeof window === "undefined") return;
      if (document.visibilityState !== "visible") return;
      if (esRef.current) return;
      try {
        const es = new EventSource("/api/notifications/stream", { withCredentials: true } as any);
        es.addEventListener("notification", () => {
          if (!alive) return;
          setUnread((n) => Math.min(999, (Number.isFinite(n) ? n : 0) + 1));
        });
        es.addEventListener("ready", () => {
          // resync count on connect
          void load();
        });
        es.onerror = () => {
          // Let it retry automatically; still keep polling for correctness.
        };
        esRef.current = es;
      } catch {
        // ignore; polling will still work
      }
    };

    void load();
    startSse();
    const id = window.setInterval(load, 25_000);
    const onVis = () => {
      if (document.visibilityState === "visible") {
        startSse();
        void load();
      } else {
        stopSse();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      alive = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      stopSse();
    };
  }, []);

  return (
    <>
      {/* Mobile Dock (bottom) */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--v2-border)] bg-[var(--v2-surface)]/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Primary"
      >
        <div className="mx-auto grid max-w-xl grid-cols-3 gap-1 px-2 py-2 sm:grid-cols-6">
          {items.map((it) => {
            const href = `${basePath}${it.href}`;
            const active = pathname === href || pathname.startsWith(`${href}/`);
            const showBadge = href === accountHref && unread > 0;
            return (
              <Link
                key={href}
                href={href}
                className={
                  "relative flex h-10 flex-col items-center justify-center rounded-xl px-1 text-[10px] font-semibold sm:h-11 " +
                  (active
                    ? "bg-[var(--v2-surface-2)] text-[var(--v2-text)]"
                    : "text-[var(--v2-muted)] hover:bg-[var(--v2-surface-2)]/60")
                }
              >
                <span className="leading-none">{it.label}</span>
                {showBadge ? (
                  <span
                    className="absolute right-2 top-2 min-w-[16px] rounded-full border border-[var(--v2-border)] bg-[var(--v2-warn-bg)] px-1 text-[10px] font-extrabold leading-[14px] text-[var(--v2-warn)]"
                    aria-label={`${unread} unread notifications`}
                  >
                    {unread > 99 ? "99+" : String(unread)}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Desktop Dock (left rail) */}
      <nav
        className="fixed left-0 top-0 z-40 hidden h-dvh w-24 border-r border-[var(--v2-border)] bg-[var(--v2-surface)]/85 backdrop-blur md:flex md:flex-col"
        aria-label="Primary"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          aria-hidden
          style={{
            backgroundImage:
              "radial-gradient(circle at 22% 18%, color-mix(in_srgb,var(--v2-accent)_40%,transparent) 0, transparent 55%), radial-gradient(circle at 70% 62%, color-mix(in_srgb,var(--v2-accent-2)_26%,transparent) 0, transparent 60%), radial-gradient(circle at 35% 92%, color-mix(in_srgb,var(--v2-ring)_32%,transparent) 0, transparent 60%)",
          }}
        />

        <div className="px-3 pt-4">
          <Link
            href={`${basePath}/wallet`}
            className="flex items-center gap-2 rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 text-[12px] font-extrabold text-[var(--v2-text)] hover:bg-[var(--v2-surface)]"
          >
            <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
              <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--v2-accent)]" />
              <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--v2-ring)]" />
            </span>
            <span className="tracking-tight">CW</span>
          </Link>
          <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--v2-muted)]">CoinWaka</div>
        </div>

        <div className="mt-4 flex flex-1 flex-col gap-2 px-3">
          {items.map((it) => {
            const href = `${basePath}${it.href}`;
            const active = pathname === href || pathname.startsWith(`${href}/`);
            const showBadge = href === accountHref && unread > 0;
            return (
              <Link
                key={href}
                href={href}
                className={
                  "relative flex h-12 flex-col items-center justify-center rounded-2xl px-2 text-[11px] font-semibold " +
                  (active
                    ? "bg-[var(--v2-surface-2)] text-[var(--v2-text)]"
                    : "text-[var(--v2-muted)] hover:bg-[var(--v2-surface-2)]/60")
                }
                title={it.label}
              >
                <span className="leading-none">{it.label}</span>
                {showBadge ? (
                  <span
                    className="absolute right-2 top-2 min-w-[16px] rounded-full border border-[var(--v2-border)] bg-[var(--v2-warn-bg)] px-1 text-[10px] font-extrabold leading-[14px] text-[var(--v2-warn)]"
                    aria-label={`${unread} unread notifications`}
                  >
                    {unread > 99 ? "99+" : String(unread)}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>

        <div className="px-3 pb-4">
          <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 text-center text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--v2-muted)]">
            Waka
          </div>
        </div>
      </nav>
    </>
  );
}
