"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";

function titleForPath(pathname: string): { kicker: string; title: string } {
  const p = String(pathname || "/");

  if (p.startsWith("/admin")) {
    const rest = p.replace(/^\/admin\/?/, "");
    const seg = rest.split("/").filter(Boolean);
    const leaf = seg[0] ? seg[0].replace(/-/g, " ") : "dashboard";
    return { kicker: "Operations", title: `Admin · ${capitalizeWords(leaf)}` };
  }

  if (p.startsWith("/v2")) {
    const rest = p.replace(/^\/v2\/?/, "");
    const seg = rest.split("/").filter(Boolean);
    const leaf = seg[0] ?? "home";

    const map: Record<string, { kicker: string; title: string }> = {
      markets: { kicker: "Discover", title: "Markets" },
      trade: { kicker: "Terminal", title: "Trade" },
      orders: { kicker: "History", title: "Orders" },
      wallet: { kicker: "Custody", title: "Wallet" },
      account: { kicker: "Identity", title: "Account" },
      p2p: { kicker: "Escrow", title: "P2P" },
      earn: { kicker: "Yield", title: "Earn" },
      convert: { kicker: "Swap", title: "Convert" },
      copy: { kicker: "Mirror", title: "Copy" },
      dca: { kicker: "Automation", title: "DCA" },
      conditional: { kicker: "Triggers", title: "Conditional" },
    };

    const hit = map[leaf];
    if (hit) return hit;

    return { kicker: "CoinWaka", title: capitalizeWords(leaf.replace(/-/g, " ")) };
  }

  return { kicker: "CoinWaka", title: "" };
}

function capitalizeWords(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.slice(0, 1).toUpperCase() + w.slice(1))
    .join(" ");
}

export function ContextStrip() {
  const pathname = usePathname() ?? "";
  const t = useMemo(() => titleForPath(pathname), [pathname]);

  // Desktop-only: the Dock becomes the navigation anchor.
  return (
    <div className="hidden md:block">
      <div className="mb-4 rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-4 py-3 shadow-[var(--v2-shadow-sm)]">
        <div className="flex items-center gap-3">
          <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
            <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--v2-accent)]" />
            <span className="absolute inline-flex h-5 w-5 rounded-full bg-[var(--v2-ring)]" />
          </span>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--v2-muted)]">
              {t.kicker}
            </div>
            {t.title ? (
              <div className="truncate text-[18px] font-extrabold tracking-tight text-[var(--v2-text)]">
                {t.title}
              </div>
            ) : null}
          </div>
          <div className="h-px flex-1 bg-[color-mix(in_srgb,var(--v2-border)_70%,transparent)]" />
          <div className="rounded-full border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-1 text-[11px] font-semibold text-[var(--v2-muted)]">
            wealth → waka
          </div>
        </div>
      </div>
    </div>
  );
}
