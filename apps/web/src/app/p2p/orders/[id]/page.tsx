"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getPaymentMethodName } from "@/lib/p2p/constants";
import type { PaymentMethodSnapshot } from "@/lib/p2p/paymentSnapshot";
import { fiatFlag, paymentMethodBadge } from "@/lib/p2p/display";
import { Avatar } from "@/components/Avatar";
import { buttonClassName } from "@/components/ui/Button";
import { ApiError, fetchJsonOrThrow } from "@/lib/api/client";

function formatFiatMoney(
    value: string | number,
    currency: string,
    opts?: { minimumFractionDigits?: number; maximumFractionDigits?: number },
): string {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return `${value} ${currency}`;

    try {
        return new Intl.NumberFormat(undefined, {
            style: "currency",
            currency,
            currencyDisplay: "code",
            minimumFractionDigits: opts?.minimumFractionDigits ?? 2,
            maximumFractionDigits: opts?.maximumFractionDigits ?? 2,
        }).format(n);
    } catch {
        return `${n.toLocaleString()} ${currency}`;
    }
}

function formatAssetAmount(value: string | number, symbol: string): string {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return `${value} ${symbol}`;

    // Crypto amounts often need more precision than fiat, but should still look money-like.
    const formatted = new Intl.NumberFormat(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 8,
    }).format(n);
    return `${formatted} ${symbol}`;
}

function formatNumber(value: string | number, opts?: { minimumFractionDigits?: number; maximumFractionDigits?: number }): string {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return String(value);
    return new Intl.NumberFormat(undefined, {
        minimumFractionDigits: opts?.minimumFractionDigits,
        maximumFractionDigits: opts?.maximumFractionDigits,
    }).format(n);
}

function withDevUserHeader(init?: RequestInit): RequestInit {
    const headers = new Headers(init?.headers);
    if (typeof window !== "undefined") {
        const uid = localStorage.getItem("ts_user_id") ?? localStorage.getItem("pp_user_id");
        if (uid && !headers.has("x-user-id")) headers.set("x-user-id", uid);
    }
    return { ...init, headers, credentials: init?.credentials ?? "same-origin" };
}

// Types matching API response
type Order = {
  id: string;
    status: "created" | "paid_confirmed" | "completed" | "cancelled" | "disputed";
  asset_symbol: string;
  amount_asset: string;
  amount_fiat: string;
  fiat_currency: string;
  price: string;
    expires_at?: string | null;
    paid_at?: string | null;
  buyer_id: string;
  seller_id: string;
  buyer_email: string; // generic
  seller_email: string;
  payment_window_minutes: number;
  ad_terms: string;
  created_at: string;
  payment_method_ids: string[];
    payment_method_snapshot: PaymentMethodSnapshot[];
    payment_details_ready?: boolean;
};

type Message = {
  id: string;
  sender_id: string | null; // null = system
  content: string;
  created_at: string;
  sender_email?: string;
  is_image: boolean;
};

type P2POrderAction = "PAY_CONFIRMED" | "RELEASE" | "CANCEL";

type OrderDialogState =
    | null
    | { kind: "order_action"; action: P2POrderAction }
    | { kind: "open_dispute" };

// Simple hook to get current user ID (pseudo) - actually we need to know "Am I buyer or seller?"
// But the API returns everything. We can infer my role by comparing session.
// For now, I'll fetch /api/auth/me to get my ID, or just store it.
// Or we can rely on `order.is_buyer = (my_id == buyer_id)` if we knew my_id.
// Easier: Just fetch `/api/auth/session` or `/api/me`. 
// Whatever, let's fetch /api/p2p/orders/[id] and maybe the API can tell us "my_role"?
// Standard pattern: client checks user id.

