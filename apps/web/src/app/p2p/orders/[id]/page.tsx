"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { getPaymentMethodName } from "@/lib/p2p/constants";

// Types matching API response
type Order = {
  id: string;
  status: 'created' | 'paid_confirmed' | 'completed' | 'cancelled';
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
  payment_method_snapshot: any[];
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
  const router = useRouter();
  
  const [order, setOrder] = useState<Order | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [msgInput, setMsgInput] = useState("");
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  
  const bottomRef = useRef<HTMLDivElement>(null);

  // 1. Fetch User & Data
  useEffect(() => {
    // Fetch user first or parallel
    // Correct endpoint is /api/whoami which returns { user: {...} } or { user_id: null }
    fetch('/api/whoami').then(res => res.ok ? res.json() : null).then(data => {
       if (data && data.user) {
         setCurrentUser(data.user);
       }
    }).catch(err => console.error("Failed to fetch user:", err));

    const fetchData = async () => {
      try {
        const res = await fetch(`/api/p2p/orders/${id}`);
        if (!res.ok) throw new Error("Failed to load order");
        const data = await res.json();
        setOrder(data.order);
        setMessages(data.messages);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    
    // Poll every 3s
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
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
        body: JSON.stringify({ content: txt })
      });
      // specific polling will catch it, or we insert locally?
      // let's wait for poll
    } catch (err) {
      console.error(err);
    }
  };

  const doAction = async (action: string) => {
    if (!confirm(`Are you sure you want to ${action}?`)) return;
    setActionLoading(true);
    try {
        const res = await fetch(`/api/p2p/orders/${id}/action`, {
            method: 'POST',
            body: JSON.stringify({ action })
        });
        if (!res.ok) {
            const err = await res.json();
            alert(err.error || "Action failed");
        } else {
             // Success - polling will update status
        }
    } catch (e) {
        alert("Error");
    } finally {
        setActionLoading(false);
    }
  };

  if (loading || !order || !currentUser) return <div className="p-10 text-white">Loading...</div>;

  const isBuyer = currentUser.id === order.buyer_id;
  const isSeller = currentUser.id === order.seller_id;
  const myRole = isBuyer ? "BUYER" : "SELLER";
  
  // Calculations
  const statusColors = {
      created: "text-blue-400",
      paid_confirmed: "text-amber-400",
      completed: "text-green-400",
      cancelled: "text-gray-400"
  };

  return (
    <div className="min-h-screen bg-[var(--background)] p-4 md:p-8">
      <div className="mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Chat */}
        <div className="lg:col-span-2 flex flex-col h-[80vh] bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
            <div className="p-4 border-b border-[var(--border)] bg-[var(--card-2)]">
                <h2 className="font-bold text-[var(--foreground)]">Order Chat</h2>
                <p className="text-xs text-[var(--muted)]">Do not pay outside the platform. Keep conversations here.</p>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((m) => {
                    const isMe = m.sender_id === currentUser.id;
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
                       {myRole === "BUYER" ? `Buy ${order.asset_symbol}` : `Sell ${order.asset_symbol}`}
                   </h1>
                   <span className={`font-bold uppercase ${statusColors[order.status] || "text-white"}`}>
                       {order.status.replace('_', ' ')}
                   </span>
                </div>
                
                <div className="space-y-2 text-sm">
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

            {/* Terms Card */}
            <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
                <h3 className="text-sm font-bold text-[var(--muted)] mb-2">Advertiser Terms</h3>
                <p className="text-sm text-[var(--foreground)] whitespace-pre-wrap">{order.ad_terms || "No specific terms."}</p>
            </div>

            {/* Payment Methods / Details */}
            <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
                <h3 className="text-sm font-bold text-[var(--muted)] mb-3">Payment Details</h3>
                
                {/* 1. Show Snapshot Details (Rich Info) */}
                {Array.isArray(order.payment_method_snapshot) && order.payment_method_snapshot.length > 0 ? (
                    <div className="space-y-3">
                        {order.payment_method_snapshot.map((pm: any, idx: number) => (
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
                                                 <span className="font-mono select-all text-[var(--foreground)]">{String(val)}</span>
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
                        <p className="text-xs text-[var(--muted)]">Calculated Payment Methods:</p>
                        <div className="flex flex-wrap gap-2">
                            {order.payment_method_ids?.map(id => (
                              <span key={id} className="rounded-full bg-[var(--bg)] px-3 py-1 text-xs border border-[var(--border)] font-medium">
                                {getPaymentMethodName(id)}
                              </span>
                            ))}
                        </div>
                        <p className="text-xs text-amber-500 mt-2">
                            Note: The seller has not provided specific account details. Please request them in the chat.
                        </p>
                    </div>
                )}
            </div>

            {/* Action Buttons */}
            <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6 space-y-3">
                <h3 className="text-sm font-bold text-[var(--muted)] mb-2">Actions</h3>
                
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
                        <button 
                            disabled={actionLoading}
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
