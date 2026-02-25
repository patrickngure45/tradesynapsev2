"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { V2Button } from "@/components/v2/Button";
import { V2Card, V2CardBody, V2CardHeader } from "@/components/v2/Card";
import { V2Input } from "@/components/v2/Input";
import { V2Skeleton } from "@/components/v2/Skeleton";

type PaymentSnapshotRow = {
  id?: string;
  identifier: string;
  name: string;
  details: Record<string, unknown> | null;
};

type Order = {
  id: string;
  status: string;
  amount_fiat: string;
  fiat_currency: string;
  amount_asset: string;
  price: string;
  created_at: string;
  paid_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  expires_at?: string | null;

  buyer_id: string;
  seller_id: string;
  buyer_email?: string;
  seller_email?: string;

  asset_symbol: string;
  asset_decimals?: number;

  ad_terms?: string | null;
  payment_window_minutes?: number;

  payment_method_snapshot?: PaymentSnapshotRow[];
  payment_details_ready?: boolean;
};

type Message = {
  id: string;
  sender_id: string | null;
  content: string;
  created_at: string;
  sender_email?: string | null;
  is_image?: boolean;
};

type OrderResponse = { order?: Order; messages?: Message[]; error?: string };

type WhoamiResponse = { user?: { id: string } | null };

type ActionResponse = { ok?: boolean; order?: any; error?: string; message?: string };

type Action = "PAY_CONFIRMED" | "RELEASE" | "CANCEL";

function fmtTime(ts: string | null | undefined): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

function toNum(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(String(v));
  return Number.isFinite(n) ? n : null;
}

