"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getPaymentMethodName } from "@/lib/p2p/constants";
import type { PaymentMethodSnapshot } from "@/lib/p2p/paymentSnapshot";

// Types matching API response
type Order = {
  id: string;
    status: "created" | "paid_confirmed" | "completed" | "cancelled" | "disputed";
  asset_symbol: string;
  amount_asset: string;
  amount_fiat: string;
  fiat_currency: string;
  price: string;
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
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
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
  
  const bottomRef = useRef<HTMLDivElement>(null);

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
    if (!msgInput.trim()) return;
    try {
      const txt = msgInput;
      setMsgInput(""); // Optimistic clear
      await fetch(`/api/p2p/orders/${id}/chat`, {
        method: 'POST',
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ content: txt }),
      });
      // specific polling will catch it, or we insert locally?
      // let's wait for poll
    } catch (err) {
      console.error(err);
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

  const doAction = async (action: string) => {
    const confirmationText = actionLabel[action] ?? "continue";
    if (!confirm(`Are you sure you want to ${confirmationText}?`)) return;
    setActionLoading(true);
    try {
        const res = await fetch(`/api/p2p/orders/${id}/action`, {
            method: 'POST',
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({ action }),
        });
        if (!res.ok) {
            const err = await res.json();
                        const code = err.error as string | undefined;
                        if (code === "payment_details_not_ready") {
                            alert("Seller payment details are missing. Do not mark as paid until details are shown.");
                        } else if (code === "order_state_conflict") {
                            alert("Order state changed. Please refresh and try again.");
                                                } else if (code === "order_not_found") {
                                                        alert("Order not found (or access denied).");
                        } else {
                            alert(code || "Action failed");
                        }
        } else {
             // Success - polling will update status
        }
    } catch (e) {
        alert("Error");
    } finally {
        setActionLoading(false);
    }
  };

    const openDispute = async () => {
        if (!order) return;
        const reason = disputeReason.trim();
        if (reason.length < 5) {
            alert("Please enter at least 5 characters explaining the issue.");
            return;
        }
        if (!confirm("Open a dispute for this order? Support will review.")) return;
        setDisputeLoading(true);
        try {
            const res = await fetch(`/api/p2p/orders/${id}/dispute`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason }),
            });
            if (!res.ok) {
                let code: string | undefined;
                let msg: string | undefined;
                try {
                    const body = await res.json();
                    code = body?.error;
                    msg = body?.details?.message;
                } catch {
                    // ignore
                }
                alert(msg || code || "Failed to open dispute");
                return;
            }
            setDisputeReason("");
        } catch {
            alert("Network error");
        } finally {
            setDisputeLoading(false);
        }
    };

    const submitFeedback = async () => {
        if (!order) return;
        if (!feedbackRating) {
            alert("Please select a rating.");
            return;
        }
        setFeedbackLoading(true);
        try {
            const res = await fetch(`/api/p2p/orders/${id}/feedback`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    rating: feedbackRating,
                    comment: feedbackComment.trim() || undefined,
                }),
            });
            if (!res.ok) {
                let code: string | undefined;
                let msg: string | undefined;
                try {
                    const body = await res.json();
                    code = body?.error;
                    msg = body?.details?.message;
                } catch {
                    // ignore
                }
                alert(msg || code || "Failed to submit feedback");
                return;
            }
            setFeedbackDone(true);
        } catch {
            alert("Network error");
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
                            className="inline-flex h-9 items-center justify-center rounded-lg bg-[var(--accent)] px-4 text-sm font-bold text-white hover:brightness-110"
                        >
                            Go to Login
                        </Link>
                        <Link
                            href="/p2p/orders"
                            className="inline-flex h-9 items-center justify-center rounded-lg border border-[var(--border)] bg-transparent px-4 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--card-2)]"
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
  
  // Calculations
  const statusColors = {
      created: "text-blue-400",
      paid_confirmed: "text-amber-400",
      disputed: "text-red-400",
      completed: "text-green-400",
      cancelled: "text-gray-400"
  };

    const orderTitle =
        displayRole === "BUYER"
            ? `Buy ${order.asset_symbol}`
            : displayRole === "SELLER"
                ? `Sell ${order.asset_symbol}`
                : "P2P Order";

  return (
    <div className="min-h-screen bg-[var(--background)] p-4 md:p-8">
      <div className="mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Chat */}
        <div className="lg:col-span-2 flex flex-col h-[80vh] bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
            <div className="p-4 border-b border-[var(--border)] bg-[var(--card-2)]">
                <h2 className="font-bold text-[var(--foreground)]">Order Chat</h2>
                                <div className="flex items-center justify-between gap-2 text-xs text-[var(--muted)]">
                                    <p>Do not pay outside the platform. Keep conversations here.</p>
                                    {lastRefreshedAt && <span>Updated {lastRefreshedAt.toLocaleTimeString()}</span>}
                                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((m) => {
                    const isMe = !!m.sender_id && !!currentUser && m.sender_id === currentUser.id;
                    const isSystem = m.sender_id === null;
                    if (isSystem) {
                        return (
                            <div key={m.id} className="flex justify-center my-4">
                                <span className="text-xs bg-gray-800 text-gray-300 px-3 py-1 rounded-full">{m.content}</span>
                            </div>
                        )
                    }
                    return (
                        <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] rounded-lg p-3 text-sm ${
                                isMe ? 'bg-[var(--accent)] text-white' : 'bg-[var(--muted-bg)] text-[var(--foreground)]'
                            }`}>
                                <p>{m.content}</p>
                                <div className="text-[10px] opacity-70 mt-1 text-right">
                                    {new Date(m.created_at).toLocaleTimeString()}
                                </div>
                            </div>
                        </div>
                    );
                })}
                <div ref={bottomRef} />
            </div>

            <div className="p-4 border-t border-[var(--border)] bg-[var(--card-2)] flex gap-2">
                <input 
                    className="flex-1 bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--accent)]"
                    placeholder="Type a message..."
                    value={msgInput}
                    onChange={e => setMsgInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendMessage()}
                />
                <button 
                    onClick={sendMessage}
                    className="bg-[var(--accent)] text-white px-4 py-2 rounded-lg font-bold text-sm hover:brightness-110"
                >
                    Send
                </button>
            </div>
        </div>

        {/* Right Column: Order Info */}
        <div className="space-y-6">
            
            {/* Order Details Card */}
            <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6 space-y-4">
                <div className="flex justify-between items-center">
                   <h1 className="text-xl font-bold text-[var(--foreground)]">
                       {orderTitle}
                   </h1>
                   <span className={`font-bold uppercase ${statusColors[order.status] || "text-white"}`}>
                       {order.status.replace('_', ' ')}
                   </span>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs">
                    <span className="text-[var(--muted)]">Payment details</span>
                    <span
                        className={`rounded-full border px-2 py-0.5 font-semibold ${
                            paymentDetailsReady
                                ? "border-green-500/30 bg-green-500/15 text-green-400"
                                : "border-amber-500/30 bg-amber-500/15 text-amber-400"
                        }`}
                    >
                        {paymentDetailsReady ? "Verified" : "Missing"}
                    </span>
                </div>
                
                <div className="space-y-2 text-sm">
                    {counterparty && (
                        <div className="flex justify-between">
                            <span className="text-[var(--muted)]">Counterparty</span>
                            <span className="text-[var(--foreground)] text-xs font-mono">{counterparty.email || counterparty.id.slice(0, 8)}</span>
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
                        <span className="font-bold text-[var(--foreground)] text-lg">
                            {Number(order.amount_fiat).toLocaleString()} {order.fiat_currency}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-[var(--muted)]">Crypto Amount</span>
                        <span className="font-bold text-[var(--foreground)]">
                            {Number(order.amount_asset).toLocaleString()} {order.asset_symbol}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-[var(--muted)]">Price per unit</span>
                        <span className="text-[var(--foreground)]">
                            {Number(order.price).toLocaleString()} {order.fiat_currency}
                        </span>
                    </div>
                     <div className="flex justify-between pt-2 border-t border-[var(--border)]">
                        <span className="text-[var(--muted)]">Order ID</span>
                        <span className="text-[var(--muted)] text-xs font-mono">{order.id.slice(0,8)}</span>
                    </div>
                </div>
            </div>

            {/* Dispute */}
            <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6 space-y-3">
                <h3 className="text-sm font-bold text-[var(--muted)]">Dispute</h3>
                {order.status === "disputed" ? (
                    <div className="rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
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
                            className="min-h-[90px] w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                        />
                        <button
                            disabled={disputeLoading}
                            onClick={openDispute}
                            className="w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
                        >
                            {disputeLoading ? "Opening dispute..." : "Open Dispute"}
                        </button>
                        <div className="text-xs text-[var(--muted)]">
                            Only open a dispute if you can’t resolve via chat.
                        </div>
                    </>
                )}
            </div>

            {/* Feedback */}
            <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6 space-y-3">
                <h3 className="text-sm font-bold text-[var(--muted)]">Feedback</h3>
                {order.status !== "completed" ? (
                    <div className="rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--muted)]">
                        Feedback becomes available after the order completes.
                    </div>
                ) : feedbackDone ? (
                    <div className="rounded border border-green-500/20 bg-green-500/10 px-3 py-2 text-xs text-green-400">
                        Thanks — your feedback was submitted.
                    </div>
                ) : (
                    <>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setFeedbackRating("positive")}
                                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${
                                    feedbackRating === "positive"
                                        ? "border-green-500/30 bg-green-500/15 text-green-400"
                                        : "border-[var(--border)] bg-[var(--bg)] text-[var(--foreground)]"
                                }`}
                            >
                                Positive
                            </button>
                            <button
                                type="button"
                                onClick={() => setFeedbackRating("negative")}
                                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${
                                    feedbackRating === "negative"
                                        ? "border-red-500/30 bg-red-500/15 text-red-300"
                                        : "border-[var(--border)] bg-[var(--bg)] text-[var(--foreground)]"
                                }`}
                            >
                                Negative
                            </button>
                        </div>
                        <textarea
                            value={feedbackComment}
                            onChange={(e) => setFeedbackComment(e.target.value)}
                            placeholder="Optional comment"
                            className="min-h-[80px] w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                        />
                        <button
                            disabled={feedbackLoading}
                            onClick={submitFeedback}
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-sm font-bold text-[var(--foreground)] hover:bg-[var(--card-2)] disabled:opacity-50"
                        >
                            {feedbackLoading ? "Submitting..." : "Submit Feedback"}
                        </button>
                    </>
                )}
            </div>

            {/* Terms Card */}
            <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
                <h3 className="text-sm font-bold text-[var(--muted)] mb-2">Advertiser Terms</h3>
                <p className="text-sm text-[var(--foreground)] whitespace-pre-wrap">{order.ad_terms || "No specific terms."}</p>
            </div>

            {/* Payment Methods / Details */}
            <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
                <h3 className="text-sm font-bold text-[var(--muted)] mb-3">
                    {isBuyer
                      ? "Seller Payment Details"
                      : isSeller
                        ? "Your Payment Details Shared With Buyer"
                        : "Payment Details"}
                </h3>

                {isBuyer ? (
                    <p className="mb-3 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                        Pay only to the seller details shown below. Ignore any different account sent in chat.
                    </p>
                ) : isSeller ? (
                    <p className="mb-3 rounded border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-300">
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
                             <div key={idx} className="p-3 bg-[var(--bg)] rounded border border-[var(--border)]">
                                 <div className="flex items-center gap-2 mb-2">
                                     <span className="font-bold text-sm text-[var(--foreground)]">
                                         {pm.name || getPaymentMethodName(pm.identifier)}
                                     </span>
                                     <span className="text-[10px] bg-[var(--card)] px-2 py-0.5 rounded border border-[var(--border)]">
                                         {getPaymentMethodName(pm.identifier)}
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
                                                                                                            className="rounded border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--muted)] hover:text-[var(--foreground)]"
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
                        <p className="text-xs text-[var(--muted)]">Available payment methods:</p>
                        <div className="flex flex-wrap gap-2">
                            {order.payment_method_ids?.map(id => (
                              <span key={id} className="rounded-full bg-[var(--bg)] px-3 py-1 text-xs border border-[var(--border)] font-medium">
                                {getPaymentMethodName(id)}
                              </span>
                            ))}
                        </div>
                        <p className="text-xs text-amber-500 mt-2">
                            Seller account details are missing for this order. Do not transfer funds until exact seller details are visible here.
                        </p>
                    </div>
                )}
            </div>

            {/* Action Buttons */}
            <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6 space-y-3">
                <h3 className="text-sm font-bold text-[var(--muted)] mb-2">Actions</h3>

                {!isBuyer && !isSeller && (
                    <div className="rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--muted)]">
                        Your role for this order is not available yet. If this persists, refresh the page.
                    </div>
                )}
                
                {order.status === 'completed' && (
                    <div className="p-3 bg-green-500/10 border border-green-500/20 text-green-500 rounded text-center font-bold">
                        Order Completed Successfully
                    </div>
                )}
                
                {order.status === 'cancelled' && (
                    <div className="p-3 bg-gray-500/10 border border-gray-500/20 text-gray-500 rounded text-center font-bold">
                        Order Cancelled
                    </div>
                )}

                {/* BUYER ACTIONS */}
                {isBuyer && order.status === 'created' && (
                    <>
                        {!paymentDetailsReady && (
                            <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                                Seller payout details are not complete yet. Do not transfer funds and do not mark as paid.
                            </div>
                        )}
                        <button 
                            disabled={actionLoading || !paymentDetailsReady}
                            onClick={() => doAction('PAY_CONFIRMED')}
                            className="w-full py-3 bg-[var(--up)] text-white font-bold rounded-lg hover:brightness-110 disabled:opacity-50"
                        >
                            Mark as Paid
                        </button>
                        <button 
                            disabled={actionLoading}
                            onClick={() => doAction('CANCEL')}
                            className="w-full py-2 bg-transparent text-[var(--muted)] border border-[var(--border)] rounded-lg hover:bg-[var(--card-2)]"
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
                        <div className="text-center p-3 bg-amber-500/10 text-amber-500 rounded border border-amber-500/20">
                            Waiting for Seller to Release...
                        </div>
                        {/* Dev Tool: Simulate Seller Release */}
                        {process.env.NODE_ENV !== 'production' && (
                             <button 
                                onClick={async () => {
                                    if(!confirm("DEV: Simulate Seller Release?")) return;
                                    setActionLoading(true);
                                    try {
                                        await fetch(`/api/dev/p2p/simulate-release?orderId=${order.id}`, { method: 'POST' });
                                    } finally { setActionLoading(false); }
                                }}
                                className="w-full text-xs py-2 bg-purple-900/50 text-purple-200 border border-purple-500/30 rounded hover:bg-purple-900/80 dashed"
                            > 
                             [DEV] Simulate Seller Release 
                            </button>
                        )}
                    </div>
                )}

                {/* SELLER ACTIONS */}
                {isSeller && order.status === 'created' && (
                    <div className="space-y-3">
                        <div className="text-center p-3 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20">
                            Waiting for Buyer to Pay...
                        </div>
                        {/* Dev Tool: Simulate Buyer Paying */}
                        {process.env.NODE_ENV !== 'production' && (
                            <button 
                                onClick={async () => {
                                    if(!confirm("DEV: Simulate Buyer Payment?")) return;
                                    setActionLoading(true);
                                    try {
                                        await fetch(`/api/dev/p2p/simulate-pay?orderId=${order.id}`, { method: 'POST' });
                                        // Refresh will happen via poll
                                    } finally { setActionLoading(false); }
                                }}
                                className="w-full text-xs py-2 bg-purple-900/50 text-purple-200 border border-purple-500/30 rounded hover:bg-purple-900/80 dashed"
                            > 
                             [DEV] Simulate Buyer Pay 
                            </button>
                        )}
                    </div>
                )}
                
                {isSeller && order.status === 'paid_confirmed' && (

                    <>
                        <button 
                           disabled={actionLoading}
                           onClick={() => doAction('RELEASE')}
                           className="w-full py-3 bg-[var(--up)] text-white font-bold rounded-lg hover:brightness-110 disabled:opacity-50"
                        >
                            Release Crypto ({order.amount_asset} {order.asset_symbol})
                        </button>
                        <p className="text-xs text-red-400 text-center mt-2">
                           Warning: Only release if you have confirmed receipt of funds in your bank account.
                        </p>
                    </>
                )}
            </div>

        </div>
      </div>
    </div>
  );
}
