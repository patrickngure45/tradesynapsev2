"use client";

import { useCallback, useEffect, useState } from "react";

/* ── Types ──────────────────────────────────────────────────────────── */

type Leader = {
  id: string;
  display_name: string;
  bio: string;
  total_followers: string;
  total_pnl_pct: string;
  win_rate: string;
};

type Sub = {
  id: string;
  leader_id: string;
  leader_name: string;
  status: string;
  copy_ratio: string;
  max_per_trade: string | null;
};

type SortKey = "pnl" | "followers" | "winRate";

/* ── Helpers ────────────────────────────────────────────────────────── */

function getStoredUserId(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem("ts_user_id") ?? "";
  } catch {
    return "";
  }
}

function pnlBadge(pnl: number) {
  const up = pnl >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-mono text-xs font-bold ${up ? "text-[var(--up)]" : "text-[var(--down)]"}`}
    >
      {up ? "▲" : "▼"} {up ? "+" : ""}
      {pnl.toFixed(2)}%
    </span>
  );
}

function winRateRing(rate: number) {
  const r = 18;
  const circ = 2 * Math.PI * r;
  const offset = circ - (rate / 100) * circ;
  const color = rate >= 60 ? "var(--up)" : rate >= 40 ? "#eab308" : "var(--down)";
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" className="shrink-0">
      <circle cx="22" cy="22" r={r} fill="none" stroke="var(--border)" strokeWidth="4" />
      <circle
        cx="22"
        cy="22"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 22 22)"
      />
      <text
        x="22"
        y="23"
        textAnchor="middle"
        dominantBaseline="middle"
        fill={color}
        fontSize="10"
        fontWeight="bold"
        fontFamily="monospace"
      >
        {rate.toFixed(0)}%
      </text>
    </svg>
  );
}

function rankBadge(idx: number) {
  if (idx > 2) return null;
  const medals = ["🥇", "🥈", "🥉"];
  return <span className="text-lg leading-none">{medals[idx]}</span>;
}

/* ── Component ──────────────────────────────────────────────────────── */

export function CopyTradingClient() {
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [mySubs, setMySubs] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Register form
  const [showRegister, setShowRegister] = useState(false);
  const [regName, setRegName] = useState("");
  const [regBio, setRegBio] = useState("");

  // Subscribe form
  const [subscribeLeaderId, setSubscribeLeaderId] = useState<string | null>(null);
  const [subRatio, setSubRatio] = useState("1.0");
  const [subMax, setSubMax] = useState("");

  // Action loading states
  const [regLoading, setRegLoading] = useState(false);
  const [subLoading, setSubLoading] = useState(false);
  const [pauseLoading, setPauseLoading] = useState<string | null>(null);

  // Sorting & search
  const [sortKey, setSortKey] = useState<SortKey>("pnl");
  const [search, setSearch] = useState("");

  const fetchAll = useCallback(async () => {
    try {
      const uid = getStoredUserId();
      const hdrs: Record<string, string> = uid ? { "x-user-id": uid } : {};
      const [leadersRes, subsRes] = await Promise.all([
        fetch("/api/exchange/copy-trading/leaders", { credentials: "include", headers: hdrs }),
        fetch("/api/exchange/copy-trading/subscriptions", { credentials: "include", headers: hdrs }),
      ]);
      if (leadersRes.ok) {
        const data = await leadersRes.json();
        setLeaders(data.leaders || []);
      }
      if (subsRes.ok) {
        const data = await subsRes.json();
        setMySubs(data.subscriptions || []);
      }
    } catch {
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleRegister = async () => {
    setRegLoading(true);
    try {
      const res = await fetch("/api/exchange/copy-trading/leaders", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": getStoredUserId(),
        },
        body: JSON.stringify({
          displayName: regName,
          bio: regBio,
        }),
      });
      if (res.ok) {
        setShowRegister(false);
        setRegName("");
        setRegBio("");
        fetchAll();
      } else {
        const data = await res.json();
        setError(data.error ?? "Registration failed");
      }
    } catch {
      setError("Registration failed");
    } finally {
      setRegLoading(false);
    }
  };

  const handleSubscribe = async (leaderId: string) => {
    setSubLoading(true);
    try {
      const res = await fetch("/api/exchange/copy-trading/subscriptions", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": getStoredUserId(),
        },
        body: JSON.stringify({
          leaderId,
          copyRatio: parseFloat(subRatio) || 1.0,
          maxPerTrade: subMax ? parseFloat(subMax) : undefined,
        }),
      });
      if (res.ok) {
        setSubscribeLeaderId(null);
        setSubRatio("1.0");
        setSubMax("");
        fetchAll();
      } else {
        const data = await res.json();
        setError(data.error ?? "Subscribe failed");
      }
    } catch {
      setError("Subscribe failed");
    } finally {
      setSubLoading(false);
    }
  };

  const handlePause = async (subId: string, newStatus: string) => {
    setPauseLoading(subId);
    try {
      await fetch("/api/exchange/copy-trading/subscriptions", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": getStoredUserId(),
        },
        body: JSON.stringify({ subscriptionId: subId, status: newStatus }),
      });
      fetchAll();
    } catch {
      setError("Failed to update subscription");
    } finally {
      setPauseLoading(null);
    }
  };

  /* Derived data */
  const activeSubs = mySubs.filter((s) => s.status === "active");
  const pausedSubs = mySubs.filter((s) => s.status === "paused");
  const sortedLeaders = [...leaders]
    .filter((l) => !search || l.display_name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      switch (sortKey) {
        case "pnl":
          return parseFloat(b.total_pnl_pct) - parseFloat(a.total_pnl_pct);
        case "followers":
          return parseInt(b.total_followers) - parseInt(a.total_followers);
        case "winRate":
          return parseFloat(b.win_rate) - parseFloat(a.win_rate);
      }
    });

  if (loading) {
    return (
      <div className="space-y-4 py-8">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--card)]"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-xs underline opacity-70 hover:opacity-100"
          >
            dismiss
          </button>
        </div>
      )}

      {/* ── Summary Stats ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Leaders", value: leaders.length, icon: "👑" },
          { label: "Following", value: activeSubs.length, icon: "📡" },
          { label: "Paused", value: pausedSubs.length, icon: "⏸️" },
          {
            label: "Best PnL",
            value:
              leaders.length > 0
                ? `${parseFloat(leaders.reduce((best, l) => (parseFloat(l.total_pnl_pct) > parseFloat(best.total_pnl_pct) ? l : best), leaders[0]).total_pnl_pct).toFixed(1)}%`
                : "—",
            icon: "🏆",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-center"
          >
            <div className="text-lg">{stat.icon}</div>
            <div className="mt-1 text-lg font-bold">{stat.value}</div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* ── My Subscriptions ───────────────────────────────────────── */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-medium">My Copy Trading</h3>
          <span className="rounded-full bg-[var(--accent)]/20 px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]">
            {mySubs.filter((s) => s.status !== "stopped").length} active
          </span>
        </div>
        {mySubs.filter((s) => s.status !== "stopped").length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <div className="text-3xl">📋</div>
            <p className="text-sm text-[var(--muted)]">
              Not following any traders yet. Browse leaders below to start copy trading.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {mySubs
              .filter((s) => s.status !== "stopped")
              .map((sub) => (
                <div
                  key={sub.id}
                  className="group flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-3 transition hover:border-[var(--accent)]/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)]/15 text-sm font-bold text-[var(--accent)]">
                      {(sub.leader_name || "L")[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium">{sub.leader_name || "Leader"}</div>
                      <div className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
                        <span className="font-mono">{sub.copy_ratio}x</span>
                        <span className="opacity-40">·</span>
                        <span>
                          {sub.max_per_trade ? `Max $${sub.max_per_trade}` : "No limit"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        sub.status === "active"
                          ? "bg-[var(--up)]/15 text-[var(--up)]"
                          : sub.status === "paused"
                            ? "bg-yellow-500/15 text-yellow-400"
                            : "bg-gray-500/15 text-gray-400"
                      }`}
                    >
                      {sub.status}
                    </span>
                    <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                      {sub.status === "active" && (
                        <button
                          onClick={() => handlePause(sub.id, "paused")}
                          disabled={pauseLoading === sub.id}
                          className="rounded px-2 py-1 text-xs text-yellow-400 hover:bg-yellow-500/10 disabled:opacity-50"
                          title="Pause"
                        >
                          ⏸
                        </button>
                      )}
                      {sub.status === "paused" && (
                        <button
                          onClick={() => handlePause(sub.id, "active")}
                          disabled={pauseLoading === sub.id}
                          className="rounded px-2 py-1 text-xs text-[var(--up)] hover:bg-[var(--up)]/10 disabled:opacity-50"
                          title="Resume"
                        >
                          ▶
                        </button>
                      )}
                      <button
                        onClick={() => handlePause(sub.id, "stopped")}
                        disabled={pauseLoading === sub.id}
                        className="rounded px-2 py-1 text-xs text-[var(--down)] hover:bg-[var(--down)]/10 disabled:opacity-50"
                        title="Stop"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* ── Leaderboard ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-medium">Top Traders</h3>
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <svg
                className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-36 rounded-lg border border-[var(--border)] bg-transparent py-1.5 pl-8 pr-2 text-xs focus:border-[var(--accent)] focus:outline-none"
              />
            </div>

            {/* Sort */}
            <div className="flex rounded-lg border border-[var(--border)] text-[10px]">
              {(
                [
                  ["pnl", "PnL"],
                  ["followers", "Followers"],
                  ["winRate", "Win %"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSortKey(key)}
                  className={`px-2.5 py-1.5 transition first:rounded-l-lg last:rounded-r-lg ${
                    sortKey === key
                      ? "bg-[var(--accent)] text-white"
                      : "text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowRegister(!showRegister)}
              className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-medium text-[var(--accent)] transition hover:bg-[var(--accent)]/20"
            >
              {showRegister ? "Cancel" : "Become a Leader"}
            </button>
          </div>
        </div>

        {/* Register form */}
        {showRegister && (
          <div className="mb-4 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4">
            <h4 className="mb-3 text-sm font-medium">Register as Copy Trading Leader</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="text"
                placeholder="Display name"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                className="rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm focus:border-[var(--accent)] focus:outline-none"
              />
              <textarea
                placeholder="Bio — tell followers about your strategy (optional)"
                value={regBio}
                onChange={(e) => setRegBio(e.target.value)}
                className="rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm focus:border-[var(--accent)] focus:outline-none"
                rows={1}
              />
            </div>
            <button
              onClick={handleRegister}
              disabled={!regName.trim() || regLoading}
              className="mt-3 rounded-lg bg-[var(--accent)] px-5 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent)]/80 disabled:opacity-40"
            >
              {regLoading ? "Registering…" : "Register"}
            </button>
          </div>
        )}

        {sortedLeaders.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <div className="text-3xl">👥</div>
            <p className="text-sm text-[var(--muted)]">
              {search
                ? "No leaders match your search."
                : "No public leaders yet. Be the first to register!"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedLeaders.map((leader, idx) => {
              const pnl = parseFloat(leader.total_pnl_pct);
              const winRate = parseFloat(leader.win_rate);
              const followers = parseInt(leader.total_followers);
              const isSubscribing = subscribeLeaderId === leader.id;
              const alreadyFollowing = mySubs.some(
                (s) => s.leader_id === leader.id && s.status !== "stopped",
              );

              return (
                <div
                  key={leader.id}
                  className={`group rounded-xl border bg-[var(--background)] p-4 transition ${
                    alreadyFollowing
                      ? "border-[var(--up)]/30"
                      : "border-[var(--border)] hover:border-[var(--accent)]/30"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* Avatar + rank */}
                    <div className="relative shrink-0">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)]/15 text-lg font-bold text-[var(--accent)]">
                        {leader.display_name[0]?.toUpperCase() ?? "?"}
                      </div>
                      {sortKey === "pnl" && (
                        <div className="absolute -right-1 -top-1">{rankBadge(idx)}</div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold">
                          {leader.display_name}
                        </span>
                        {alreadyFollowing && (
                          <span className="rounded-full bg-[var(--up)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--up)]">
                            FOLLOWING
                          </span>
                        )}
                      </div>
                      {leader.bio && (
                        <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                          {leader.bio}
                        </p>
                      )}

                      {/* Stats row */}
                      <div className="mt-2 flex flex-wrap items-center gap-4">
                        {/* PnL */}
                        <div className="flex flex-col items-center gap-0.5">
                          {pnlBadge(pnl)}
                          <span className="text-[9px] uppercase tracking-wider text-[var(--muted)]">
                            PnL
                          </span>
                        </div>

                        {/* Win rate ring */}
                        <div className="flex flex-col items-center gap-0.5">
                          {winRateRing(winRate)}
                          <span className="text-[9px] uppercase tracking-wider text-[var(--muted)]">
                            Win
                          </span>
                        </div>

                        {/* Followers */}
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="font-mono text-sm font-bold">{followers}</span>
                          <span className="text-[9px] uppercase tracking-wider text-[var(--muted)]">
                            Followers
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action */}
                    <div className="shrink-0 pt-1">
                      {!alreadyFollowing ? (
                        <button
                          onClick={() =>
                            setSubscribeLeaderId(isSubscribing ? null : leader.id)
                          }
                          className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
                            isSubscribing
                              ? "border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--accent)]/10"
                              : "bg-[var(--accent)] text-white hover:bg-[var(--accent)]/80"
                          }`}
                        >
                          {isSubscribing ? "Cancel" : "Copy Trader"}
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--up)]/10 px-3 py-2 text-xs font-semibold text-[var(--up)]">
                          <svg
                            className="h-3.5 w-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          Following
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Subscribe form (expanded) */}
                  {isSubscribing && (
                    <div className="mt-4 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-4">
                      <div className="mb-3 text-xs font-medium text-[var(--muted)]">
                        Configure your copy settings for{" "}
                        <span className="text-[var(--foreground)]">{leader.display_name}</span>
                      </div>
                      <div className="flex flex-wrap items-end gap-3">
                        <label className="space-y-1 text-xs">
                          <span className="text-[var(--muted)]">Copy Ratio</span>
                          <div className="flex items-center gap-1">
                            <input
                              type="range"
                              min="0.1"
                              max="5"
                              step="0.1"
                              value={subRatio}
                              onChange={(e) => setSubRatio(e.target.value)}
                              className="h-1.5 w-24 accent-[var(--accent)]"
                            />
                            <span className="w-10 rounded border border-[var(--border)] bg-transparent px-1.5 py-1 text-center font-mono text-xs">
                              {subRatio}x
                            </span>
                          </div>
                        </label>
                        <label className="space-y-1 text-xs">
                          <span className="text-[var(--muted)]">Max per trade</span>
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--muted)]">
                              $
                            </span>
                            <input
                              type="number"
                              placeholder="No limit"
                              value={subMax}
                              onChange={(e) => setSubMax(e.target.value)}
                              className="w-28 rounded border border-[var(--border)] bg-transparent py-1 pl-5 pr-2 text-xs focus:border-[var(--accent)] focus:outline-none"
                            />
                          </div>
                        </label>
                        <button
                          onClick={() => handleSubscribe(leader.id)}
                          disabled={subLoading}
                          className="rounded-lg bg-[var(--up)] px-5 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--up)]/80 disabled:opacity-50"
                        >
                          {subLoading ? "Subscribing…" : "Start Copying"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
