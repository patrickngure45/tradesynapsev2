"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type ProfileUser = {
  id: string;
  email: string | null;
  display_name: string | null;
  kyc_level: string;
  email_verified: boolean;
  totp_enabled: boolean;
  country: string | null;
  created_at: string;
};

type BalanceRow = {
  asset_id: string;
  chain: string;
  symbol: string;
  decimals: number;
  posted: string;
  held: string;
  available: string;
};

function safeNum(v: unknown): number {
  const n = typeof v === "string" ? Number.parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
}

function defaultFiatForCountry(country: string | null | undefined): string {
  const c = (country ?? "").trim().toUpperCase();
  // Practical defaults for common regions; user can change in P2P UI.
  if (c === "KE") return "KES";
  if (c === "UG") return "UGX";
  if (c === "TZ") return "TZS";
  if (c === "RW") return "RWF";
  return "USD";
}

export function NewUserGuide() {
  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [balances, setBalances] = useState<BalanceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"beginner" | "advanced" | null>(null);

  const loading = profile === null || balances === null;

  useEffect(() => {
    try {
      const v = localStorage.getItem("ts_onboarding_mode");
      if (v === "advanced" || v === "beginner") setMode(v);
      else setMode("beginner");
    } catch {
      setMode("beginner");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [pRes, bRes] = await Promise.all([
          fetch("/api/account/profile", { credentials: "include", cache: "no-store" }),
          fetch("/api/exchange/balances", { credentials: "include", cache: "no-store" }),
        ]);

        if (!pRes.ok) throw new Error("profile");
        if (!bRes.ok) throw new Error("balances");

        const pJson = (await pRes.json()) as { user?: ProfileUser };
        const bJson = (await bRes.json()) as { balances?: BalanceRow[] };

        if (cancelled) return;
        setProfile(pJson.user ?? null);
        setBalances(bJson.balances ?? []);
      } catch {
        if (cancelled) return;
        setError("Could not load onboarding status");
        setProfile({
          id: "",
          email: null,
          display_name: null,
          kyc_level: "unknown",
          email_verified: false,
          totp_enabled: false,
          country: null,
          created_at: new Date().toISOString(),
        });
        setBalances([]);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalAvailable = useMemo(() => {
    return (balances ?? []).reduce((sum, b) => sum + safeNum(b.available), 0);
  }, [balances]);

  const hasAnyFunds = totalAvailable > 0;
  const needsEmail = profile ? !profile.email_verified : false;
  const needsTotp = profile ? !profile.totp_enabled : false;
  const fiat = defaultFiatForCountry(profile?.country);

  // Show guide if user has no funds yet OR hasn’t verified email.
  const show = !loading && (needsEmail || !hasAnyFunds);

  // Respect user's preference: advanced users can hide the beginner guide.
  if (mode === "advanced") return null;

  if (!show) return null;

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-[var(--shadow)]">
      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-[var(--foreground)]">Start here (beginner-friendly)</h2>
        <p className="text-sm text-[var(--muted)]">
          We’ll guide you from Mobile Money / Bank Transfer → USDT → your first trade, with safety checks.
        </p>
        {error && <p className="text-xs text-[var(--down)]">{error}</p>}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
          <div className="text-xs font-semibold text-[var(--muted)]">Step 1</div>
          <div className="mt-1 text-sm font-medium text-[var(--foreground)]">Verify your email</div>
          <div className="mt-1 text-xs text-[var(--muted)]">
            Unlock withdrawals and sensitive actions.
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Link
              href="/account"
              className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
            >
              Account settings
            </Link>
            <span className={`text-xs ${needsEmail ? "text-[var(--warn)]" : "text-[var(--up)]"}`}>
              {needsEmail ? "Pending" : "Done"}
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
          <div className="text-xs font-semibold text-[var(--muted)]">Step 2</div>
          <div className="mt-1 text-sm font-medium text-[var(--foreground)]">Add money (P2P)</div>
          <div className="mt-1 text-xs text-[var(--muted)]">
            Buy USDT from a seller; pay via mobile money or bank transfer. Crypto is released into your wallet after payment.
          </div>
          <div className="mt-3">
            <Link
              href={`/p2p?side=BUY&asset=USDT&fiat=${encodeURIComponent(fiat)}`}
              className="inline-flex rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
            >
              Buy USDT ({fiat})
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
          <div className="text-xs font-semibold text-[var(--muted)]">Step 3</div>
          <div className="mt-1 text-sm font-medium text-[var(--foreground)]">Make your first small trade</div>
          <div className="mt-1 text-xs text-[var(--muted)]">
            Start small. Prices move fast; prefer limit orders if you want a guaranteed price.
          </div>
          <div className="mt-3 text-xs text-[var(--muted)]">
            Tip: Once you have USDT, select a market like BTC/USDT and place a small buy.
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
          <div className="text-xs font-semibold text-[var(--muted)]">Step 4</div>
          <div className="mt-1 text-sm font-medium text-[var(--foreground)]">Secure your account (TOTP)</div>
          <div className="mt-1 text-xs text-[var(--muted)]">
            Required for sensitive actions like withdrawals.
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Link
              href="/account"
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--card)]"
            >
              Set up 2FA
            </Link>
            <span className={`text-xs ${needsTotp ? "text-[var(--warn)]" : "text-[var(--up)]"}`}>
              {needsTotp ? "Recommended" : "Enabled"}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 text-xs text-[var(--muted)]">
        Advanced: if you already have exchange API keys, you can connect them in Connections.
        <Link href="/connections" className="ml-1 text-[var(--accent)] hover:underline">
          Connect keys
        </Link>
        .
      </div>
    </section>
  );
}
