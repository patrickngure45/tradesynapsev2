"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  metadata_json?: any;
};

function fetchOpts(extra?: RequestInit): RequestInit {
  const opts: RequestInit = { credentials: "include", ...extra };
  if (typeof window !== "undefined") {
    const uid = localStorage.getItem("ts_user_id") ?? localStorage.getItem("pp_user_id");
    if (uid) opts.headers = { ...opts.headers as Record<string,string>, "x-user-id": uid };
  }
  return opts;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
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
      return "text-emerald-500";
    case "order_partially_filled":
    case "withdrawal_approved":
    case "p2p_payment_confirmed":
    case "p2p_order_created":
      return "text-blue-500";
    case "order_canceled":
    case "withdrawal_rejected":
    case "p2p_order_cancelled":
      return "text-rose-500";
    default:
      return "text-[var(--muted)]";
  }
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=30", fetchOpts({
        cache: "no-store",
      }));
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unread_count ?? 0);
    } catch {
      // silent
    }
  }, []);

  // Poll every 30s
  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const markAllRead = async () => {
    setLoading(true);
    try {
      await fetch("/api/notifications", fetchOpts({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mark_all_read: true }),
      }));
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        className="relative grid h-11 w-11 md:h-8 md:w-8 place-items-center rounded-lg border border-[var(--border)] bg-transparent text-xs transition hover:bg-[color-mix(in_srgb,var(--card)_70%,transparent)]"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) load();
        }}
        title="Notifications"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-rose-600 px-1 text-[9px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-10 z-50 w-80 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
            <span className="text-xs font-medium">Notifications</span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 ? (
                <button
                  type="button"
                  className="text-[10px] text-[var(--accent)] hover:underline disabled:opacity-60"
                  onClick={markAllRead}
                  disabled={loading}
                >
                  Mark all read
                </button>
              ) : null}
            </div>
          </div>

          <div className="max-h-80 overflow-auto">
            {notifications.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-[var(--muted)]">
                No notifications yet
              </div>
            ) : (
              notifications.map((n) => {
                const orderId = n.metadata_json?.order_id;
                const content = (
                   <div className="flex gap-2.5">
                    <span className={`mt-0.5 text-sm ${colorForType(n.type)}`}>
                        {iconForType(n.type)}
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-[11px] font-medium">{n.title}</span>
                            <span className="shrink-0 text-[10px] text-[var(--muted)]">
                                {timeAgo(n.created_at)}
                            </span>
                        </div>
                        {n.body ? (
                            <div className="mt-0.5 truncate text-[10px] text-[var(--muted)]">{n.body}</div>
                        ) : null}
                    </div>
                    {!n.read ? (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" />
                    ) : null}
                  </div>
                );

                const className = `block border-b border-[var(--border)] px-3 py-2.5 last:border-b-0 hover:bg-[var(--card-2)] transition ${n.read ? "opacity-60" : ""}`;
                
                if (orderId) {
                   return (
                     <Link key={n.id} href={`/p2p/orders/${orderId}`} onClick={() => setOpen(false)} className={className}>
                        {content}
                     </Link>
                   )
                }

                return (
                   <div key={n.id} className={className}>
                     {content}
                   </div>
                )
              })
            )}
          </div>

          {/* View all link */}
          <Link
            href="/notifications"
            className="block border-t border-[var(--border)] px-3 py-2 text-center text-[10px] font-medium text-[var(--accent)] hover:underline"
            onClick={() => setOpen(false)}
          >
            View all notifications
          </Link>
        </div>
      ) : null}
    </div>
  );
}