export default function OrderPage() {
  const { id } = useParams() as { id: string };
  
  const [order, setOrder] = useState<Order | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<null | { code: string; message: string }>(null);
  const [msgInput, setMsgInput] = useState("");
    const [chatSending, setChatSending] = useState(false);
    const [chatError, setChatError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [actionNotice, setActionNotice] = useState<string | null>(null);
    const [actionDialog, setActionDialog] = useState<OrderDialogState>(null);
    const [cancelSafetyChecked, setCancelSafetyChecked] = useState(false);
    const [copiedField, setCopiedField] = useState<string | null>(null);
    const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

    const [disputeReason, setDisputeReason] = useState("");
    const [disputeLoading, setDisputeLoading] = useState(false);

    const [feedbackRating, setFeedbackRating] = useState<"positive" | "negative" | null>(null);
    const [feedbackComment, setFeedbackComment] = useState("");
    const [feedbackLoading, setFeedbackLoading] = useState(false);
    const [feedbackDone, setFeedbackDone] = useState(false);

    const [reputation, setReputation] = useState<null | {
        counts: { positive: number; negative: number; total: number };
    }>(null);

    const [refMid, setRefMid] = useState<number | null>(null);
    const [nowTick, setNowTick] = useState(() => Date.now());
  
  const bottomRef = useRef<HTMLDivElement>(null);

    // 1s clock tick for countdowns (payment window, etc.)
    useEffect(() => {
        const t = window.setInterval(() => setNowTick(Date.now()), 1000);
        return () => window.clearInterval(t);
    }, []);

    useEffect(() => {
        if (!order?.asset_symbol || !order?.fiat_currency) {
            setRefMid(null);
            return;
        }

        fetch(
            `/api/p2p/reference?asset=${encodeURIComponent(order.asset_symbol)}&fiat=${encodeURIComponent(order.fiat_currency)}`,
        )
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                const mid = typeof data?.mid === "number" ? data.mid : Number(data?.mid);
                setRefMid(Number.isFinite(mid) && mid > 0 ? mid : null);
            })
            .catch(() => setRefMid(null));
    }, [order?.asset_symbol, order?.fiat_currency]);

  // 1. Fetch User & Data
  useEffect(() => {
    // Fetch user first or parallel
    // Correct endpoint is /api/whoami which returns { user: {...} } or { user_id: null }
        fetch('/api/whoami')
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (data && data.user) {
                    setCurrentUser(data.user);
                }
            })
            .catch((err) => console.error("Failed to fetch user:", err));

    const fetchData = async () => {
      try {
                const res = await fetch(`/api/p2p/orders/${id}`);
                if (!res.ok) {
                    let code: string | undefined;
                    try {
                        const errBody = await res.json();
                        code = errBody?.error;
                    } catch {
                        // ignore
                    }

                    if (res.status === 401) {
                        setLoadError({
                            code: code || "unauthorized",
                            message: "You must be logged in to view this order.",
                        });
                        return false;
                    }

                    if (res.status === 404) {
                        setLoadError({
                            code: code || "order_not_found",
                            message: "Order not found (or you don't have access).",
                        });
                        return false;
                    }

                    setLoadError({
                        code: code || "load_failed",
                        message: "Failed to load this order.",
                    });
                    return false;
                }

                const data = await res.json();
                setLoadError(null);
                setOrder(data.order);
                setMessages(data.messages);
                setLastRefreshedAt(new Date());
                return true;
      } catch (err) {
        console.error(err);
                setLoadError({ code: "network_error", message: "Network error while loading this order." });
                return false;
      } finally {
        setLoading(false);
      }
    };

        let interval: ReturnType<typeof setInterval> | null = null;
        let stopped = false;

        (async () => {
            const ok = await fetchData();
            if (!ok) {
                stopped = true;
                if (interval) clearInterval(interval);
                return;
            }

            // Poll every 3s
            interval = setInterval(async () => {
                if (stopped) return;
                const stillOk = await fetchData();
                if (!stillOk) {
                    stopped = true;
                    if (interval) clearInterval(interval);
                }
            }, 3000);
        })();
    
        return () => {
            stopped = true;
            if (interval) clearInterval(interval);
        };
  }, [id]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (bottomRef.current) {
        bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  const sendMessage = async () => {
        const txt = msgInput.trim();
        if (!txt) return;
        if (chatSending) return;

        setChatError(null);
        setChatSending(true);
        try {
            const inserted = await fetchJsonOrThrow<Message>(`/api/p2p/orders/${id}/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: txt }),
            });

            setMsgInput("");
            setMessages((prev) => {
                if (prev.some((m) => m.id === inserted.id)) return prev;
                return [...prev, inserted];
            });
        } catch (err) {
            console.error(err);
            if (err instanceof ApiError) {
                if (err.code === "rate_limit_exceeded") {
                    setChatError("You’re sending messages too fast. Please wait a moment and try again.");
                } else if (
                    err.code === "csrf_no_origin" ||
                    err.code === "csrf_origin_mismatch" ||
                    err.code === "csrf_referer_mismatch" ||
                    err.code === "csrf_invalid_referer" ||
                    err.code === "csrf_token_mismatch"
                ) {
                    setChatError("Security check failed. Refresh the page and try sending again.");
                } else if (err.code === "unauthorized" || err.code === "missing_x_user_id" || err.code === "session_token_expired") {
                    setChatError("Your session expired. Please log in again.");
                } else {
                    setChatError("Failed to send message. Please try again.");
                }
            } else {
                setChatError("Failed to send message. Please try again.");
            }
        } finally {
            setChatSending(false);
        }
  };

    const counterparty = useMemo(() => {
        if (!order || !currentUser) return null;
        const isBuyer = currentUser.id === order.buyer_id;
        const otherId = isBuyer ? order.seller_id : order.buyer_id;
        const otherEmail = isBuyer ? order.seller_email : order.buyer_email;
        return { id: otherId, email: otherEmail };
    }, [order, currentUser]);

    useEffect(() => {
        if (!counterparty?.id) return;
        let cancelled = false;
        fetch(`/api/p2p/reputation/${counterparty.id}`)
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (cancelled) return;
                if (data?.counts) setReputation({ counts: data.counts });
            })
            .catch(() => {
                // ignore
            });
        return () => {
            cancelled = true;
        };
    }, [counterparty?.id]);

    const copyToClipboard = async (label: string, value: string) => {
        try {
            if (!value) return;
            await navigator.clipboard.writeText(value);
            setCopiedField(label);
            setTimeout(() => {
                setCopiedField((current) => (current === label ? null : current));
            }, 1500);
        } catch (error) {
            console.error("Failed to copy payment detail", error);
        }
    };

    const actionLabel: Record<string, string> = {
        PAY_CONFIRMED: "mark this order as paid",
        RELEASE: "release crypto to the buyer",
        CANCEL: "cancel this order",
    };

    const openActionDialog = (action: P2POrderAction) => {
        setActionError(null);
        setActionNotice(null);
        setCancelSafetyChecked(false);
        setActionDialog({ kind: "order_action", action });
    };

    const runOrderAction = async (action: P2POrderAction) => {
        setActionError(null);
        setActionLoading(true);
        try {
            const updated = await fetchJsonOrThrow<Partial<Order> | null>(
                `/api/p2p/orders/${id}/action`,
                withDevUserHeader({
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ action }),
                }),
            );

            if (updated && typeof updated === "object") {
                setOrder((prev) => (prev ? ({ ...prev, ...(updated as any) } as Order) : prev));
            }

            if (action === "PAY_CONFIRMED") {
                setActionNotice("Payment marked as sent. Waiting for the seller to release crypto…");
            } else if (action === "RELEASE") {
                setActionNotice("Release submitted. Finalizing order…");
            } else if (action === "CANCEL") {
                setActionNotice("Cancellation submitted. Updating order…");
            }
        } catch (e) {
            if (e instanceof ApiError) {
                const code = e.code;
                const msg =
                    (e.details && typeof e.details === "object" && "message" in (e.details as any) && typeof (e.details as any).message === "string"
                        ? (e.details as any).message
                        : typeof e.details === "string"
                            ? e.details
                            : undefined) as string | undefined;

                if (code === "csrf_token_mismatch") {
                    setActionError("Session expired. Refresh the page and try again.");
                } else if (code === "order_state_conflict") {
                    setActionError(msg || "Order state changed. Please refresh and try again.");
                } else if (code === "order_not_found") {
                    setActionError(msg || "Order not found (or access denied).");
                } else if (code === "actor_not_allowed") {
                    setActionError(msg || "You are not allowed to do that.");
                } else {
                    setActionError(msg || code || "Action failed");
                }
                return;
            }

            setActionError("Network error. Please try again.");
        } finally {
            setActionLoading(false);
        }
    };

    useEffect(() => {
        if (!order) return;
        if (order.status === "completed" || order.status === "cancelled" || order.status === "disputed") setActionNotice(null);
    }, [order]);

    const getDialogCopy = (action: P2POrderAction) => {
        const amountLine = order ? `${order.amount_fiat} ${order.fiat_currency}` : "the exact amount";
        if (action === "PAY_CONFIRMED") {
            return {
                title: "Confirm payment sent",
                body: `Only confirm after you have sent exactly ${amountLine} to the seller using the payout details shown on this page.`,
                confirmLabel: "I have paid",
                tone: "amber" as const,
            };
        }
        if (action === "RELEASE") {
            return {
                title: "Release crypto",
                body: "Only release after you have confirmed you received the fiat payment in your account. This completes the order.",
                confirmLabel: "Release now",
                tone: "green" as const,
            };
        }

        const roleBuyer = !!currentUser && !!order && currentUser.id === order.buyer_id;
        const roleSeller = !!currentUser && !!order && currentUser.id === order.seller_id;
        const cancelBody = roleBuyer
            ? "Canceling stops this trade and releases escrow. Only cancel if you have NOT sent payment."
            : roleSeller
                ? "Canceling stops this trade and releases escrow back to you. Only cancel if you have NOT received payment."
                : "Canceling stops this trade and releases escrow. Only cancel if no payment was sent.";
        return {
            title: "Cancel order",
            body: cancelBody,
            confirmLabel: "Cancel order",
            tone: "neutral" as const,
        };
    };

    const openDispute = async () => {
        if (!order) return;
        const reason = disputeReason.trim();
        if (reason.length < 5) {
            setActionError("Please enter at least 5 characters explaining the issue.");
            return;
        }
        setActionError(null);
        setActionNotice(null);
        setActionDialog({ kind: "open_dispute" });
    };

    const runOpenDispute = async () => {
        if (!order) return;
        const reason = disputeReason.trim();
        if (reason.length < 5) {
            setActionError("Please enter at least 5 characters explaining the issue.");
            return;
        }
        setDisputeLoading(true);
        try {
            await fetchJsonOrThrow(
                `/api/p2p/orders/${id}/dispute`,
                withDevUserHeader({
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ reason }),
                }),
            );
            setDisputeReason("");
            setActionNotice("Dispute opened. Support will review — keep communication in chat.");
        } catch (e) {
            if (e instanceof ApiError && e.code === "csrf_token_mismatch") {
                setActionError("Session expired. Refresh the page and try again.");
            } else if (e instanceof ApiError) {
                setActionError(typeof e.details === "string" ? e.details : e.code);
            } else {
                setActionError("Network error. Please try again.");
            }
        } finally {
            setDisputeLoading(false);
        }
    };

    const submitFeedback = async () => {
        if (!order) return;
        if (!feedbackRating) {
            setActionError("Please select a rating.");
            return;
        }
        setActionError(null);
        setActionNotice(null);
        setFeedbackLoading(true);
        try {
            await fetchJsonOrThrow(
                `/api/p2p/orders/${id}/feedback`,
                withDevUserHeader({
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        rating: feedbackRating,
                        comment: feedbackComment.trim() || undefined,
                    }),
                }),
            );
            setFeedbackDone(true);
        } catch (e) {
            if (e instanceof ApiError && e.code === "csrf_token_mismatch") {
                setActionError("Session expired. Refresh the page and try again.");
            } else if (e instanceof ApiError) {
                setActionError(typeof e.details === "string" ? e.details : e.code);
            } else {
                setActionError("Network error. Please try again.");
            }
        } finally {
            setFeedbackLoading(false);
        }
    };

    if (loading) return <div className="p-10 text-white">Loading...</div>;

    if (loadError) {
        return (
            <div className="min-h-screen bg-[var(--background)] p-6">
                <div className="mx-auto max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
                    <h1 className="text-lg font-bold text-[var(--foreground)]">Unable to open order</h1>
                    <p className="mt-2 text-sm text-[var(--muted)]">{loadError.message}</p>
                    <div className="mt-4 flex items-center gap-3">
                        <Link
                            href="/login"
                            className={buttonClassName({ variant: "primary", size: "md", className: "h-9" })}
                        >
                            Go to Login
                        </Link>
                        <Link
                            href="/p2p/orders"
                            className={buttonClassName({ variant: "secondary", size: "md", className: "h-9" })}
                        >
                            My Orders
                        </Link>
                    </div>
                    <div className="mt-4 text-xs text-[var(--muted)]">Error: {loadError.code}</div>
                </div>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="min-h-screen bg-[var(--background)] p-6">
                <div className="mx-auto max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
                    <h1 className="text-lg font-bold text-[var(--foreground)]">Order not available</h1>
                    <p className="mt-2 text-sm text-[var(--muted)]">This order could not be loaded.</p>
                </div>
            </div>
        );
    }

    const isBuyer = !!currentUser && currentUser.id === order.buyer_id;
    const isSeller = !!currentUser && currentUser.id === order.seller_id;
    const displayRole = isBuyer ? "BUYER" : isSeller ? "SELLER" : "";
    const paymentDetailsReady = Boolean(order.payment_details_ready);
    const isTerminal = order.status === "completed" || order.status === "cancelled";
    const canChat = (isBuyer || isSeller) && !isTerminal;
    const myLabel = isBuyer ? order.buyer_email : isSeller ? order.seller_email : "";

    const cancelMeta = (() => {
        const recentSystem = [...messages]
            .reverse()
            .find((m) => m.sender_id === null && typeof m.content === "string" && /System:/i.test(m.content) && /(cancel|expired)/i.test(m.content));
        const text = recentSystem?.content || "";
        const source = /cancelled by buyer\./i.test(text)
            ? ("buyer" as const)
            : /expired due to payment timeout|cancelled due to timeout/i.test(text)
                ? ("timeout" as const)
                : /cancelled by support/i.test(text)
                    ? ("support" as const)
                    : ("unknown" as const);
        return { source, text };
    })();

    const cancelSafetyLabel = isBuyer
        ? "I confirm I have NOT sent payment for this order."
        : isSeller
            ? "I confirm I have NOT received payment for this order."
            : "I confirm no payment was sent/received for this order.";

    const createdAtMs = Number.isFinite(new Date(order.created_at).getTime()) ? new Date(order.created_at).getTime() : nowTick;
    const expiresAtMs = order.expires_at ? new Date(order.expires_at).getTime() : null;
    const fallbackExpiresAtMs = createdAtMs + Math.max(1, order.payment_window_minutes) * 60_000;
    const deadlineMs = Number.isFinite(expiresAtMs ?? NaN) ? (expiresAtMs as number) : fallbackExpiresAtMs;
    const remainingMs = deadlineMs - nowTick;
    const hasDeadline = Number.isFinite(deadlineMs) && deadlineMs > 0;
    const isExpired = order.status === "created" && remainingMs <= 0;
    const formatRemaining = (ms: number) => {
        const clamped = Math.max(0, ms);
        const totalSeconds = Math.floor(clamped / 1000);
        const m = Math.floor(totalSeconds / 60);
        const s = totalSeconds % 60;
        return `${m}:${String(s).padStart(2, "0")}`;
    };
  
  // Calculations
  const statusColors = {
      created: "text-[var(--accent)]",
      paid_confirmed: "text-[var(--warn)]",
      disputed: "text-[var(--warn)]",
      completed: "text-[var(--up)]",
      cancelled: "text-[var(--muted)]"
  };

    const orderTitle =
        displayRole === "BUYER"
            ? `Buy ${order.asset_symbol}`
            : displayRole === "SELLER"
                ? `Sell ${order.asset_symbol}`
                : "P2P Order";

    const statusLabel = order.status.replace(/_/g, " ");

    const stepIndex = (() => {
        if (order.status === "created") return 1;
        if (order.status === "paid_confirmed") return 2;
        if (order.status === "disputed") return 2;
        if (order.status === "completed") return 3;
        return 0;
    })();

    const stepLabel = (i: number) => {
        if (i === 1) return isBuyer ? "Send payment" : "Await payment";
        if (i === 2) return isBuyer ? "Marked as paid" : "Verify + release";
        if (i === 3) return "Completed";
        return "";
    };
    const fiatMoney = formatFiatMoney(order.amount_fiat, order.fiat_currency);
    const assetMoney = formatAssetAmount(order.amount_asset, order.asset_symbol);
    const unitPrice = formatNumber(order.price, { minimumFractionDigits: 2, maximumFractionDigits: 6 });

    const nextStepText = (() => {
        if (!isBuyer && !isSeller) return "Log in to view your role for this order.";
        if (order.status === "disputed") return "This order is in dispute. Keep communication in chat while support reviews.";
        if (order.status === "completed") return "Order completed. Crypto has been released to the buyer.";
        if (order.status === "cancelled") return "Order cancelled. No further actions are available.";

        if (isBuyer && order.status === "created") {
            return `Pay the seller ${fiatMoney} using the payout details on this page, then mark as paid.`;
        }
        if (isBuyer && order.status === "paid_confirmed") {
            return "You marked payment as sent. Wait for the seller to verify and release crypto.";
        }
        if (isSeller && order.status === "created") {
            return "Wait for the buyer to pay. Do not release crypto until you have received funds.";
        }
        if (isSeller && order.status === "paid_confirmed") {
            return "Buyer marked as paid. Verify you received funds, then release crypto to complete the order.";
        }
        return "";
    })();

    const systemChipClassName = (content: string) => {
        const t = (content || "").toLowerCase();
        const isCreated = /order\s+created|escrow\s+secured|proceed\s+with\s+payment|payment\s+window/i.test(content) || /created|escrow/.test(t);
        const isPaid = /marked\s+as\s+paid|buyer\s+has\s+marked\s+as\s+paid|paid\b/.test(t);
        const isReleased = /crypto\s+released|order\s+completed|completed\b/.test(t);

        if (isReleased) {
            return "border-[color-mix(in_srgb,var(--up)_28%,var(--border))] bg-[color-mix(in_srgb,var(--up-bg)_70%,var(--bg))] text-[var(--foreground)]";
        }
        if (isPaid) {
            return "border-[color-mix(in_srgb,var(--warn)_28%,var(--border))] bg-[color-mix(in_srgb,var(--warn-bg)_70%,var(--bg))] text-[var(--foreground)]";
        }
        if (isCreated) {
            return "border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_10%,var(--bg))] text-[var(--foreground)]";
        }
        return "border-[var(--border)] bg-[var(--bg)] text-[var(--muted)]";
    };

  return (
        <div className="min-h-screen bg-[var(--background)] p-4 md:p-8">
            <div className="mx-auto max-w-6xl">
                {/* Synapse header */}
                <div className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
                    <div className="relative p-5 md:p-6">
                        <div className="pointer-events-none absolute inset-0 opacity-60"
                            style={{
                                background:
                                    "radial-gradient(600px 220px at 20% 0%, color-mix(in oklab, var(--accent) 25%, transparent) 0%, transparent 60%), radial-gradient(420px 220px at 80% 10%, color-mix(in oklab, var(--accent) 16%, transparent) 0%, transparent 55%)",
                            }}
                        />

                        <div className="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <div className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
                                    <h1 className="text-lg md:text-xl font-extrabold tracking-tight text-[var(--foreground)] truncate">
                                        {orderTitle}
                                    </h1>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                    {displayRole && (
                                        <span className="rounded-full border border-[var(--border)] bg-[var(--bg)] px-2 py-0.5 font-bold tracking-wide text-[var(--foreground)]">
                                            {displayRole}
                                        </span>
                                    )}
                                    <span className={`rounded-full border border-[var(--border)] bg-[var(--bg)] px-2 py-0.5 font-bold uppercase ${statusColors[order.status] || "text-[var(--foreground)]"}`}>
                                        {statusLabel}
                                    </span>
                                    <span className="rounded-full border border-[var(--border)] bg-[var(--bg)] px-2 py-0.5 font-semibold text-[var(--muted)]">
                                        ID {order.id.slice(0, 8)}
                                    </span>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                                    <div className="text-[10px] font-semibold text-[var(--muted)]">Fiat</div>
                                    <div className="text-sm font-extrabold text-[var(--foreground)] tabular-nums">{fiatMoney}</div>
                                </div>
                                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                                    <div className="text-[10px] font-semibold text-[var(--muted)]">Crypto</div>
                                    <div className="text-sm font-extrabold text-[var(--foreground)] tabular-nums">{assetMoney}</div>
                                </div>
                            </div>
                        </div>

                        {/* Stepper */}
                        <div className="relative mt-5 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 overflow-hidden">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                                    {[1, 2, 3].map((i) => {
                                        const active = stepIndex === i;
                                        const done = stepIndex > i;
                                        return (
                                            <div key={i} className="flex items-center gap-2">
                                                <div
                                                    className={
                                                        "h-7 w-7 rounded-full border flex items-center justify-center text-[11px] font-extrabold " +
                                                        (done
                                                            ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                                                            : active
                                                                ? "border-[var(--accent)] bg-transparent text-[var(--foreground)]"
                                                                : "border-[var(--border)] bg-transparent text-[var(--muted)]")
                                                    }
                                                >
                                                    {i}
                                                </div>
                                                <div className={"max-w-[140px] truncate text-xs font-semibold sm:max-w-none " + (active || done ? "text-[var(--foreground)]" : "text-[var(--muted)]")}>
                                                    {stepLabel(i)}
                                                </div>
                                                {i !== 3 && <div className="hidden sm:block h-px w-8 bg-[var(--border)]" />}
                                            </div>
                                        );
                                    })}
                                </div>

                                {hasDeadline && order.status === "created" && (
                                    <div
                                        className={
                                            "rounded-lg border px-3 py-2 text-xs font-semibold tabular-nums " +
                                            (remainingMs <= 0
                                                ? "border-[color-mix(in_srgb,var(--down)_25%,var(--border))] bg-[color-mix(in_srgb,var(--down-bg)_70%,var(--bg))] text-[var(--foreground)]"
                                                : remainingMs < 5 * 60_000
                                                    ? "border-[color-mix(in_srgb,var(--warn)_25%,var(--border))] bg-[color-mix(in_srgb,var(--warn-bg)_70%,var(--bg))] text-[var(--foreground)]"
                                                    : "border-[color-mix(in_srgb,var(--accent)_25%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_10%,var(--bg))] text-[var(--foreground)]")
                                        }
                                    >
                                        {remainingMs <= 0 ? "Payment window ended" : `Time left ${formatRemaining(remainingMs)}`}
                                    </div>
                                )}
                            </div>
                            <div className="mt-2 text-[10px] text-[var(--muted)]">
                                Signal rule: pay only to the payout details shown on this page. Ignore any different details sent via chat.
                            </div>
                        </div>
                    </div>
                </div>

                {(order.status === "completed" || order.status === "cancelled" || order.status === "disputed" || (order.status === "created" && isExpired)) && (
                    <div
                        className={
                            "mb-6 rounded-2xl border p-4 md:p-5 overflow-hidden relative " +
                            (order.status === "completed"
                                ? "border-[color-mix(in_srgb,var(--up)_25%,var(--border))] bg-[color-mix(in_srgb,var(--up-bg)_70%,var(--card))]"
                                : order.status === "disputed"
                                    ? "border-[color-mix(in_srgb,var(--warn)_25%,var(--border))] bg-[color-mix(in_srgb,var(--warn-bg)_70%,var(--card))]"
                                    : order.status === "cancelled"
                                        ? cancelMeta.source === "buyer"
                                            ? "border-[color-mix(in_srgb,var(--down)_25%,var(--border))] bg-[color-mix(in_srgb,var(--down-bg)_70%,var(--card))]"
                                            : "border-[color-mix(in_srgb,var(--warn)_25%,var(--border))] bg-[color-mix(in_srgb,var(--warn-bg)_70%,var(--card))]"
                                        : "border-[color-mix(in_srgb,var(--down)_25%,var(--border))] bg-[color-mix(in_srgb,var(--down-bg)_70%,var(--card))]")
                        }
                    >
                        <div
                            className="pointer-events-none absolute inset-0 opacity-55"
                            style={{
                                background:
                                    "radial-gradient(620px 220px at 20% 0%, color-mix(in oklab, var(--accent) 10%, transparent) 0%, transparent 60%), radial-gradient(420px 220px at 90% 10%, color-mix(in oklab, var(--accent-2) 8%, transparent) 0%, transparent 55%)",
                            }}
                        />
                        <div className="relative flex flex-col gap-1">
                            <div className="text-sm font-extrabold text-[var(--foreground)]">
                                {order.status === "completed"
                                    ? "Trade completed"
                                    : order.status === "disputed"
                                        ? "Trade in dispute"
                                        : order.status === "cancelled"
                                            ? "Trade cancelled"
                                            : "Payment window ended"}
                            </div>
                            <div className="text-xs text-[var(--muted)]">
                                {order.status === "completed"
                                    ? "Crypto has been released to the buyer. Chat is closed."
                                    : order.status === "disputed"
                                        ? "Keep communication in chat while support reviews."
                                        : order.status === "cancelled"
                                            ? cancelMeta.source === "timeout"
                                                ? "Order expired due to payment timeout. Escrow released."
                                                : cancelMeta.source === "buyer"
                                                    ? "Cancelled by buyer. Escrow released."
                                                    : cancelMeta.source === "support"
                                                        ? "Support cancelled this order."
                                                        : "This order was cancelled."
                                            : isBuyer
                                                ? "Do not send funds. If you already paid, open a dispute immediately and include proof in chat."
                                                : "Do not release crypto. You may cancel due to timeout to release escrow."}
                            </div>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Chat */}
                <div className="lg:col-span-2 flex flex-col h-[78vh] md:h-[80vh] bg-[var(--card)] rounded-2xl border border-[var(--border)] overflow-hidden">
                        <div className="relative p-4 border-b border-[var(--border)] bg-[var(--card-2)]">
                            <div
                                className="pointer-events-none absolute inset-0 opacity-50"
                                style={{
                                    background:
                                        "radial-gradient(500px 240px at 15% 0%, color-mix(in oklab, var(--accent) 18%, transparent) 0%, transparent 60%)",
                                }}
                            />

                            <div className="relative flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h2 className="text-sm md:text-base font-extrabold tracking-tight text-[var(--foreground)]">Synapse Chat</h2>
                                    <div className="mt-1 text-xs text-[var(--muted)]">
                                        Keep it factual: timestamps, references, and confirmations.
                                    </div>
                                </div>
                                <div className="shrink-0 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[10px]">
                                    <div className="font-bold text-[var(--foreground)]">Safety rail</div>
                                    <div className="mt-0.5 text-[var(--muted)]">Never pay to details sent in chat.</div>
                                </div>
                            </div>
                        </div>
            
                        <div className="relative flex-1 overflow-y-auto bg-[var(--background)] p-4 space-y-3">
                            <div
                                className="pointer-events-none absolute inset-0 opacity-70"
                                style={{
                                    background:
                                        "radial-gradient(900px 420px at 12% 0%, color-mix(in oklab, var(--accent) 10%, transparent) 0%, transparent 60%), radial-gradient(720px 380px at 88% 10%, color-mix(in oklab, var(--accent-2) 8%, transparent) 0%, transparent 55%), repeating-linear-gradient(0deg, color-mix(in oklab, var(--border) 8%, transparent) 0px, transparent 28px), repeating-linear-gradient(90deg, color-mix(in oklab, var(--border) 6%, transparent) 0px, transparent 34px)",
                                }}
                            />
                {messages.map((m) => {
                    const isMe = !!m.sender_id && !!currentUser && m.sender_id === currentUser.id;
                    const isSystem = m.sender_id === null;
                    if (isSystem) {
                        return (
                            <div key={m.id} className="flex justify-center my-4">
                                <span
                                    className={
                                        "text-[11px] rounded-full border px-3 py-1.5 font-semibold tracking-wide " +
                                        systemChipClassName(m.content)
                                    }
                                >
                                    {m.content}
                                </span>
                            </div>
                        )
                    }

                    const senderLabel =
                        m.sender_email ||
                        (m.sender_id === order.buyer_id
                            ? order.buyer_email
                            : m.sender_id === order.seller_id
                                ? order.seller_email
                                : "User");

                    return (
                        <div key={m.id} className={`flex gap-2 ${isMe ? "justify-end" : "justify-start"}`}>
                            {!isMe && (
                                <div className="pt-1">
                                    <Avatar
                                        seed={senderLabel}
                                        label={senderLabel}
                                        size={26}
                                        fallbackText={senderLabel.slice(0, 2).toUpperCase()}
                                    />
                                </div>
                            )}
                            <div className={`max-w-[82%] ${isMe ? "text-right" : "text-left"}`}>
                                {!isMe && (
                                    <div className="mb-1 text-[10px] font-semibold text-[var(--muted)] truncate">
                                        {senderLabel}
                                    </div>
                                )}
                                <div
                                    className={
                                        "rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words border " +
                                        (isMe
                                            ? "bg-[var(--accent)] text-white border-[color-mix(in_srgb,var(--accent)_50%,var(--border))] rounded-br-md"
                                            : "bg-[var(--bg)] text-[var(--foreground)] border-[var(--border)] rounded-bl-md")
                                    }
                                >
                                    {m.content}
                                </div>
                                <div className={`mt-1 text-[10px] text-[var(--muted)] ${isMe ? "text-right" : "text-left"}`}>
                                    {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </div>
                            </div>
                        </div>
                    );
                })}
                <div ref={bottomRef} />
            </div>

            <div className="p-4 border-t border-[var(--border)] bg-[var(--card-2)]">
                {chatError ? (
                    <div className="mb-2 rounded-lg border border-[color-mix(in_srgb,var(--down)_25%,var(--border))] bg-[color-mix(in_srgb,var(--down-bg)_70%,var(--bg))] px-3 py-2 text-xs text-[var(--foreground)]">
                        {chatError}
                    </div>
                ) : null}

                <div className="flex gap-2">
                    <input
                        disabled={!canChat}
                        className="flex-1 bg-[var(--background)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)] disabled:opacity-60"
                        placeholder={
                            !isBuyer && !isSeller
                                ? "Log in to chat"
                                : isTerminal
                                    ? "Chat is closed for finished orders"
                                    : "Type a message…"
                        }
                        value={msgInput}
                        onChange={(e) => setMsgInput(e.target.value)}
                        onKeyDown={(e) => (e.key === "Enter" && canChat ? sendMessage() : null)}
                    />
                    <button
                        disabled={!canChat || !msgInput.trim() || chatSending}
                        onClick={sendMessage}
                        className={buttonClassName({ variant: "primary", size: "md", className: "rounded-xl" })}
                    >
                        {chatSending ? "Sending…" : "Send"}
                    </button>
                </div>
            </div>
        </div>

        {/* Right Column: Order Info */}
        <div className="space-y-6">

            {/* Next step (role-aware) */}
            <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-6">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-extrabold text-[var(--foreground)]">Next step</h3>
                        <p className="mt-1 text-xs text-[var(--muted)]">A clean checklist tailored to your role.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {displayRole && (
                            <span className="rounded-full border border-[var(--border)] bg-[var(--bg)] px-2 py-0.5 text-[10px] font-bold tracking-wide text-[var(--foreground)]">
                                {displayRole}
                            </span>
                        )}
                    </div>
                </div>

                <div
                    className={
                        "mt-4 rounded-xl border px-4 py-3 text-xs " +
                        (order.status === "disputed"
                            ? "border-[color-mix(in_srgb,var(--warn)_25%,var(--border))] bg-[color-mix(in_srgb,var(--warn-bg)_70%,var(--bg))] text-[var(--foreground)]"
                            : order.status === "paid_confirmed"
                                ? "border-[color-mix(in_srgb,var(--warn)_25%,var(--border))] bg-[color-mix(in_srgb,var(--warn-bg)_70%,var(--bg))] text-[var(--foreground)]"
                                : order.status === "created"
                                    ? "border-[color-mix(in_srgb,var(--accent)_25%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_10%,var(--bg))] text-[var(--foreground)]"
                                    : "border-[var(--border)] bg-[var(--bg)] text-[var(--muted)]")
                    }
                >
                    <div className="font-semibold">{nextStepText}</div>
                    {isBuyer && order.status === "created" && (
                        <div className="mt-2 text-[10px] opacity-90">
                            Tip: copy payout details from “Seller Payment Details” below. If details are missing, do not pay.
                        </div>
                    )}
                    {isSeller && order.status === "paid_confirmed" && (
                        <div className="mt-2 text-[10px] opacity-90">
                            Tip: verify your incoming payment first. Release is final for this order.
                        </div>
                    )}
                </div>
            </div>

            {/* Order Details Card */}
            <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-extrabold text-[var(--foreground)]">Trade summary</h3>
                    <span className={`rounded-full border border-[var(--border)] bg-[var(--bg)] px-2 py-0.5 text-[10px] font-bold uppercase ${statusColors[order.status] || "text-[var(--foreground)]"}`}>
                        {statusLabel}
                    </span>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs">
                    <span className="text-[var(--muted)]">Payment details</span>
                    <span
                        className={`rounded-full border px-2 py-0.5 font-semibold ${
                            paymentDetailsReady
                                ? "border-[color-mix(in_srgb,var(--up)_25%,var(--border))] bg-[color-mix(in_srgb,var(--up-bg)_70%,var(--bg))] text-[var(--foreground)]"
                                : "border-[color-mix(in_srgb,var(--warn)_25%,var(--border))] bg-[color-mix(in_srgb,var(--warn-bg)_70%,var(--bg))] text-[var(--foreground)]"
                        }`}
                    >
                        {paymentDetailsReady ? "Verified" : "Missing"}
                    </span>
                </div>
                
                <div className="space-y-2 text-sm">
                    {counterparty && (
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-[var(--muted)]">Counterparty</span>
                            <div className="flex items-center gap-2">
                                <Avatar
                                    seed={counterparty.email || counterparty.id}
                                    label={counterparty.email || counterparty.id}
                                    size={28}
                                    fallbackText={(counterparty.email || counterparty.id).slice(0, 2).toUpperCase()}
                                />
                                <span className="text-[var(--foreground)] text-xs font-mono">
                                    {counterparty.email || `${counterparty.id.slice(0, 8)}…`}
                                </span>
                            </div>
                        </div>
                    )}
                    {reputation?.counts && (
                        <div className="flex justify-between">
                            <span className="text-[var(--muted)]">Reputation</span>
                            <span className="text-[var(--foreground)] text-xs">
                                {reputation.counts.positive}👍 {reputation.counts.negative}👎 ({reputation.counts.total})
                            </span>
                        </div>
                    )}
                    <div className="flex justify-between">
                        <span className="text-[var(--muted)]">Fiat Amount</span>
                        <span className="font-bold text-[var(--foreground)] text-lg tabular-nums">
                            {fiatMoney}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-[var(--muted)]">Crypto Amount</span>
                        <span className="font-bold text-[var(--foreground)] tabular-nums">
                            {assetMoney}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-[var(--muted)]">Price per unit</span>
                        <span className="text-[var(--foreground)] tabular-nums">
                            {unitPrice}{" "}
                            {fiatFlag(order.fiat_currency) ? `${fiatFlag(order.fiat_currency)} ` : ""}
                            {order.fiat_currency}/{order.asset_symbol}
                        </span>
                    </div>
                    {refMid && (
                        <div className="flex justify-between">
                            <span className="text-[var(--muted)]">Reference</span>
                            <span className="text-[var(--muted)] text-xs tabular-nums">
                                ~{formatNumber(refMid, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} {order.fiat_currency}/{order.asset_symbol}
                            </span>
                        </div>
                    )}
                    {hasDeadline && (
                        <div className="flex justify-between">
                            <span className="text-[var(--muted)]">Payment window</span>
                            <span className="text-[var(--foreground)] text-xs tabular-nums">
                                {order.payment_window_minutes} min
                                {order.status === "created"
                                    ? " • " + (remainingMs <= 0 ? "ended" : formatRemaining(remainingMs) + " left")
                                    : ""}
                            </span>
                        </div>
                    )}
                     <div className="flex justify-between pt-2 border-t border-[var(--border)]">
                        <span className="text-[var(--muted)]">Order ID</span>
                        <span className="text-[var(--muted)] text-xs font-mono">{order.id.slice(0,8)}</span>
                    </div>
                </div>
            </div>

            {/* Dispute */}
            <div className="relative bg-[var(--card)] rounded-2xl border border-[var(--border)] p-6 space-y-3 overflow-hidden">
                <div
                    className="pointer-events-none absolute inset-0 opacity-55"
                    style={{
                        background:
                            "radial-gradient(520px 220px at 15% 0%, color-mix(in oklab, var(--warn) 16%, transparent) 0%, transparent 60%), radial-gradient(360px 220px at 90% 10%, color-mix(in oklab, var(--accent-2) 10%, transparent) 0%, transparent 55%)",
                    }}
                />
                <div className="relative flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="grid h-7 w-7 place-items-center rounded-full border border-[var(--border)] bg-[var(--bg)] text-[var(--warn)] text-sm">!</span>
                        <h3 className="text-sm font-extrabold text-[var(--foreground)]">Dispute</h3>
                    </div>
                    <span className="text-[10px] font-semibold text-[var(--muted)]">Escalation rail</span>
                </div>
                {order.status === "disputed" ? (
                    <div className="relative rounded-xl border border-[color-mix(in_srgb,var(--warn)_25%,var(--border))] bg-[color-mix(in_srgb,var(--warn-bg)_70%,var(--bg))] px-3 py-2 text-xs text-[var(--foreground)]">
                        This order is currently in dispute. Keep communication in chat while support reviews.
                    </div>
                ) : order.status === "completed" || order.status === "cancelled" ? (
                    <div className="rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--muted)]">
                        Disputes are only available for active orders.
                    </div>
                ) : (
                    <>
                        <textarea
                            value={disputeReason}
                            onChange={(e) => setDisputeReason(e.target.value)}
                            placeholder="Explain the issue (e.g. paid but seller not releasing, wrong payment details, etc.)"
                            className="relative min-h-[90px] w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                        />
                        <button
                            disabled={disputeLoading}
                            onClick={openDispute}
                            className={buttonClassName({
                                variant: "warning",
                                size: "md",
                                fullWidth: true,
                                className: "rounded-xl",
                            })}
                        >
                            {disputeLoading ? "Opening dispute..." : "Open Dispute"}
                        </button>
                        <div className="text-xs text-[var(--muted)]">Only open a dispute if you can’t resolve via chat.</div>
                    </>
                )}
            </div>

            {/* Feedback */}
            <div className="relative bg-[var(--card)] rounded-2xl border border-[var(--border)] p-6 space-y-3 overflow-hidden">
                <div
                    className="pointer-events-none absolute inset-0 opacity-55"
                    style={{
                        background:
                            "radial-gradient(520px 220px at 15% 0%, color-mix(in oklab, var(--up) 14%, transparent) 0%, transparent 60%), radial-gradient(360px 220px at 90% 10%, color-mix(in oklab, var(--accent) 10%, transparent) 0%, transparent 55%)",
                    }}
                />
                <div className="relative flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="grid h-7 w-7 place-items-center rounded-full border border-[var(--border)] bg-[var(--bg)] text-[var(--up)] text-sm">✓</span>
                        <h3 className="text-sm font-extrabold text-[var(--foreground)]">Feedback</h3>
                    </div>
                    <span className="text-[10px] font-semibold text-[var(--muted)]">Reputation signal</span>
                </div>
                {order.status !== "completed" ? (
                    <div className="rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--muted)]">
                        Feedback becomes available after the order completes.
                    </div>
                ) : feedbackDone ? (
                    <div className="rounded-xl border border-[color-mix(in_srgb,var(--up)_25%,var(--border))] bg-[color-mix(in_srgb,var(--up-bg)_70%,var(--bg))] px-3 py-2 text-xs text-[var(--foreground)]">
                        Thanks — your feedback was submitted.
                    </div>
                ) : (
                    <>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setFeedbackRating("positive")}
                                className={
                                    "flex-1 rounded-xl border px-3 py-2 text-sm font-extrabold transition " +
                                    (feedbackRating === "positive"
                                        ? "border-[color-mix(in_srgb,var(--up)_35%,var(--border))] bg-[color-mix(in_srgb,var(--up-bg)_70%,var(--bg))] text-[var(--foreground)]"
                                        : "border-[var(--border)] bg-[var(--bg)] text-[var(--foreground)] hover:bg-[var(--card-2)]")
                                }
                            >
                                Positive
                            </button>
                            <button
                                type="button"
                                onClick={() => setFeedbackRating("negative")}
                                className={
                                    "flex-1 rounded-xl border px-3 py-2 text-sm font-extrabold transition " +
                                    (feedbackRating === "negative"
                                        ? "border-[color-mix(in_srgb,var(--down)_35%,var(--border))] bg-[color-mix(in_srgb,var(--down-bg)_70%,var(--bg))] text-[var(--foreground)]"
                                        : "border-[var(--border)] bg-[var(--bg)] text-[var(--foreground)] hover:bg-[var(--card-2)]")
                                }
                            >
                                Negative
                            </button>
                        </div>
                        <textarea
                            value={feedbackComment}
                            onChange={(e) => setFeedbackComment(e.target.value)}
                            placeholder="Optional comment"
                            className="min-h-[80px] w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                        />
                        <button
                            disabled={feedbackLoading}
                            onClick={submitFeedback}
                            className={buttonClassName({
                                variant: "secondary",
                                size: "md",
                                fullWidth: true,
                                className: "rounded-xl",
                            })}
                        >
                            {feedbackLoading ? "Submitting..." : "Submit Feedback"}
                        </button>
                    </>
                )}
            </div>

            {/* Terms Card */}
            <div className="relative bg-[var(--card)] rounded-2xl border border-[var(--border)] p-6 overflow-hidden">
                <div
                    className="pointer-events-none absolute inset-0 opacity-55"
                    style={{
                        background:
                            "radial-gradient(520px 220px at 15% 0%, color-mix(in oklab, var(--accent-2) 10%, transparent) 0%, transparent 60%), radial-gradient(360px 220px at 90% 10%, color-mix(in oklab, var(--accent) 10%, transparent) 0%, transparent 55%)",
                    }}
                />
                <h3 className="relative text-sm font-extrabold text-[var(--foreground)] mb-2">Advertiser Terms</h3>
                <p className="text-sm text-[var(--foreground)] whitespace-pre-wrap">{order.ad_terms || "No specific terms."}</p>
            </div>

            {/* Payment Methods / Details */}
            <div className="relative bg-[var(--card)] rounded-2xl border border-[var(--border)] p-6 overflow-hidden">
                <div
                    className="pointer-events-none absolute inset-0 opacity-55"
                    style={{
                        background:
                            "radial-gradient(520px 220px at 15% 0%, color-mix(in oklab, var(--accent) 14%, transparent) 0%, transparent 60%), radial-gradient(360px 220px at 90% 10%, color-mix(in oklab, var(--accent-2) 12%, transparent) 0%, transparent 55%)",
                    }}
                />
                <div className="relative flex items-center justify-between mb-3">
                    <h3 className="text-sm font-extrabold text-[var(--foreground)]">
                    {isBuyer
                      ? "Seller Payment Details"
                      : isSeller
                        ? "Your Payment Details Shared With Buyer"
                        : "Payment Details"}
                    </h3>
                    <span className="text-[10px] font-semibold text-[var(--muted)]">Payout rail</span>
                </div>

                {isBuyer ? (
                    <p className="relative mb-3 rounded-xl border border-[color-mix(in_srgb,var(--warn)_25%,var(--border))] bg-[color-mix(in_srgb,var(--warn-bg)_70%,var(--bg))] px-3 py-2 text-xs text-[var(--foreground)]">
                        Pay only to the seller details shown below. Ignore any different account sent in chat.
                    </p>
                ) : isSeller ? (
                    <p className="relative mb-3 rounded-xl border border-[color-mix(in_srgb,var(--accent)_25%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_10%,var(--bg))] px-3 py-2 text-xs text-[var(--foreground)]">
                        The buyer is instructed to pay only to these details.
                    </p>
                ) : (
                    <p className="mb-3 rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--muted)]">
                        Payment details are shown to order participants.
                    </p>
                )}
                
                {/* 1. Show Snapshot Details (Rich Info) */}
                {Array.isArray(order.payment_method_snapshot) && order.payment_method_snapshot.length > 0 ? (
                    <div className="space-y-3">
                        {order.payment_method_snapshot.map((pm, idx: number) => (
                             <div key={idx} className="relative p-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
                                 <div
                                     className="pointer-events-none absolute inset-0 opacity-35"
                                     style={{
                                         background:
                                             "radial-gradient(420px 160px at 20% 0%, color-mix(in oklab, var(--accent) 12%, transparent) 0%, transparent 60%)",
                                     }}
                                 />
                                 <div className="flex items-center gap-2 mb-2">
                                     <span className="font-bold text-sm text-[var(--foreground)]">
                                         {pm.name || getPaymentMethodName(pm.identifier)}
                                     </span>
                                     <span className={paymentMethodBadge(pm.identifier).className}>
                                         {paymentMethodBadge(pm.identifier).label}
                                     </span>
                                 </div>
                                 {pm.details ? (
                                     <div className="grid grid-cols-1 gap-1 text-xs">
                                         {Object.entries(pm.details).map(([key, val]) => (
                                             <div key={key} className="flex justify-between border-b last:border-0 border-[var(--border)] py-1">
                                                 <span className="text-[var(--muted)] capitalize">{key.replace(/_/g, " ")}</span>
                                                                                                 <div className="flex items-center gap-2">
                                                                                                        <span className="font-mono select-all text-[var(--foreground)]">{String(val)}</span>
                                                                                                        <button
                                                                                                            type="button"
                                                                                                            onClick={() => copyToClipboard(`${pm.identifier}-${key}`, String(val ?? ""))}
                                                                                                            className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-2)]"
                                                                                                        >
                                                                                                            {copiedField === `${pm.identifier}-${key}` ? "Copied" : "Copy"}
                                                                                                        </button>
                                                                                                 </div>
                                             </div>
                                         ))}
                                     </div>
                                 ) : (
                                     <p className="text-xs text-[var(--muted)]">No specific details provided. Please ask in chat.</p>
                                 )}
                             </div>
                        ))}
                    </div>
                ) : (
                    /* 2. Fallback to IDs (Legacy) */
                    <div className="space-y-2">
                                                <p className="text-xs text-[var(--muted)]">Payment method IDs (legacy):</p>
                        <div className="flex flex-wrap gap-2">
                            {order.payment_method_ids?.map(id => (
                                                            <span key={id} className="rounded-full bg-[var(--bg)] px-3 py-1 text-xs border border-[var(--border)] font-medium">
                                                                {String(id).slice(0, 8)}…
                              </span>
                            ))}
                        </div>
                        <p className="mt-2 rounded-xl border border-[color-mix(in_srgb,var(--warn)_25%,var(--border))] bg-[color-mix(in_srgb,var(--warn-bg)_70%,var(--bg))] px-3 py-2 text-xs text-[var(--foreground)]">
                            Seller account details are missing for this order. Do not transfer funds until exact seller details are visible here.
                        </p>
                    </div>
                )}
            </div>

            {/* Action Buttons */}
            <div className="relative bg-[var(--card)] rounded-2xl border border-[var(--border)] p-6 space-y-3 overflow-hidden">
                <div
                    className="pointer-events-none absolute inset-0 opacity-55"
                    style={{
                        background:
                            "radial-gradient(520px 220px at 15% 0%, color-mix(in oklab, var(--up) 12%, transparent) 0%, transparent 60%), radial-gradient(360px 220px at 90% 10%, color-mix(in oklab, var(--warn) 10%, transparent) 0%, transparent 55%)",
                    }}
                />
                <div className="relative flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="grid h-7 w-7 place-items-center rounded-full border border-[var(--border)] bg-[var(--bg)] text-[var(--accent)] text-sm">◆</span>
                        <h3 className="text-sm font-extrabold text-[var(--foreground)]">Actions</h3>
                    </div>
                    <span className="text-[10px] font-semibold text-[var(--muted)]">Execution rail</span>
                </div>

                {actionError && (
                    <div className="rounded-xl border border-[color-mix(in_srgb,var(--down)_25%,var(--border))] bg-[color-mix(in_srgb,var(--down-bg)_70%,var(--bg))] px-3 py-2 text-xs text-[var(--foreground)]">
                        {actionError}
                    </div>
                )}
                {actionNotice && (
                    <div className="rounded-xl border border-[color-mix(in_srgb,var(--warn)_25%,var(--border))] bg-[color-mix(in_srgb,var(--warn-bg)_70%,var(--bg))] px-3 py-2 text-xs text-[var(--foreground)]">
                        {actionNotice}
                    </div>
                )}

                {!isBuyer && !isSeller && (
                    <div className="rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--muted)]">
                        Your role for this order is not available yet. If this persists, refresh the page.
                    </div>
                )}
                
                {order.status === 'completed' && (
                    <div className="p-3 rounded-xl border border-[color-mix(in_srgb,var(--up)_25%,var(--border))] bg-[color-mix(in_srgb,var(--up-bg)_70%,var(--bg))] text-[var(--foreground)] text-center font-extrabold">
                        Order Completed Successfully
                    </div>
                )}
                
                {order.status === 'cancelled' && (
                    <div
                        className={
                            "p-3 rounded-xl border text-center overflow-hidden relative " +
                            (cancelMeta.source === "buyer"
                                ? "border-[color-mix(in_srgb,var(--down)_25%,var(--border))] bg-[color-mix(in_srgb,var(--down-bg)_70%,var(--bg))] text-[var(--foreground)]"
                                : "border-[color-mix(in_srgb,var(--warn)_25%,var(--border))] bg-[color-mix(in_srgb,var(--warn-bg)_70%,var(--bg))] text-[var(--foreground)]")
                        }
                    >
                        <div className="font-extrabold">Order Cancelled</div>
                        <div className="mt-1 text-[10px] font-semibold text-[var(--muted)]">
                            {cancelMeta.source === "timeout"
                                ? "Expired due to payment timeout."
                                : cancelMeta.source === "buyer"
                                    ? "Cancelled by buyer."
                                    : cancelMeta.source === "support"
                                        ? "Cancelled by support."
                                        : ""}
                        </div>
                    </div>
                )}

                {/* BUYER ACTIONS */}
                {isBuyer && order.status === 'created' && (
                    <>
                        {isExpired && (
                            <div className="rounded-xl border border-[color-mix(in_srgb,var(--down)_25%,var(--border))] bg-[color-mix(in_srgb,var(--down-bg)_70%,var(--bg))] px-3 py-2 text-xs text-[var(--foreground)]">
                                Payment window ended. Do not send funds. This order will expire and escrow will be released.
                            </div>
                        )}
                        {!paymentDetailsReady && (
                            <div className="rounded-xl border border-[color-mix(in_srgb,var(--warn)_25%,var(--border))] bg-[color-mix(in_srgb,var(--warn-bg)_70%,var(--bg))] px-3 py-2 text-xs text-[var(--foreground)]">
                                Seller payout details are not complete yet. Do not transfer funds and do not mark as paid.
                            </div>
                        )}
                        <button 
                            disabled={actionLoading || !paymentDetailsReady || isExpired}
                            onClick={() => openActionDialog("PAY_CONFIRMED")}
                            className={buttonClassName({
                                variant: "warning",
                                size: "md",
                                fullWidth: true,
                                className: "rounded-xl py-3",
                            })}
                        >
                            {isExpired ? "Payment window ended" : "Mark as Paid"}
                        </button>
                        <button 
                            disabled={actionLoading}
                            onClick={() => openActionDialog("CANCEL")}
                            className={buttonClassName({
                                variant: "danger",
                                size: "md",
                                fullWidth: true,
                                className: "rounded-xl py-2",
                            })}
                        >
                            Cancel Order
                        </button>
                        <p className="text-xs text-[var(--muted)] text-center mt-2">
                            Please transfer exactly <b>{order.amount_fiat} {order.fiat_currency}</b> to the seller.
                        </p>
                    </>
                )}

                {isBuyer && order.status === 'paid_confirmed' && (
                    <div className="space-y-3">
                        <div className="text-center p-3 rounded-xl border border-[color-mix(in_srgb,var(--warn)_25%,var(--border))] bg-[color-mix(in_srgb,var(--warn-bg)_70%,var(--bg))] text-[var(--foreground)] font-semibold">
                            Waiting for Seller to Release...
                        </div>
                    </div>
                )}

                {/* SELLER ACTIONS */}
                {isSeller && order.status === 'created' && (
                    <div className="space-y-3">
                        <div className="text-center p-3 rounded-xl border border-[color-mix(in_srgb,var(--accent)_25%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_10%,var(--bg))] text-[var(--foreground)] font-semibold">
                            {isExpired ? "Payment window ended" : "Waiting for Buyer to Pay…"}
                        </div>
                        {isExpired ? (
                            <button
                                disabled={actionLoading}
                                onClick={() => openActionDialog("CANCEL")}
                                className={buttonClassName({
                                    variant: "warning",
                                    size: "md",
                                    fullWidth: true,
                                    className: "rounded-xl py-2",
                                })}
                            >
                                Cancel (timeout)
                            </button>
                        ) : null}
                    </div>
                )}
                
                {isSeller && order.status === 'paid_confirmed' && (

                    <>
                        <button 
                           disabled={actionLoading}
                                    onClick={() => openActionDialog("RELEASE")}
                                    className={buttonClassName({
                                        variant: "success",
                                        size: "md",
                                        fullWidth: true,
                                        className: "rounded-xl py-3",
                                    })}
                        >
                            Release Crypto ({order.amount_asset} {order.asset_symbol})
                        </button>
                                <p className="text-xs text-[var(--muted)] text-center mt-2">
                           Only release after you’ve confirmed you received the payment in your payout account.
                        </p>
                    </>
                )}
            </div>

            {actionDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/60"
                        onClick={() => (actionLoading ? null : setActionDialog(null))}
                    />
                    <div className="relative w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-2)] overflow-hidden">
                        <div
                            className="pointer-events-none absolute inset-0 opacity-60"
                            style={{
                                background:
                                    "radial-gradient(620px 220px at 20% 0%, color-mix(in oklab, var(--accent) 14%, transparent) 0%, transparent 60%), radial-gradient(420px 220px at 90% 10%, color-mix(in oklab, var(--accent-2) 10%, transparent) 0%, transparent 55%)",
                            }}
                        />
                        <div className="p-5">
                            <div className="relative text-sm font-extrabold text-[var(--foreground)]">
                                {actionDialog.kind === "order_action"
                                    ? getDialogCopy(actionDialog.action).title
                                    : "Open dispute"}
                            </div>
                            <div className="relative mt-2 text-xs text-[var(--muted)]">
                                {actionDialog.kind === "order_action"
                                    ? getDialogCopy(actionDialog.action).body
                                    : "Support will review this order. Open a dispute only if you can’t resolve the issue in chat."}
                            </div>
                            {actionDialog.kind === "order_action" && actionDialog.action === "PAY_CONFIRMED" && (
                                <div className="relative mt-3 rounded-xl border border-[color-mix(in_srgb,var(--warn)_25%,var(--border))] bg-[color-mix(in_srgb,var(--warn-bg)_70%,var(--bg))] px-3 py-2 text-xs text-[var(--foreground)]">
                                    Next: the seller will verify your payment, then release crypto to your wallet.
                                </div>
                            )}
                            {actionDialog.kind === "open_dispute" && (
                                <div className="relative mt-3 rounded-xl border border-[color-mix(in_srgb,var(--warn)_25%,var(--border))] bg-[color-mix(in_srgb,var(--warn-bg)_70%,var(--bg))] px-3 py-2 text-xs text-[var(--foreground)]">
                                    Don’t share sensitive info. Keep evidence and payment references in chat.
                                </div>
                            )}
                            {actionDialog.kind === "order_action" && actionDialog.action === "CANCEL" && (
                                <label className="relative mt-4 flex items-start gap-2 rounded-xl border border-[color-mix(in_srgb,var(--warn)_25%,var(--border))] bg-[color-mix(in_srgb,var(--warn-bg)_55%,var(--bg))] px-3 py-2 text-xs text-[var(--foreground)]">
                                    <input
                                        type="checkbox"
                                        checked={cancelSafetyChecked}
                                        onChange={(e) => setCancelSafetyChecked(e.target.checked)}
                                        className="mt-0.5 h-4 w-4 accent-[var(--warn)]"
                                        disabled={actionLoading}
                                    />
                                    <span className="font-semibold">{cancelSafetyLabel}</span>
                                </label>
                            )}
                            <div className="relative mt-5 grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    disabled={actionLoading}
                                    onClick={() => setActionDialog(null)}
                                    className={buttonClassName({
                                        variant: "secondary",
                                        size: "md",
                                        fullWidth: true,
                                        className: "rounded-xl text-[var(--muted)] hover:text-[var(--foreground)]",
                                    })}
                                >
                                    Back
                                </button>
                                <button
                                    type="button"
                                    disabled={
                                        actionLoading ||
                                        (actionDialog.kind === "order_action" &&
                                            actionDialog.action === "CANCEL" &&
                                            !cancelSafetyChecked)
                                    }
                                    onClick={async () => {
                                        setActionDialog(null);
                                        if (actionDialog.kind === "order_action") {
                                            await runOrderAction(actionDialog.action);
                                        } else {
                                            await runOpenDispute();
                                        }
                                    }}
                                    className={(() => {
                                        const variant =
                                            actionDialog.kind === "open_dispute"
                                                ? ("warning" as const)
                                                : actionDialog.action === "RELEASE"
                                                    ? ("success" as const)
                                                    : actionDialog.action === "PAY_CONFIRMED"
                                                        ? ("warning" as const)
                                                        : ("secondary" as const);

                                        const extra =
                                            actionDialog.kind === "open_dispute" ||
                                            actionDialog.action === "RELEASE" ||
                                            actionDialog.action === "PAY_CONFIRMED"
                                                ? "rounded-xl"
                                                : "rounded-xl bg-[var(--foreground)] text-white hover:brightness-110";

                                        return buttonClassName({
                                            variant,
                                            size: "md",
                                            fullWidth: true,
                                            className: extra,
                                        });
                                    })()}
                                >
                                    {actionLoading
                                        ? "Working…"
                                        : actionDialog.kind === "open_dispute"
                                            ? "Open dispute"
                                            : getDialogCopy(actionDialog.action).confirmLabel}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
      </div>
        </div>
    </div>
  );
}
