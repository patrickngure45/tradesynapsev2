"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Toast } from "@/components/Toast";
import { fetchJsonOrThrow } from "@/lib/api/client";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  metadata_json?: any;
};

function safeInternalHref(v: unknown): string | null {
  if (typeof v !== "string") return null;
  if (!v.startsWith("/")) return null;
  // Prevent protocol-relative or malformed URLs.
  if (v.startsWith("//")) return null;
  return v;
}

function withDevUserHeader(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  if (typeof window !== "undefined") {
    const uid = localStorage.getItem("ts_user_id") ?? localStorage.getItem("pp_user_id");
    if (uid && !headers.has("x-user-id")) headers.set("x-user-id", uid);
  }
  return { ...init, headers, credentials: init?.credentials ?? "same-origin" };
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
    case "order_placed":
      return "+";
    case "order_filled":
    case "order_partially_filled":
    case "p2p_order_completed":
      return "●";
    case "order_canceled":
    case "order_rejected":
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
    case "price_alert":
      return "⟲";
    default:
      return "◆";
  }
}

function colorForType(type: string) {
  switch (type) {
    case "order_placed":
      return "text-[var(--accent)]";
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
    case "price_alert":
      return "text-[var(--warn)]";
    case "order_canceled":
    case "order_rejected":
    case "withdrawal_rejected":
    case "p2p_order_cancelled":
      return "text-[var(--down)]";
    default:
      return "text-[var(--muted)]";
  }
}

