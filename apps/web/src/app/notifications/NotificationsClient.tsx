"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SiteChrome } from "@/components/SiteChrome";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  metadata_json?: any;
};

/* ── helpers (mirrored from NotificationBell) ── */

function fetchOpts(extra?: RequestInit): RequestInit {
  const opts: RequestInit = { credentials: "include", ...extra };
  if (typeof window !== "undefined") {
    const uid = localStorage.getItem("ts_user_id") ?? localStorage.getItem("pp_user_id");
    if (uid) opts.headers = { ...opts.headers as Record<string, string>, "x-user-id": uid };
  }
  return opts;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function iconForType(type: string) {
  switch (type) {
    case "order_filled":
    case "order_partially_filled":
    case "p2p_order_completed":
      return "●";
    case "order_canceled":
    case "p2p_order_cancelled":
      return "✕";
    case "deposit_credited":
    case "p2p_payment_confirmed":
      return "↓";
    case "withdrawal_approved":
    case "withdrawal_completed":
      return "↑";
    case "withdrawal_rejected":
      return "!";
    case "p2p_order_created":
        return "★";
    case "p2p_order_expiring":
      return "!";
    case "p2p_dispute_opened":
    case "p2p_dispute_resolved":
      return "!";
    case "p2p_feedback_received":
      return "✓";
    default:
      return "◆";
  }
}

function colorForType(type: string) {
  switch (type) {
    case "order_filled":
    case "deposit_credited":
    case "withdrawal_completed":
    case "p2p_order_completed":
      return "text-[var(--up)]";
    case "order_partially_filled":
    case "withdrawal_approved":
    case "p2p_payment_confirmed":
    case "p2p_order_created":
      return "text-[var(--accent)]";
    case "p2p_feedback_received":
      return "text-[var(--up)]";
    case "p2p_dispute_opened":
    case "p2p_dispute_resolved":
    case "p2p_order_expiring":
      return "text-[var(--warn)]";
    case "order_canceled":
    case "withdrawal_rejected":
    case "p2p_order_cancelled":
      return "text-[var(--down)]";
    default:
      return "text-[var(--muted)]";
  }
}

function labelForType(type: string) {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ── Page ── */

export function NotificationsClient() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const markRead = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    setNotifications((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)));
    try {
      await fetch(
        "/api/notifications",
        fetchOpts({
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ids }),
        }),
      );
    } catch {
      // silent
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=100", fetchOpts({ cache: "no-store" }));
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const markAllRead = async () => {
    setMarking(true);
    try {
      await fetch("/api/notifications", fetchOpts({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mark_all_read: true }),
      }));
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // silent
    } finally {
      setMarking(false);
    }
  };

  const filtered = filter === "unread"
    ? notifications.filter((n) => !n.read)
    : notifications;

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <SiteChrome>
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      {/* Synapse header */}
      <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(700px 260px at 20% 0%, color-mix(in oklab, var(--accent) 18%, transparent) 0%, transparent 60%), radial-gradient(440px 220px at 90% 10%, color-mix(in oklab, var(--accent-2) 12%, transparent) 0%, transparent 55%)",
          }}
        />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
              <h1 className="text-xl font-extrabold tracking-tight">Signals</h1>
            </div>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                disabled={marking}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--card-2)] disabled:opacity-60"
              >
                Clear unread
              </button>
            )}
            <Link
              href="/p2p"
              className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white hover:brightness-110"
            >
              Go to P2P
            </Link>
          </div>
        </div>

        <div className="relative mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-xs text-[var(--muted)]">
          You’ll see updates for P2P orders, spot fills, deposits/withdrawals, and security events.
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(["all", "unread"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={
              "rounded-xl border px-3 py-1.5 text-xs font-semibold transition " +
              (filter === f
                ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,var(--card))] text-[var(--foreground)]"
                : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-2)]")
            }
          >
            {f === "all" ? "All" : `Unread (${unreadCount})`}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3 rounded-xl bg-[var(--card)] p-4">
              <div className="h-8 w-8 animate-pulse rounded-full bg-[var(--border)]" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-48 animate-pulse rounded bg-[var(--border)]" />
                <div className="h-3 w-64 animate-pulse rounded bg-[var(--border)]" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-6 py-12 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full border border-[var(--border)] bg-[var(--bg)] text-lg">
            ◆
          </div>
          <p className="text-sm text-[var(--muted)]">
            {filter === "unread" ? "No unread notifications" : "No notifications yet"}
          </p>
          <Link
            href="/exchange"
            className="mt-4 inline-block text-xs text-[var(--accent)] hover:underline"
          >
            Start trading to receive updates
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
          {filtered.map((n) => {
            const orderId = n.metadata_json?.order_id;
            const content = (
              <>
                {/* Icon */}
                <div className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--border)] bg-[var(--bg)] text-sm ${colorForType(n.type)}`}>
                  {iconForType(n.type)}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-sm font-medium">{n.title}</span>
                      <span className="ml-2 text-[10px] text-[var(--muted)]">
                        {labelForType(n.type)}
                      </span>
                    </div>
                    <span className="shrink-0 text-[11px] text-[var(--muted)]">
                      {timeAgo(n.created_at)}
                    </span>
                  </div>
                  {n.body && (
                    <p className="mt-0.5 text-xs text-[var(--muted)]">{n.body}</p>
                  )}
                </div>

                {/* Unread dot */}
                {!n.read && (
                  <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--accent)]" />
                )}
              </>
            );

            const className = `flex gap-3 px-4 py-3.5 transition hover:bg-[var(--card-2)] ${n.read ? "opacity-60" : ""}`;

            if (orderId) {
                return (
                    <Link
                      key={n.id}
                      href={`/p2p/orders/${orderId}`}
                      className={className}
                      onClick={() => {
                        if (!n.read) void markRead([n.id]);
                      }}
                    >
                        {content}
                    </Link>
                )
            }

            return (
              <button
                key={n.id}
                type="button"
                className={className + " text-left w-full"}
                onClick={() => {
                  if (!n.read) void markRead([n.id]);
                }}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
    </SiteChrome>
  );
}
