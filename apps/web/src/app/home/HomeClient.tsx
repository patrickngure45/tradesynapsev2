"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJsonOrThrow } from "@/lib/api/client";
import { buttonClassName } from "@/components/ui/Button";
import { formatTokenAmount } from "@/lib/format/amount";

type BalanceRow = {
  asset_id: string;
  chain: string;
  symbol: string;
  decimals: number;
  posted: string;
  held: string;
  available: string;
};

function withDevUserHeader(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  if (typeof window !== "undefined") {
    const uid = localStorage.getItem("ts_user_id") ?? localStorage.getItem("pp_user_id");
    if (uid && !headers.has("x-user-id")) headers.set("x-user-id", uid);
  }
  return { ...init, headers, credentials: init?.credentials ?? "same-origin" };
}

function isNonZero(v: string | null | undefined): boolean {
  const n = typeof v === "string" ? Number(v) : 0;
  return Number.isFinite(n) && n !== 0;
}

export function HomeClient() {
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [watchlist, setWatchlist] = useState<Array<{ id: string; base_symbol: string; created_at: string }>>([]);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [watchlistError, setWatchlistError] = useState<string | null>(null);
  const [newSymbol, setNewSymbol] = useState<string>("");

  const [alerts, setAlerts] = useState<
    Array<{
      id: string;
      base_symbol: string;
      fiat: string;
      direction: string;
      threshold: string;
      status: string;
      cooldown_sec: number;
      last_triggered_at: string | null;
      created_at: string;
    }>
  >([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertSymbol, setAlertSymbol] = useState<string>("");
  const [alertFiat, setAlertFiat] = useState<string>("USD");
  const [alertDirection, setAlertDirection] = useState<"above" | "below">("above");
  const [alertThreshold, setAlertThreshold] = useState<string>("");
  const [alertCooldown, setAlertCooldown] = useState<string>("3600");

  const [notifications, setNotifications] = useState<
    Array<{
      id: string;
      type: string;
      title: string;
      body: string;
      metadata_json: unknown;
      read: boolean;
      created_at: string;
    }>
  >([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [notifLoading, setNotifLoading] = useState(false);

  const [summary, setSummary] = useState<{ open_orders: number; pending_withdrawals: number; active_p2p_orders: number } | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJsonOrThrow<{ balances?: BalanceRow[] }>(
        "/api/exchange/balances",
        withDevUserHeader({ cache: "no-store" }),
      );
      setBalances(Array.isArray(data.balances) ? data.balances : []);
    } catch {
      setBalances([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadWatchlist = useCallback(async () => {
    setWatchlistLoading(true);
    setWatchlistError(null);
    try {
      const data = await fetchJsonOrThrow<{ items?: any[] }>(
        "/api/watchlist",
        withDevUserHeader({ cache: "no-store" }),
      );
      setWatchlist(Array.isArray(data.items) ? (data.items as any[]) : []);
    } catch (e: any) {
      setWatchlist([]);
      setWatchlistError(e?.message ? String(e.message) : "watchlist_failed");
    } finally {
      setWatchlistLoading(false);
    }
  }, []);

  const loadAlerts = useCallback(async () => {
    setAlertsLoading(true);
    try {
      const data = await fetchJsonOrThrow<{ alerts?: any[] }>(
        "/api/alerts",
        withDevUserHeader({ cache: "no-store" }),
      );
      setAlerts(Array.isArray(data.alerts) ? (data.alerts as any[]) : []);
    } catch {
      setAlerts([]);
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    setNotifLoading(true);
    try {
      const data = await fetchJsonOrThrow<{ notifications?: any[]; unread_count?: number }>(
        "/api/notifications?limit=8",
        withDevUserHeader({ cache: "no-store" }),
      );
      setNotifications(Array.isArray(data.notifications) ? (data.notifications as any[]) : []);
      setUnreadCount(Number(data.unread_count ?? 0) || 0);
    } catch {
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setNotifLoading(false);
    }
  }, []);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const data = await fetchJsonOrThrow<{ open_orders?: number; pending_withdrawals?: number; active_p2p_orders?: number }>(
        "/api/home/summary",
        withDevUserHeader({ cache: "no-store" }),
      );
      setSummary({
        open_orders: Number(data.open_orders ?? 0) || 0,
        pending_withdrawals: Number(data.pending_withdrawals ?? 0) || 0,
        active_p2p_orders: Number(data.active_p2p_orders ?? 0) || 0,
      });
    } catch {
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 25_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    loadWatchlist();
    loadAlerts();
    loadNotifications();
    loadSummary();
    const t = setInterval(() => {
      loadWatchlist();
      loadAlerts();
      loadNotifications();
      loadSummary();
    }, 45_000);
    return () => clearInterval(t);
  }, [loadWatchlist, loadAlerts, loadNotifications, loadSummary]);

  const addToWatchlist = async () => {
    const sym = newSymbol.trim().toUpperCase();
    if (!sym) return;
    setWatchlistError(null);
    try {
      await fetchJsonOrThrow(
        "/api/watchlist",
        withDevUserHeader({
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ base_symbol: sym }),
        }),
      );
      setNewSymbol("");
      await loadWatchlist();
    } catch (e: any) {
      setWatchlistError(e?.message ? String(e.message) : "add_failed");
    }
  };

  const removeFromWatchlist = async (base_symbol: string) => {
    setWatchlistError(null);
    try {
      const qs = new URLSearchParams({ base_symbol });
      await fetchJsonOrThrow(
        `/api/watchlist?${qs.toString()}`,
        withDevUserHeader({ method: "DELETE" }),
      );
      await loadWatchlist();
    } catch (e: any) {
      setWatchlistError(e?.message ? String(e.message) : "remove_failed");
    }
  };

  const createAlert = async () => {
    const payload = {
      base_symbol: alertSymbol.trim().toUpperCase(),
      fiat: alertFiat.trim().toUpperCase(),
      direction: alertDirection,
      threshold: alertThreshold,
      cooldown_sec: alertCooldown,
    };

    if (!payload.base_symbol || !payload.threshold) return;
    try {
      await fetchJsonOrThrow(
        "/api/alerts",
        withDevUserHeader({
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );
      setAlertThreshold("");
      await loadAlerts();
    } catch {
      // keep silent; this UI is intentionally minimal
    }
  };

  const deleteAlert = async (id: string) => {
    try {
      const qs = new URLSearchParams({ id });
      await fetchJsonOrThrow(
        `/api/alerts?${qs.toString()}`,
        withDevUserHeader({ method: "DELETE" }),
      );
      await loadAlerts();
    } catch {
      // silent
    }
  };

  const nonZero = useMemo(
    () => balances.filter((b) => isNonZero(b.posted) || isNonZero(b.held) || isNonZero(b.available)),
    [balances],
  );

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(700px 260px at 20% 0%, color-mix(in oklab, var(--accent) 18%, transparent) 0%, transparent 60%), radial-gradient(440px 220px at 90% 10%, color-mix(in oklab, var(--accent-2) 12%, transparent) 0%, transparent 55%)",
          }}
        />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
              <h1 className="text-xl font-extrabold tracking-tight">Home</h1>
            </div>
            <p className="mt-1 text-xs text-[var(--muted)]">Balances, quick actions, and your watchlist.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href="/wallet" className={buttonClassName({ variant: "secondary", size: "sm" })}>
              Wallet
            </Link>
            <Link href="/wallet/withdraw" className={buttonClassName({ variant: "primary", size: "sm" })}>
              Withdraw
            </Link>
            <Link href="/p2p" className={buttonClassName({ variant: "secondary", size: "sm" })}>
              P2P
            </Link>
            <Link href="/order-history" className={buttonClassName({ variant: "secondary", size: "sm" })}>
              Orders
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)] lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold tracking-tight">Balances</h2>
            <button
              type="button"
              onClick={load}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--card-2)] disabled:opacity-60"
              disabled={loading}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {loading && balances.length === 0 ? (
            <div className="mt-4 text-xs text-[var(--muted)]">Loading balances…</div>
          ) : nonZero.length === 0 ? (
            <div className="mt-4 text-xs text-[var(--muted)]">No balances yet.</div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-[var(--border)]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--bg)] text-[10px] uppercase tracking-wider text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Asset</th>
                    <th className="px-3 py-2 font-semibold">Available</th>
                    <th className="px-3 py-2 font-semibold">Held</th>
                    <th className="px-3 py-2 font-semibold">Posted</th>
                  </tr>
                </thead>
                <tbody>
                  {nonZero.map((b) => (
                    <tr key={b.asset_id} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2 font-semibold text-[var(--foreground)]">{b.symbol}</td>
                      <td className="px-3 py-2 text-[var(--foreground)]">
                        {formatTokenAmount(b.available, b.decimals)}
                      </td>
                      <td className="px-3 py-2 text-[var(--foreground)]">
                        {formatTokenAmount(b.held, b.decimals)}
                      </td>
                      <td className="px-3 py-2 text-[var(--muted)]">
                        {formatTokenAmount(b.posted, b.decimals)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
          <h2 className="text-sm font-semibold tracking-tight">Watchlist</h2>

          <div className="mt-2 text-xs text-[var(--muted)]">Pin assets and set alerts. Alerts show up in Notifications.</div>

          <div className="mt-4 flex gap-2">
            <input
              value={newSymbol}
              onChange={(e) => setNewSymbol(e.target.value)}
              placeholder="BTC"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--foreground)] placeholder:text-[var(--muted)]"
            />
            <button
              type="button"
              onClick={addToWatchlist}
              className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-60"
              disabled={watchlistLoading}
            >
              Add
            </button>
          </div>

          {watchlistError ? <div className="mt-2 text-[11px] text-[var(--down)]">{watchlistError}</div> : null}

          <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border)]">
            {watchlistLoading && watchlist.length === 0 ? (
              <div className="bg-[var(--bg)] px-3 py-3 text-xs text-[var(--muted)]">Loading…</div>
            ) : watchlist.length === 0 ? (
              <div className="bg-[var(--bg)] px-3 py-3 text-xs text-[var(--muted)]">No watchlist items yet.</div>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {watchlist.map((w) => (
                  <li key={w.id} className="flex items-center justify-between gap-3 bg-[var(--bg)] px-3 py-2">
                    <div className="text-xs font-semibold text-[var(--foreground)]">{w.base_symbol}</div>
                    <button
                      type="button"
                      onClick={() => removeFromWatchlist(w.base_symbol)}
                      className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-2)]"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Price Alert</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input
                value={alertSymbol}
                onChange={(e) => setAlertSymbol(e.target.value)}
                placeholder="BTC"
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-xs text-[var(--foreground)] placeholder:text-[var(--muted)]"
              />
              <input
                value={alertFiat}
                onChange={(e) => setAlertFiat(e.target.value)}
                placeholder="USD"
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-xs text-[var(--foreground)] placeholder:text-[var(--muted)]"
              />
              <select
                value={alertDirection}
                onChange={(e) => setAlertDirection(e.target.value as any)}
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-xs text-[var(--foreground)]"
              >
                <option value="above">Above</option>
                <option value="below">Below</option>
              </select>
              <input
                value={alertThreshold}
                onChange={(e) => setAlertThreshold(e.target.value)}
                placeholder="Threshold"
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-xs text-[var(--foreground)] placeholder:text-[var(--muted)]"
              />
              <input
                value={alertCooldown}
                onChange={(e) => setAlertCooldown(e.target.value)}
                placeholder="Cooldown sec"
                className="col-span-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-xs text-[var(--foreground)] placeholder:text-[var(--muted)]"
              />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={createAlert}
                className="rounded-lg bg-[var(--accent-2)] px-3 py-2 text-xs font-semibold text-white hover:brightness-110"
              >
                Create
              </button>
              <Link href="/notifications" className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--foreground)]">
                View notifications →
              </Link>
            </div>
          </div>

          <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border)]">
            {alertsLoading && alerts.length === 0 ? (
              <div className="bg-[var(--bg)] px-3 py-3 text-xs text-[var(--muted)]">Loading alerts…</div>
            ) : alerts.length === 0 ? (
              <div className="bg-[var(--bg)] px-3 py-3 text-xs text-[var(--muted)]">No alerts yet.</div>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {alerts.slice(0, 6).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 bg-[var(--bg)] px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-[var(--foreground)]">
                        {a.base_symbol} {a.direction} {a.threshold} {a.fiat}
                      </div>
                      <div className="mt-0.5 text-[10px] text-[var(--muted)]">
                        Cooldown: {a.cooldown_sec}s{a.last_triggered_at ? ` · last ${new Date(a.last_triggered_at).toLocaleString()}` : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteAlert(a.id)}
                      className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-2)]"
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)] lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold tracking-tight">Recent activity</h2>
              {unreadCount > 0 ? (
                <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg)] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--muted)]">
                  {unreadCount} unread
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadNotifications}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--card-2)] disabled:opacity-60"
                disabled={notifLoading}
              >
                {notifLoading ? "Refreshing…" : "Refresh"}
              </button>
              <Link href="/notifications" className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--foreground)]">
                View all →
              </Link>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-[var(--border)]">
            {notifLoading && notifications.length === 0 ? (
              <div className="bg-[var(--bg)] px-3 py-3 text-xs text-[var(--muted)]">Loading activity…</div>
            ) : notifications.length === 0 ? (
              <div className="bg-[var(--bg)] px-3 py-3 text-xs text-[var(--muted)]">No activity yet.</div>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {notifications.slice(0, 8).map((n) => (
                  <li key={n.id} className="bg-[var(--bg)] px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className={(n.read ? "" : "text-[var(--foreground)] ") + "truncate text-xs font-semibold"}>
                            {n.title}
                          </div>
                          {!n.read ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" /> : null}
                        </div>
                        {n.body ? (
                          <div className="mt-0.5 line-clamp-2 text-[11px] text-[var(--muted)]">{n.body}</div>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-[10px] text-[var(--muted)]">
                        {n.created_at ? new Date(n.created_at).toLocaleString() : "—"}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
          <h2 className="text-sm font-semibold tracking-tight">Next steps</h2>
          <div className="mt-2 text-xs text-[var(--muted)]">Common actions to keep the daily loop tight.</div>

          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Open items</div>
              <button
                type="button"
                onClick={loadSummary}
                className="text-[10px] text-[var(--muted)] underline hover:text-[var(--foreground)]"
                disabled={summaryLoading}
              >
                refresh
              </button>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <Link href="/order-history" className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-2">
                <div className="text-xs font-extrabold text-[var(--foreground)]">{summary ? summary.open_orders : "—"}</div>
                <div className="mt-0.5 text-[10px] text-[var(--muted)]">open orders</div>
              </Link>
              <Link href="/wallet" className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-2">
                <div className="text-xs font-extrabold text-[var(--foreground)]">{summary ? summary.pending_withdrawals : "—"}</div>
                <div className="mt-0.5 text-[10px] text-[var(--muted)]">withdrawals</div>
              </Link>
              <Link href="/p2p/orders" className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-2">
                <div className="text-xs font-extrabold text-[var(--foreground)]">{summary ? summary.active_p2p_orders : "—"}</div>
                <div className="mt-0.5 text-[10px] text-[var(--muted)]">p2p active</div>
              </Link>
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            <Link href="/wallet" className={buttonClassName({ variant: "secondary", size: "sm" })}>
              Deposit / balances
            </Link>
            <Link href="/terminal" className={buttonClassName({ variant: "secondary", size: "sm" })}>
              Open terminal
            </Link>
            <Link href="/p2p" className={buttonClassName({ variant: "secondary", size: "sm" })}>
              Browse P2P
            </Link>
          </div>
          <div className="mt-4 text-[11px] text-[var(--muted)]">
            Tip: price alerts trigger notifications via the scheduled `price-alerts` cron.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)] lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold tracking-tight">P2P desk</h2>
            <Link
              href={summary && summary.active_p2p_orders > 0 ? "/p2p/orders" : "/p2p"}
              className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              {summary && summary.active_p2p_orders > 0 ? "View my orders →" : "Browse market →"}
            </Link>
          </div>

          <div
            className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4"
            style={{
              background:
                "radial-gradient(680px 220px at 15% 0%, color-mix(in oklab, var(--up) 10%, transparent) 0%, transparent 60%), radial-gradient(520px 220px at 90% 10%, color-mix(in oklab, var(--accent) 10%, transparent) 0%, transparent 55%)",
            }}
          >
            {summary ? (
              summary.active_p2p_orders > 0 ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-extrabold text-[var(--foreground)]">
                      {summary.active_p2p_orders} active {summary.active_p2p_orders === 1 ? "trade" : "trades"}
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--muted)]">Open “My orders” to pay/verify/release and keep escrow moving.</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href="/p2p/orders" className={buttonClassName({ variant: "primary", size: "sm" })}>
                      My P2P orders
                    </Link>
                    <Link href="/p2p" className={buttonClassName({ variant: "secondary", size: "sm" })}>
                      Marketplace
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-extrabold text-[var(--foreground)]">No active P2P trades</div>
                    <div className="mt-0.5 text-xs text-[var(--muted)]">Browse the market to buy/sell with escrow and local rails.</div>
                  </div>
                  <div>
                    <Link href="/p2p" className={buttonClassName({ variant: "primary", size: "sm" })}>
                      Browse P2P
                    </Link>
                  </div>
                </div>
              )
            ) : (
              <div className="text-xs text-[var(--muted)]">Loading P2P status…</div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
          <h2 className="text-sm font-semibold tracking-tight">Spot trading</h2>
          <div className="mt-2 text-xs text-[var(--muted)]">Fast execution lives in the Terminal. History and fills live in Orders.</div>

          <div
            className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3"
            style={{
              background:
                "radial-gradient(680px 220px at 15% 0%, color-mix(in oklab, var(--accent-2) 10%, transparent) 0%, transparent 60%), radial-gradient(520px 220px at 90% 10%, color-mix(in oklab, var(--warn) 10%, transparent) 0%, transparent 55%)",
            }}
          >
            {summary ? (
              summary.open_orders > 0 ? (
                <div className="flex flex-col gap-2">
                  <div className="text-sm font-extrabold text-[var(--foreground)]">
                    {summary.open_orders} open {summary.open_orders === 1 ? "order" : "orders"}
                  </div>
                  <div className="text-xs text-[var(--muted)]">Review open/partial orders and fill details.</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Link href="/order-history" className={buttonClassName({ variant: "primary", size: "sm" })}>
                      Orders
                    </Link>
                    <Link href="/terminal" className={buttonClassName({ variant: "secondary", size: "sm" })}>
                      Open terminal
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="text-sm font-extrabold text-[var(--foreground)]">No open orders</div>
                  <div className="text-xs text-[var(--muted)]">Open the terminal to place a limit or market order.</div>
                  <div className="mt-1">
                    <Link href="/terminal" className={buttonClassName({ variant: "primary", size: "sm" })}>
                      Open terminal
                    </Link>
                  </div>
                </div>
              )
            ) : (
              <div className="text-xs text-[var(--muted)]">Loading trading status…</div>
            )}
          </div>

          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Trust</div>
            <div className="mt-1 text-xs text-[var(--muted)]">If anything feels off, check status and signals first.</div>
            <div className="mt-3 grid gap-2">
              <Link href="/status" className={buttonClassName({ variant: "secondary", size: "sm" })}>
                Status page
              </Link>
              <Link href="/notifications" className={buttonClassName({ variant: "secondary", size: "sm" })}>
                Signals
              </Link>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Wallet rail</div>
            {summary ? (
              summary.pending_withdrawals > 0 ? (
                <>
                  <div className="mt-1 text-xs text-[var(--muted)]">
                    {summary.pending_withdrawals} pending {summary.pending_withdrawals === 1 ? "withdrawal" : "withdrawals"}.
                  </div>
                  <div className="mt-3">
                    <Link href="/wallet" className={buttonClassName({ variant: "primary", size: "sm" })}>
                      Open wallet
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <div className="mt-1 text-xs text-[var(--muted)]">Need to fund your account? Start with your deposit address.</div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Link href="/wallet#deposit" className={buttonClassName({ variant: "primary", size: "sm" })}>
                      Deposit address
                    </Link>
                    <Link href="/wallet" className={buttonClassName({ variant: "secondary", size: "sm" })}>
                      Wallet
                    </Link>
                  </div>
                </>
              )
            ) : (
              <div className="mt-1 text-xs text-[var(--muted)]">Loading wallet status…</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