export function NotificationBell() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const prevUnreadRef = useRef<number>(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const loadInFlightRef = useRef(false);
  const lastLoadAtRef = useRef(0);

  const markRead = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;

    setNotifications((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - ids.length));
    prevUnreadRef.current = Math.max(0, prevUnreadRef.current - ids.length);

    try {
      await fetchJsonOrThrow<{ marked_read?: number }>(
        "/api/notifications",
        withDevUserHeader({
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
    if (loadInFlightRef.current) return;
    const now = Date.now();
    // Avoid bursts (e.g., focus + interval at the same moment).
    if (now - lastLoadAtRef.current < 750) return;
    loadInFlightRef.current = true;
    lastLoadAtRef.current = now;
    try {
      const fetchWithTimeout = async <T,>(url: string, timeoutMs: number): Promise<T> => {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), timeoutMs);
        try {
          return await fetchJsonOrThrow<T>(url, withDevUserHeader({ cache: "no-store", signal: controller.signal }));
        } finally {
          window.clearTimeout(timer);
        }
      };

      const tryLoadOnce = async () => {
        return await fetchWithTimeout<{ notifications?: Notification[]; unread_count?: number }>(
          "/api/notifications?limit=30",
          7000,
        );
      };

      let data: { notifications?: Notification[]; unread_count?: number };
      try {
        data = await tryLoadOnce();
      } catch (e) {
        // Transient 5xx / gateway errors happen on cold starts or brief restarts; retry once.
        const status = e instanceof Error && "status" in (e as any) ? Number((e as any).status) : null;
        if (status && status >= 500) {
          await new Promise((r) => setTimeout(r, 350));
          data = await tryLoadOnce();
        } else {
          throw e;
        }
      }

      const nextNotifications: Notification[] = data.notifications ?? [];
      const nextUnread = Number(data.unread_count ?? 0);
      setNotifications(nextNotifications);
      setUnreadCount(nextUnread);

      const prevUnread = prevUnreadRef.current;
      if (!open && nextUnread > prevUnread) {
        const newest = nextNotifications.find((n) => !n.read) ?? nextNotifications[0];
        const delta = nextUnread - prevUnread;
        const compact = (s: string) => s.replace(/\s+/g, " ").trim();
        const clip = (s: string, maxLen: number) => (s.length > maxLen ? s.slice(0, maxLen - 1) + "…" : s);
        setToastMessage(
          delta === 1 && newest
            ? clip(compact(`${newest.title}${newest.body ? ` — ${newest.body}` : ""}`), 140)
            : `${delta} new notifications`,
        );
      }

      prevUnreadRef.current = nextUnread;
    } catch {
      // silent
    } finally {
      loadInFlightRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    load();
    const isP2POrder = pathname?.startsWith("/p2p/orders");
    const intervalMs = isP2POrder ? 8_000 : 30_000;
    const interval = setInterval(load, intervalMs);
    return () => clearInterval(interval);
  }, [load, pathname]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") load();
    };
    const onFocus = () => load();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

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
      await fetchJsonOrThrow<{ marked_read?: number }>(
        "/api/notifications",
        withDevUserHeader({
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mark_all_read: true }),
        }),
      );
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
      prevUnreadRef.current = 0;
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <Toast message={toastMessage} kind="info" durationMs={2200} onDone={() => setToastMessage(null)} />
      <button
        type="button"
        className="relative grid h-11 w-11 md:h-8 md:w-8 place-items-center rounded-xl border border-[var(--border)] bg-transparent text-xs transition hover:bg-[var(--card-2)]"
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
          <span className="absolute -right-1 -top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-[var(--down)] px-1 text-[9px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed left-4 right-4 top-20 z-50 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-2)] sm:left-auto sm:right-4 sm:w-[380px]">
          <div className="relative border-b border-[var(--border)] px-3 py-2.5">
            <div
              className="pointer-events-none absolute inset-0 opacity-60"
              style={{
                background:
                  "radial-gradient(520px 200px at 20% 0%, color-mix(in oklab, var(--accent) 16%, transparent) 0%, transparent 60%), radial-gradient(360px 180px at 90% 10%, color-mix(in oklab, var(--accent-2) 10%, transparent) 0%, transparent 55%)",
              }}
            />
            <div className="relative flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-[var(--foreground)]">Signals</div>
                <div className="mt-0.5 text-[10px] text-[var(--muted)]">
                  {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 ? (
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[10px] font-semibold text-[var(--foreground)] hover:bg-[var(--card-2)] disabled:opacity-60"
                    onClick={markAllRead}
                    disabled={loading}
                  >
                    Clear unread
                  </button>
                ) : null}
                <Link
                  href="/notifications"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[10px] font-semibold text-[var(--muted)] hover:bg-[var(--card-2)] hover:text-[var(--foreground)]"
                >
                  View all
                </Link>
              </div>
            </div>
          </div>

          <div className="max-h-80 overflow-auto">
            {notifications.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-[var(--muted)]">No notifications yet</div>
            ) : (
              notifications.map((n) => {
                const orderId = n.metadata_json?.order_id;
                const href =
                  safeInternalHref(n.metadata_json?.href) ?? (orderId ? `/p2p/orders/${orderId}` : null);
                const className =
                  "block w-full px-3 py-3 text-left transition hover:bg-[var(--card-2)] " + (n.read ? "opacity-60" : "");

                const row = (
                  <div className="flex gap-2.5">
                    <span
                      className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[var(--border)] bg-[var(--bg)] text-sm ${colorForType(n.type)}`}
                    >
                      {iconForType(n.type)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[11px] font-medium">{n.title}</span>
                        <span className="shrink-0 text-[10px] text-[var(--muted)]">{timeAgo(n.created_at)}</span>
                      </div>
                      {n.body ? <div className="mt-0.5 truncate text-[10px] text-[var(--muted)]">{n.body}</div> : null}
                    </div>
                    {!n.read ? <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--accent)]" /> : null}
                  </div>
                );

                if (href) {
                  return (
                    <Link
                      key={n.id}
                      href={href}
                      onClick={() => {
                        setOpen(false);
                        if (!n.read) void markRead([n.id]);
                      }}
                      className={className}
                    >
                      {row}
                    </Link>
                  );
                }

                return (
                  <button
                    key={n.id}
                    type="button"
                    className={className}
                    onClick={() => {
                      if (!n.read) void markRead([n.id]);
                    }}
                  >
                    {row}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