function fmtNum(v: string | null | undefined): string {
  const n = toNum(v);
  if (n == null) return "—";
  if (n === 0) return "0";
  const abs = Math.abs(n);
  const decimals = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 6 : 8;
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

function fmtMoney(v: string | null | undefined, fiat: string): string {
  const n = toNum(v);
  if (n == null) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: fiat,
      currencyDisplay: "code",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toLocaleString()} ${fiat}`;
  }
}

function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)__csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : null;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("file_read_failed"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

function humanizeActionError(code: string | null): string | null {
  if (!code) return null;
  const normalized = String(code).trim().toLowerCase();

  if (normalized === "auth_required" || normalized === "unauthorized" || normalized === "http_401") {
    return "You are not signed in. Log in and try again.";
  }
  if (normalized === "forbidden" || normalized === "http_403") {
    return "You are not allowed to perform this action for this order.";
  }
  if (normalized === "order_not_found" || normalized === "not_found" || normalized === "http_404") {
    return "This order was not found or you no longer have access.";
  }
  if (normalized === "trade_transition_not_allowed" || normalized === "trade_state_conflict" || normalized === "http_409") {
    return "Order state changed. Refresh and try again.";
  }
  if (normalized === "dispute_already_exists") {
    return "A dispute is already open for this order.";
  }
  if (normalized === "trade_not_disputable") {
    return "This order cannot be disputed in its current status.";
  }
  if (normalized === "not_party") {
    return "Only the buyer or seller can perform this action.";
  }

  if (normalized.startsWith("http_")) {
    return `Request failed (${normalized.replace("http_", "HTTP ").toUpperCase()}). Try again.`;
  }

  return normalized.replaceAll("_", " ");
}

function statusBadgeClass(status: string): string {
  if (status === "completed") {
    return "rounded-full border border-[color-mix(in_srgb,var(--v2-up)_35%,transparent)] bg-[color-mix(in_srgb,var(--v2-up)_16%,transparent)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--v2-up)]";
  }
  if (status === "cancelled") {
    return "rounded-full border border-[color-mix(in_srgb,var(--v2-down)_35%,transparent)] bg-[color-mix(in_srgb,var(--v2-down)_14%,transparent)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--v2-down)]";
  }
  if (status === "disputed") {
    return "rounded-full border border-[color-mix(in_srgb,var(--v2-accent-2)_35%,transparent)] bg-[color-mix(in_srgb,var(--v2-accent-2)_16%,transparent)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--v2-accent-2)]";
  }
  if (status === "paid_confirmed") {
    return "rounded-full border border-[color-mix(in_srgb,var(--v2-accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--v2-accent)_18%,transparent)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--v2-accent)]";
  }
  if (status === "created") {
    return "rounded-full border border-[var(--v2-border)] bg-[var(--v2-surface)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--v2-muted)]";
  }
  return "rounded-full border border-[var(--v2-border)] bg-[var(--v2-surface)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--v2-muted)]";
}

export function P2POrderClient() {
  const params = useParams() as { id: string };
  const id = String(params?.id ?? "");

  const [me, setMe] = useState<string | null>(null);

  const [order, setOrder] = useState<Order | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [chat, setChat] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [acting, setActing] = useState<Action | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [openingDispute, setOpeningDispute] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const chatImageInputRef = useRef<HTMLInputElement | null>(null);

  const loadSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const hasLoadedRef = useRef(false);
  const orderStatusRef = useRef<string>("");

  const notifEsRef = useRef<EventSource | null>(null);
  const lastNotifRefreshAtRef = useRef<number>(0);

  useEffect(() => {
    orderStatusRef.current = String(order?.status ?? "").toLowerCase();
  }, [order?.status]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/whoami", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: WhoamiResponse | null) => {
        if (cancelled) return;
        const uid = typeof json?.user?.id === "string" ? json.user.id : null;
        setMe(uid);
      })
      .catch(() => {
        if (!cancelled) setMe(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = async () => {
    if (!id) return;
    const seq = ++loadSeqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setError(null);
    if (!hasLoadedRef.current) setLoading(true);

    try {
      const res = await fetch(`/api/p2p/orders/${encodeURIComponent(id)}`, { cache: "no-store", signal: controller.signal });
      const json = (await res.json().catch(() => null)) as OrderResponse | null;
      if (!res.ok) {
        const code = typeof (json as any)?.error === "string" ? (json as any).error : `http_${res.status}`;
        throw new Error(code);
      }
      if (seq !== loadSeqRef.current) return;
      setOrder(json?.order ?? null);
      setMessages(Array.isArray(json?.messages) ? (json!.messages as any) : []);
      hasLoadedRef.current = true;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (seq !== loadSeqRef.current) return;
      if (!hasLoadedRef.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    let timeoutId: number | null = null;

    const stopTimer = () => {
      if (!timeoutId) return;
      window.clearTimeout(timeoutId);
      timeoutId = null;
    };

    const schedule = () => {
      stopTimer();
      const status = orderStatusRef.current;
      const isTerminal = status === "completed" || status === "cancelled";
      const delayMs = notifEsRef.current
        ? (isTerminal ? 45_000 : 15_000)
        : (isTerminal ? 20_000 : 4_000);
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        if (document.visibilityState === "visible") void load();
        schedule();
      }, delayMs);
    };

    const onVis = () => {
      if (document.visibilityState === "visible") {
        void load();
        schedule();
      } else {
        stopTimer();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    schedule();
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      stopTimer();
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Realtime: refresh this order when relevant p2p_* notifications arrive.
  useEffect(() => {
    if (!id) return;

    const stop = () => {
      try {
        notifEsRef.current?.close();
      } catch {
        // ignore
      }
      notifEsRef.current = null;
    };

    const refreshSoon = () => {
      const now = Date.now();
      if (now - lastNotifRefreshAtRef.current < 700) return;
      lastNotifRefreshAtRef.current = now;
      if (document.visibilityState !== "visible") return;
      void load();
    };

    const shouldRefresh = (data: any) => {
      const type = String(data?.type ?? "");
      if (!type.startsWith("p2p_")) return false;
      const orderId = String(data?.metadata?.order_id ?? "");
      return orderId ? orderId === id : true;
    };

    const start = () => {
      if (document.visibilityState !== "visible") return;
      if (typeof EventSource === "undefined") return;
      if (notifEsRef.current) return;
      try {
        const es = new EventSource("/api/notifications/stream", { withCredentials: true } as any);
        es.addEventListener("notification", (evt) => {
          try {
            const data = JSON.parse(String((evt as MessageEvent).data ?? "{}"));
            if (shouldRefresh(data)) refreshSoon();
          } catch {
            // ignore
          }
        });
        es.addEventListener("ready", () => refreshSoon());
        es.onerror = () => {
          // allow browser to retry automatically
        };
        notifEsRef.current = es;
      } catch {
        stop();
      }
    };

    const onVis = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    document.addEventListener("visibilitychange", onVis);
    start();
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const role = useMemo(() => {
    if (!order || !me) return null;
    if (String(order.buyer_id) === String(me)) return "buyer" as const;
    if (String(order.seller_id) === String(me)) return "seller" as const;
    return null;
  }, [order, me]);

  const canPay = role === "buyer" && String(order?.status) === "created";
  const canRelease = role === "seller" && String(order?.status) === "paid_confirmed";
  const canCancel = String(order?.status) === "created";

  const doAction = async (action: Action) => {
    if (!id || acting) return;
    setActing(action);
    setActionError(null);

    try {
      const csrf = getCsrfToken();
      const res = await fetch(`/api/p2p/orders/${encodeURIComponent(id)}/action`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ action }),
      });
      const json = (await res.json().catch(() => null)) as ActionResponse | null;
      if (!res.ok) {
        const code = typeof (json as any)?.error === "string" ? (json as any).error : `http_${res.status}`;
        throw new Error(code);
      }
      void load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setActing(null);
    }
  };

  const sendChat = async () => {
    if (!id || sending) return;
    const content = chat.trim();
    if (!content) return;

    setSending(true);
    setChatError(null);
    try {
      const csrf = getCsrfToken();
      const res = await fetch(`/api/p2p/orders/${encodeURIComponent(id)}/chat`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ content }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        const code = typeof json?.error === "string" ? json.error : `http_${res.status}`;
        throw new Error(code);
      }
      setChat("");
      void load();
    } catch (e) {
      setChatError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const openDispute = async () => {
    if (!id || openingDispute) return;
    setActionError(null);

    const reason = (window.prompt("Why are you opening a dispute?", "Payment issue") ?? "").trim();
    if (reason.length < 5) {
      setActionError("Dispute reason must be at least 5 characters.");
      return;
    }

    setOpeningDispute(true);
    try {
      const csrf = getCsrfToken();
      const res = await fetch(`/api/p2p/orders/${encodeURIComponent(id)}/dispute`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        body: JSON.stringify({ reason }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        const code = typeof json?.error === "string" ? json.error : `http_${res.status}`;
        throw new Error(code);
      }
      void load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setOpeningDispute(false);
    }
  };

  const sendChatImage = async (file: File) => {
    if (!id || uploadingImage) return;
    setChatError(null);

    const maxBytes = 900_000;
    if (file.size > maxBytes) {
      setChatError("Image too large. Use a smaller file (≤ 900KB).");
      return;
    }

    setUploadingImage(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (!dataUrl.startsWith("data:image/")) {
        setChatError("Only image files are supported.");
        return;
      }
      const csrf = getCsrfToken();
      const res = await fetch(`/api/p2p/orders/${encodeURIComponent(id)}/chat`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        body: JSON.stringify({ image_data_url: dataUrl, filename: file.name }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        const code = typeof json?.error === "string" ? json.error : `http_${res.status}`;
        throw new Error(code);
      }
      void load();
    } catch (e) {
      setChatError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploadingImage(false);
    }
  };

  const snapshot = Array.isArray(order?.payment_method_snapshot) ? (order!.payment_method_snapshot as PaymentSnapshotRow[]) : [];

  const header = (
    <header className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">P2P</div>
          <h1 className="text-2xl font-extrabold tracking-tight">Order</h1>
        </div>
        <Link
          href="/v2/p2p/orders"
          className="rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-2 text-[12px] font-semibold text-[var(--v2-text)]"
        >
          Back
        </Link>
      </div>
      <p className="text-sm text-[var(--v2-muted)]">Chat, payment details, and actions.</p>
    </header>
  );

  if (error && !order) {
    return (
      <main className="space-y-4">
        {header}
        <V2Card>
          <V2CardHeader title="Order unavailable" subtitle="Sign in and try again." />
          <V2CardBody>
            <div className="text-sm text-[var(--v2-muted)]">{String(error)}</div>
            <div className="mt-3">
              <V2Button variant="primary" fullWidth onClick={() => void load()}>
                Retry
              </V2Button>
            </div>
          </V2CardBody>
        </V2Card>
      </main>
    );
  }

  if (loading && !order) {
    return (
      <main className="space-y-4">
        {header}
        <div className="grid gap-2">
          <V2Skeleton className="h-24" />
          <V2Skeleton className="h-24" />
          <V2Skeleton className="h-24" />
        </div>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="space-y-4">
        {header}
        <V2Card>
          <V2CardHeader title="Not found" subtitle="This order doesn’t exist or you don’t have access." />
        </V2Card>
      </main>
    );
  }

  const status = String(order.status || "").toLowerCase();
  const canDispute = !!role && status !== "completed" && status !== "cancelled" && status !== "disputed";
  const actionErrorText = humanizeActionError(actionError);

  const expiresAtMs = order.expires_at ? Date.parse(order.expires_at) : NaN;
  const expiresInMin = Number.isFinite(expiresAtMs) ? Math.floor((expiresAtMs - Date.now()) / 60_000) : null;
  const expiresSoon = status === "created" && expiresInMin != null && expiresInMin >= 0 && expiresInMin <= 5;

  return (
    <main className="space-y-4">
      {header}

      <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-3 shadow-[var(--v2-shadow-sm)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[12px] font-semibold text-[var(--v2-muted)]">Status</div>
            <div className="mt-1">
              <span className={statusBadgeClass(status)}>{status.replaceAll("_", " ") || "—"}</span>
            </div>
            <div className="mt-2 text-[12px] text-[var(--v2-muted)]">Created {fmtTime(order.created_at)}</div>
          </div>
          <div className="text-right">
            <div className="text-[12px] font-semibold text-[var(--v2-muted)]">You</div>
            <div className="mt-0.5 text-[13px] font-semibold text-[var(--v2-text)]">{role ? role.toUpperCase() : "—"}</div>
          </div>
        </div>

        <div className="mt-3 grid gap-1 text-[12px] text-[var(--v2-muted)]">
          {order.expires_at ? <div>Expires: {fmtTime(order.expires_at)}</div> : null}
          {order.paid_at ? <div>Paid at: {fmtTime(order.paid_at)}</div> : null}
          {order.completed_at ? <div>Completed at: {fmtTime(order.completed_at)}</div> : null}
          {order.cancelled_at ? <div>Cancelled at: {fmtTime(order.cancelled_at)}</div> : null}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-[var(--v2-surface-2)] px-2 py-2">
            <div className="text-[11px] font-semibold text-[var(--v2-muted)]">Amount</div>
            <div className="mt-0.5 font-mono text-[13px] font-semibold text-[var(--v2-text)]">
              {fmtNum(order.amount_asset)} {String(order.asset_symbol || "—")}
            </div>
            <div className="mt-0.5 text-[12px] text-[var(--v2-muted)]">≈ {fmtMoney(order.amount_fiat, String(order.fiat_currency || "USD"))}</div>
          </div>
          <div className="rounded-xl bg-[var(--v2-surface-2)] px-2 py-2">
            <div className="text-[11px] font-semibold text-[var(--v2-muted)]">Price</div>
            <div className="mt-0.5 font-mono text-[13px] font-semibold text-[var(--v2-text)]">
              {fmtMoney(order.price, String(order.fiat_currency || "USD"))}
            </div>
            <div className="mt-0.5 text-[12px] text-[var(--v2-muted)]">Window: {String(order.payment_window_minutes ?? "—")} min</div>
          </div>
        </div>

        {actionErrorText ? <div className="mt-3 text-sm text-[var(--v2-down)]">{actionErrorText}</div> : null}

        {expiresSoon ? (
          <div className="mt-2 rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 text-[12px] text-[var(--v2-muted)]">
            Payment window is ending soon. Complete payment steps now to avoid cancellation.
          </div>
        ) : null}

        {status === "disputed" ? (
          <div className="mt-2 rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 text-[12px] text-[var(--v2-muted)]">
            Disputed — support is reviewing this order. Add evidence in chat.
          </div>
        ) : null}

        <div className="mt-3 grid gap-2">
          {canPay ? (
            <V2Button variant="primary" fullWidth disabled={acting !== null} onClick={() => void doAction("PAY_CONFIRMED")}>
              {acting === "PAY_CONFIRMED" ? "Marking…" : "I have paid"}
            </V2Button>
          ) : null}
          {canRelease ? (
            <V2Button variant="primary" fullWidth disabled={acting !== null} onClick={() => void doAction("RELEASE")}>
              {acting === "RELEASE" ? "Releasing…" : "Release crypto"}
            </V2Button>
          ) : null}
          {canCancel ? (
            <V2Button variant="ghost" fullWidth disabled={acting !== null} onClick={() => void doAction("CANCEL")}>
              {acting === "CANCEL" ? "Canceling…" : "Cancel order"}
            </V2Button>
          ) : null}

          {canDispute ? (
            <V2Button variant="secondary" fullWidth disabled={openingDispute} onClick={() => void openDispute()}>
              {openingDispute ? "Opening dispute…" : "Open dispute"}
            </V2Button>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-3 shadow-[var(--v2-shadow-sm)]">
        <div className="text-[13px] font-semibold text-[var(--v2-text)]">Payment details</div>
        {snapshot.length === 0 ? (
          <div className="mt-2 text-[12px] text-[var(--v2-muted)]">No payment details available.</div>
        ) : (
          <div className="mt-2 grid gap-2">
            {snapshot.map((m, idx) => (
              <div key={String(m.id || idx)} className="rounded-xl bg-[var(--v2-surface-2)] px-2 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-[12px] font-semibold text-[var(--v2-text)]">{String(m.name || m.identifier)}</div>
                  {(() => {
                    const raw = (m.details as any)?.verifiedAgent;
                    const isVerified = raw === true || String(raw ?? "").toLowerCase() === "true";
                    return isVerified ? (
                      <span className="rounded-full border border-[var(--v2-border)] bg-[var(--v2-surface)] px-2 py-0.5 text-[11px] font-semibold text-[var(--v2-muted)]">
                        Verified agent
                      </span>
                    ) : null;
                  })()}
                </div>
                <div className="mt-0.5 text-[11px] text-[var(--v2-muted)]">{String(m.identifier)}</div>
                {m.details ? (
                  <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface)] p-2 text-[11px] text-[var(--v2-muted)]">
                    {JSON.stringify(m.details, null, 2)}
                  </pre>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {order.ad_terms ? (
          <div className="mt-3">
            <div className="text-[12px] font-semibold text-[var(--v2-muted)]">Terms</div>
            <div className="mt-1 whitespace-pre-wrap text-[12px] text-[var(--v2-text)]">{String(order.ad_terms)}</div>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-3 shadow-[var(--v2-shadow-sm)]">
        <div className="flex items-center justify-between">
          <div className="text-[13px] font-semibold text-[var(--v2-text)]">Chat</div>
          <div className="text-[12px] text-[var(--v2-muted)]">{messages.length}</div>
        </div>

        <div className="mt-3 grid gap-2">
          {messages.length === 0 ? (
            <div className="text-[12px] text-[var(--v2-muted)]">No messages yet.</div>
          ) : (
            messages.slice(-60).map((m) => {
              const isSystem = m.sender_id == null;
              return (
                <div key={String(m.id)} className="rounded-xl bg-[var(--v2-surface-2)] px-2 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold text-[var(--v2-muted)]">
                      {isSystem ? "System" : String(m.sender_email || "User")}
                    </div>
                    <div className="text-[11px] text-[var(--v2-muted)]">{fmtTime(m.created_at)}</div>
                  </div>
                  {m.is_image && String(m.content || "").startsWith("data:image/") ? (
                    <img
                      src={String(m.content)}
                      alt="Evidence"
                      className="mt-2 max-h-64 w-auto rounded-lg border border-[var(--v2-border)]"
                    />
                  ) : (
                    <div className="mt-1 whitespace-pre-wrap text-[12px] text-[var(--v2-text)]">{String(m.content || "")}</div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="mt-3 grid gap-2">
          <V2Input value={chat} onChange={(e) => setChat(e.target.value)} placeholder="Message…" />
          {chatError ? <div className="text-sm text-[var(--v2-down)]">{chatError}</div> : null}
          <input
            ref={chatImageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files && e.target.files[0];
              e.target.value = "";
              if (f) void sendChatImage(f);
            }}
          />
          <V2Button variant="secondary" fullWidth disabled={uploadingImage} onClick={() => chatImageInputRef.current?.click()}>
            {uploadingImage ? "Uploading…" : "Attach image"}
          </V2Button>
          <V2Button variant="primary" fullWidth disabled={sending} onClick={() => void sendChat()}>
            {sending ? "Sending…" : "Send"}
          </V2Button>
        </div>
      </div>
    </main>
  );
}
