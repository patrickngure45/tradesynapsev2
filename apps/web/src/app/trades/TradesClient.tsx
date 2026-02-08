"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ApiError, fetchJsonOrThrow } from "@/lib/api/client";
import { ApiErrorBanner, type ClientApiError } from "@/components/ApiErrorBanner";
import { canOpenDispute, canTransitionTrade, type TradeStatus } from "@/lib/state/trade";
import {
  clearSessionCookie,
  createSessionCookie,
  fetchWhoAmI,
} from "@/lib/auth/clientSession";
import {
  persistActingUserIdPreference,
  readActingUserIdPreference,
} from "@/lib/state/actingUser";
import { copyToClipboard } from "@/lib/ui/copyToClipboard";
import { Toast, type ToastKind } from "@/components/Toast";

type User = {
  id: string;
  status: string;
  kyc_level: string;
  country: string | null;
  created_at: string;
};

type TradeRow = {
  id: string;
  buyer_user_id: string;
  seller_user_id: string;
  fiat_currency: string;
  crypto_asset: string;
  fiat_amount: string;
  crypto_amount: string;
  price: string;
  reference_market_snapshot_id: string | null;
  fair_price_mid: string | null;
  fair_band_pct: string | null;
  price_deviation_pct: string | null;
  status: string;
  created_at: string;
};

type CreateTradeResponse =
  | {
      trade: {
        id: string;
      };
      risk_assessment: unknown | null;
    };

export function TradesClient({ initialTrades }: { initialTrades: TradeRow[] }) {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [trades, setTrades] = useState<TradeRow[]>(initialTrades);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ClientApiError | null>(null);

  const [authMode, setAuthMode] = useState<"header" | "session">("session");
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [sessionBootstrapKey, setSessionBootstrapKey] = useState<string>("");
  const [sessionLoading, setSessionLoading] = useState(false);

  const [actingUserId, setActingUserId] = useState<string>("");

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastKind, setToastKind] = useState<ToastKind>("info");

  const [transitioningTradeId, setTransitioningTradeId] = useState<string | null>(null);

  const roleBadgeFor = (trade: TradeRow) => {
    if (!scopeUserId) return null;
    const role =
      scopeUserId === trade.buyer_user_id
        ? "buyer"
        : scopeUserId === trade.seller_user_id
          ? "seller"
          : null;
    if (!role) return null;

    const cls =
      role === "buyer"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200"
        : "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/40 dark:bg-sky-950/40 dark:text-sky-200";

    return (
      <span className={`rounded border px-2 py-0.5 text-[11px] ${cls}`}>{role}</span>
    );
  };

  const actionTitle = (
    trade: TradeRow,
    opts: {
      label: string;
      to?: TradeStatus;
      role?: "buyer" | "seller";
      kind?: "dispute";
    }
  ): string => {
    if (transitioningTradeId === trade.id) return "Working…";
    if (!scopeUserId) return "Select an acting user.";

    if (opts.kind === "dispute") {
      return canOpenDispute(trade.status)
        ? "Open dispute (reason=non_payment)"
        : `Not allowed from status: ${trade.status}`;
    }

    if (opts.to) {
      if (!canTransitionTrade(trade.status, opts.to)) {
        return `Not allowed from status: ${trade.status}`;
      }
      if (opts.role === "buyer" && scopeUserId !== trade.buyer_user_id) {
        return "Buyer only.";
      }
      if (opts.role === "seller" && scopeUserId !== trade.seller_user_id) {
        return "Seller only.";
      }
      if (opts.to === "canceled" && trade.status === "disputed") {
        return "Use reviewer decision to cancel disputed trades.";
      }
      return opts.label;
    }

    return opts.label;
  };

  const [buyerUserId, setBuyerUserId] = useState<string>("");
  const [sellerUserId, setSellerUserId] = useState<string>("");

  const [fiatCurrency, setFiatCurrency] = useState("USD");
  const [cryptoAsset, setCryptoAsset] = useState("BTC");
  const [fiatAmount, setFiatAmount] = useState("1000");
  const [cryptoAmount, setCryptoAmount] = useState("0.01");
  const [price, setPrice] = useState("100000");

  const [paymentMethodLabel, setPaymentMethodLabel] = useState("bank transfer");
  const [paymentMethodRiskClass, setPaymentMethodRiskClass] = useState<
    "irreversible" | "reversible" | "unknown"
  >("unknown");

  const [assessRisk, setAssessRisk] = useState(true);

  const [useReferenceMarket, setUseReferenceMarket] = useState(true);
  const [exchange, setExchange] = useState<"binance" | "bybit">("binance");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [persistSnapshot, setPersistSnapshot] = useState(true);
  const [bandPct, setBandPct] = useState("0.01");

  const scopeUserId = useMemo(() => {
    if (authMode === "session") return sessionUserId ?? actingUserId;
    return actingUserId;
  }, [authMode, sessionUserId, actingUserId]);

  const canSubmit = useMemo(() => {
    return Boolean(buyerUserId) && Boolean(sellerUserId) && buyerUserId !== sellerUserId;
  }, [buyerUserId, sellerUserId]);

  const proofPackHrefFor = (tradeId: string) => {
    const base = `/api/trades/${tradeId}/proof-pack`;
    return scopeUserId ? `${base}?user_id=${encodeURIComponent(scopeUserId)}` : base;
  };

  const tradeHrefFor = (tradeId: string) => {
    const base = `/trades/${tradeId}`;
    return scopeUserId ? `${base}?user_id=${encodeURIComponent(scopeUserId)}` : base;
  };

  async function refreshSession() {
    try {
      const me = await fetchWhoAmI();
      setSessionUserId(me.user_id);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === "missing_x_user_id") {
          setSessionUserId(null);
          return;
        }
      }
      setSessionUserId(null);
    }
  }

  async function signInAs(userId: string): Promise<boolean> {
    if (!userId) return false;

    setSessionLoading(true);
    setError(null);
    try {
      await createSessionCookie({
        userId,
        bootstrapKey: sessionBootstrapKey ? sessionBootstrapKey : undefined,
      });
      await refreshSession();
      setActingUserId(userId);
      setToastKind("success");
      setToastMessage("Session cookie set.");
      return true;
    } catch (e) {
      if (e instanceof ApiError) {
        setError({ code: e.code, details: e.details });
      } else {
        setError({ code: e instanceof Error ? e.message : "session_failed" });
      }
      return false;
    } finally {
      setSessionLoading(false);
    }
  }

  async function signOut() {
    setSessionLoading(true);
    setError(null);
    try {
      await clearSessionCookie();
      await refreshSession();
      setToastKind("success");
      setToastMessage("Signed out.");
    } catch (e) {
      if (e instanceof ApiError) {
        setError({ code: e.code, details: e.details });
      } else {
        setError({ code: e instanceof Error ? e.message : "signout_failed" });
      }
    } finally {
      setSessionLoading(false);
    }
  }

  async function refreshTrades(forUserId?: string) {
    try {
      setError(null);
      const scopedUserId =
        forUserId ?? (authMode === "session" ? sessionUserId ?? actingUserId : actingUserId);
      if (!scopedUserId) {
        setTrades([]);
        setError({ code: "missing_acting_user_id" });
        return;
      }

      if (authMode === "session") {
        const isProd = process.env.NODE_ENV === "production";
        const canAutoBootstrap = !isProd || Boolean(sessionBootstrapKey);

        if (sessionUserId !== scopedUserId) {
          if (canAutoBootstrap && !sessionLoading) {
            const ok = await signInAs(scopedUserId);
            if (!ok) return;
          } else if (sessionUserId) {
            setTrades([]);
            setError({ code: "session_user_mismatch" });
            return;
          }
        }
      }

      const json = await fetchJsonOrThrow<{ trades?: TradeRow[] }>(
        `/api/trades?user_id=${encodeURIComponent(scopedUserId)}`,
        {
          cache: "no-store",
          headers: authMode === "header" ? { "x-user-id": scopedUserId } : undefined,
        }
      );
      setTrades(json.trades ?? []);
    } catch (e) {
      if (e instanceof ApiError) {
        setError({ code: e.code, details: e.details });
      } else {
        setError({ code: e instanceof Error ? e.message : "refresh_failed" });
      }
    }
  }

  async function transitionTrade(tradeId: string, next: TradeStatus) {
    const scopedUserId = authMode === "session" ? sessionUserId ?? actingUserId : actingUserId;
    if (!scopedUserId) {
      setError({ code: "missing_acting_user_id" });
      return;
    }

    setTransitioningTradeId(tradeId);
    setError(null);

    try {
      if (authMode === "session") {
        const isProd = process.env.NODE_ENV === "production";
        const canAutoBootstrap = !isProd || Boolean(sessionBootstrapKey);

        if (sessionUserId !== scopedUserId) {
          if (canAutoBootstrap && !sessionLoading) {
            const ok = await signInAs(scopedUserId);
            if (!ok) return;
          } else if (sessionUserId) {
            setError({ code: "session_user_mismatch" });
            return;
          }
        }
      }

      const segment: Record<TradeStatus, string> = {
        created: "",
        awaiting_payment: "awaiting-payment",
        paid_marked: "paid-marked",
        released: "released",
        disputed: "",
        resolved: "resolved",
        canceled: "canceled",
      };

      const path = segment[next];
      if (!path) {
        setError({ code: "trade_transition_not_allowed" });
        return;
      }

      const init: RequestInit = { method: "POST" };
      if (authMode === "header") {
        init.headers = { "x-user-id": scopedUserId };
      }

      await fetchJsonOrThrow(`/api/trades/${tradeId}/status/${path}`, init);
      setToastKind("success");
      setToastMessage(`Trade ${tradeId.slice(0, 8)}… moved to ${next}.`);
      await refreshTrades(scopedUserId);
    } catch (e) {
      if (e instanceof ApiError) {
        setError({ code: e.code, details: e.details });
      } else {
        setError({ code: e instanceof Error ? e.message : "transition_failed" });
      }
    } finally {
      setTransitioningTradeId(null);
    }
  }

  async function openDispute(tradeId: string) {
    const scopedUserId = authMode === "session" ? sessionUserId ?? actingUserId : actingUserId;
    if (!scopedUserId) {
      setError({ code: "missing_acting_user_id" });
      return;
    }

    setTransitioningTradeId(tradeId);
    setError(null);

    try {
      if (authMode === "session") {
        const isProd = process.env.NODE_ENV === "production";
        const canAutoBootstrap = !isProd || Boolean(sessionBootstrapKey);

        if (sessionUserId !== scopedUserId) {
          if (canAutoBootstrap && !sessionLoading) {
            const ok = await signInAs(scopedUserId);
            if (!ok) return;
          } else if (sessionUserId) {
            setError({ code: "session_user_mismatch" });
            return;
          }
        }
      }

      const init: RequestInit = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opened_by_user_id: scopedUserId,
          reason_code: "non_payment",
        }),
      };

      if (authMode === "header") {
        init.headers = {
          ...(init.headers ?? {}),
          "x-user-id": scopedUserId,
        };
      }

      await fetchJsonOrThrow(`/api/trades/${tradeId}/dispute`, init);
      setToastKind("success");
      setToastMessage(`Dispute opened for ${tradeId.slice(0, 8)}…`);
      await refreshTrades(scopedUserId);
    } catch (e) {
      if (e instanceof ApiError) {
        setError({ code: e.code, details: e.details });
      } else {
        setError({ code: e instanceof Error ? e.message : "open_dispute_failed" });
      }
    } finally {
      setTransitioningTradeId(null);
    }
  }

  async function refreshUsers() {
    try {
      const json = await fetchJsonOrThrow<{ users?: User[] }>("/api/dev/users", {
        cache: "no-store",
      });
      const list = json.users ?? [];
      setUsers(list);

      const first = list[0]?.id ?? "";
      const second = list[1]?.id ?? first;
      setBuyerUserId((prev) => (prev ? prev : first));
      setSellerUserId((prev) => (prev ? prev : second));

      const preferred = readActingUserIdPreference();
      const fallback = preferred || first;
      setActingUserId((prev) => (prev ? prev : fallback));
    } catch (e) {
      if (e instanceof ApiError) {
        setError({ code: e.code, details: e.details });
      } else {
        setError({ code: e instanceof Error ? e.message : "users_failed" });
      }
    }
  }

  useEffect(() => {
    void refreshUsers();
    void refreshSession();
  }, []);

  useEffect(() => {
    if (!actingUserId) return;
    persistActingUserIdPreference(actingUserId);
    void refreshTrades(actingUserId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actingUserId]);

  async function createDevUser() {
    setError(null);
    setLoading(true);
    try {
      await fetchJsonOrThrow("/api/dev/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active", kyc_level: "basic", country: "US" }),
      });
      await refreshUsers();
    } catch (e) {
      if (e instanceof ApiError) {
        setError({ code: e.code, details: e.details });
      } else {
        setError({ code: e instanceof Error ? e.message : "create_user_failed" });
      }
    } finally {
      setLoading(false);
    }
  }

  async function createTrade() {
    if (!canSubmit) {
      setError({ code: "missing_or_invalid_users" });
      return;
    }

    setError(null);
    setLoading(true);

    try {
      if (authMode === "session" && buyerUserId) {
        if (sessionUserId !== buyerUserId) {
          const ok = await signInAs(buyerUserId);
          if (!ok) return;
        }
      }

      const body: Record<string, unknown> = {
        buyer_user_id: buyerUserId,
        seller_user_id: sellerUserId,
        fiat_currency: fiatCurrency,
        crypto_asset: cryptoAsset,
        fiat_amount: fiatAmount,
        crypto_amount: cryptoAmount,
        price,
        payment_method_label: paymentMethodLabel,
        payment_method_risk_class: paymentMethodRiskClass,
        assess_risk: assessRisk,
      };

      if (useReferenceMarket) {
        body.reference_market = {
          exchange,
          symbol,
          persist: persistSnapshot,
          pct: bandPct,
        };
      }

      const json = await fetchJsonOrThrow<CreateTradeResponse>("/api/trades", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authMode === "header" ? { "x-user-id": buyerUserId } : {}),
        },
        body: JSON.stringify(body),
      });

      const createdId = json.trade.id;
      setActingUserId(buyerUserId);
      await refreshTrades(buyerUserId);
      router.push(`/trades/${createdId}?user_id=${encodeURIComponent(buyerUserId)}`);
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError) {
        setError({ code: e.code, details: e.details });
      } else {
        setError({ code: e instanceof Error ? e.message : "create_trade_failed" });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 grid gap-6">
      <Toast
        message={toastMessage}
        kind={toastKind}
        onDone={() => setToastMessage(null)}
      />
      <ApiErrorBanner error={error} />

      <section className="rounded border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Create trade</h2>
          <button
            className="text-sm underline"
            onClick={() => void refreshTrades()}
          >
            Refresh trades
          </button>
        </div>

        <div className="mt-3 grid gap-1 text-sm">
          <span className="text-zinc-500">Acting user (scopes trade list)</span>
          <select
            className="rounded border border-zinc-200 bg-transparent px-2 py-2 font-mono text-xs dark:border-zinc-800"
            value={actingUserId}
            onChange={(e) => {
              const next = e.target.value;

              if (authMode !== "session") {
                setActingUserId(next);
                return;
              }

              const prev = actingUserId;
              setActingUserId(next);

              const isProd = process.env.NODE_ENV === "production";
              const canAutoBootstrap = !isProd || Boolean(sessionBootstrapKey);
              if (!canAutoBootstrap) return;

              if (!next) return;
              if (sessionUserId === next) return;

              void (async () => {
                const ok = await signInAs(next);
                if (!ok) setActingUserId(prev);
              })();
            }}
          >
            <option value="">(select user)</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.id}
              </option>
            ))}
          </select>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
              <span className="text-zinc-500">Auth mode</span>
              <select
                className="rounded border border-zinc-200 bg-transparent px-2 py-1 text-xs dark:border-zinc-800"
                value={authMode}
                onChange={(e) => {
                  const next = e.target.value as typeof authMode;
                  setAuthMode(next);

                  if (next !== "session") return;
                  if (!actingUserId) return;
                  if (sessionUserId === actingUserId) return;

                  const isProd = process.env.NODE_ENV === "production";
                  const canAutoBootstrap = !isProd || Boolean(sessionBootstrapKey);
                  if (!canAutoBootstrap) return;

                  void signInAs(actingUserId);
                }}
              >
                <option value="session">session cookie</option>
                <option value="header">x-user-id header</option>
              </select>
            </label>

            {authMode === "session" ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                <span className="text-zinc-500">Session</span>
                <span className="font-mono">
                  {sessionUserId ? `${sessionUserId.slice(0, 8)}…` : "(none)"}
                </span>
                <button
                  type="button"
                  className="rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-950"
                  disabled={!actingUserId || sessionLoading}
                  onClick={() => void signInAs(actingUserId)}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  className="rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-950"
                  disabled={sessionLoading}
                  onClick={() => void signOut()}
                >
                  Sign out
                </button>
                <details>
                  <summary className="cursor-pointer text-[11px] text-zinc-500">prod bootstrap</summary>
                  <div className="mt-2 grid gap-1">
                    <label className="grid gap-1">
                      <span className="text-[11px] text-zinc-500">x-session-bootstrap-key</span>
                      <input
                        className="rounded border border-zinc-200 bg-transparent px-2 py-1 font-mono text-xs dark:border-zinc-800"
                        value={sessionBootstrapKey}
                        type="password"
                        placeholder="(only needed in production)"
                        onChange={(e) => setSessionBootstrapKey(e.target.value)}
                      />
                    </label>
                  </div>
                </details>
              </div>
            ) : (
              <div className="text-xs text-zinc-500">Requests send x-user-id.</div>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="rounded bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-black"
              disabled={loading}
              onClick={() => void createDevUser()}
            >
              + Dev user
            </button>
            <div className="text-sm text-zinc-500">
              Need users? Create two, then submit.
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="text-zinc-500">Buyer</span>
              <select
                className="rounded border border-zinc-200 bg-transparent px-2 py-2 font-mono text-xs dark:border-zinc-800"
                value={buyerUserId}
                onChange={(e) => setBuyerUserId(e.target.value)}
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.id}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm">
              <span className="text-zinc-500">Seller</span>
              <select
                className="rounded border border-zinc-200 bg-transparent px-2 py-2 font-mono text-xs dark:border-zinc-800"
                value={sellerUserId}
                onChange={(e) => setSellerUserId(e.target.value)}
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.id}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="grid gap-1 text-sm">
              <span className="text-zinc-500">Fiat</span>
              <input
                className="rounded border border-zinc-200 bg-transparent px-2 py-2 font-mono text-sm dark:border-zinc-800"
                value={fiatCurrency}
                onChange={(e) => setFiatCurrency(e.target.value)}
              />
            </label>

            <label className="grid gap-1 text-sm">
              <span className="text-zinc-500">Asset</span>
              <input
                className="rounded border border-zinc-200 bg-transparent px-2 py-2 font-mono text-sm dark:border-zinc-800"
                value={cryptoAsset}
                onChange={(e) => setCryptoAsset(e.target.value)}
              />
            </label>

            <label className="grid gap-1 text-sm">
              <span className="text-zinc-500">Price</span>
              <input
                className="rounded border border-zinc-200 bg-transparent px-2 py-2 font-mono text-sm dark:border-zinc-800"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="text-zinc-500">Fiat amount</span>
              <input
                className="rounded border border-zinc-200 bg-transparent px-2 py-2 font-mono text-sm dark:border-zinc-800"
                value={fiatAmount}
                onChange={(e) => setFiatAmount(e.target.value)}
              />
            </label>

            <label className="grid gap-1 text-sm">
              <span className="text-zinc-500">Crypto amount</span>
              <input
                className="rounded border border-zinc-200 bg-transparent px-2 py-2 font-mono text-sm dark:border-zinc-800"
                value={cryptoAmount}
                onChange={(e) => setCryptoAmount(e.target.value)}
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="text-zinc-500">Payment label</span>
              <input
                className="rounded border border-zinc-200 bg-transparent px-2 py-2 text-sm dark:border-zinc-800"
                value={paymentMethodLabel}
                onChange={(e) => setPaymentMethodLabel(e.target.value)}
              />
            </label>

            <label className="grid gap-1 text-sm">
              <span className="text-zinc-500">Payment risk</span>
              <select
                className="rounded border border-zinc-200 bg-transparent px-2 py-2 text-sm dark:border-zinc-800"
                value={paymentMethodRiskClass}
                onChange={(e) =>
                  setPaymentMethodRiskClass(e.target.value as typeof paymentMethodRiskClass)
                }
              >
                <option value="unknown">unknown</option>
                <option value="irreversible">irreversible</option>
                <option value="reversible">reversible</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={assessRisk}
                onChange={(e) => setAssessRisk(e.target.checked)}
              />
              Assess risk (v0)
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={useReferenceMarket}
                onChange={(e) => setUseReferenceMarket(e.target.checked)}
              />
              Attach reference market
            </label>
          </div>

          {useReferenceMarket ? (
            <div className="grid gap-3 md:grid-cols-4">
              <label className="grid gap-1 text-sm">
                <span className="text-zinc-500">Exchange</span>
                <select
                  className="rounded border border-zinc-200 bg-transparent px-2 py-2 text-sm dark:border-zinc-800"
                  value={exchange}
                  onChange={(e) => setExchange(e.target.value as typeof exchange)}
                >
                  <option value="binance">binance</option>
                  <option value="bybit">bybit</option>
                </select>
              </label>

              <label className="grid gap-1 text-sm md:col-span-2">
                <span className="text-zinc-500">Symbol</span>
                <input
                  className="rounded border border-zinc-200 bg-transparent px-2 py-2 font-mono text-sm dark:border-zinc-800"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                />
              </label>

              <label className="grid gap-1 text-sm">
                <span className="text-zinc-500">Band pct</span>
                <input
                  className="rounded border border-zinc-200 bg-transparent px-2 py-2 font-mono text-sm dark:border-zinc-800"
                  value={bandPct}
                  onChange={(e) => setBandPct(e.target.value)}
                />
              </label>

              <label className="flex items-center gap-2 text-sm md:col-span-4">
                <input
                  type="checkbox"
                  checked={persistSnapshot}
                  onChange={(e) => setPersistSnapshot(e.target.checked)}
                />
                Persist snapshot to DB
              </label>
            </div>
          ) : null}

          <button
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={loading || !canSubmit}
            onClick={() => void createTrade()}
          >
            {loading ? "Working…" : "Create trade"}
          </button>

          {!canSubmit ? (
            <div className="text-sm text-zinc-500">
              Select two different users to submit.
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent trades</h2>
          <Link className="text-sm underline" href="/">
            Home
          </Link>
        </div>

        <div className="mt-4 overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Pair</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Deviation</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Proof pack</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr
                  key={t.id}
                  className="border-t border-zinc-200 dark:border-zinc-800"
                >
                  <td className="px-3 py-2 font-mono">
                    <div className="flex items-center gap-2">
                      <Link className="underline" href={tradeHrefFor(t.id)}>
                        {t.id.slice(0, 8)}…
                      </Link>
                      <button
                        type="button"
                        className="rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-950"
                        onClick={async () => {
                          try {
                            const relative = tradeHrefFor(t.id);
                            const absolute = new URL(relative, window.location.origin).toString();
                            const ok = await copyToClipboard(absolute);
                            setToastKind(ok ? "success" : "error");
                            setToastMessage(ok ? "Trade link copied." : "Copy failed.");
                          } catch {
                            setToastKind("error");
                            setToastMessage("Copy failed.");
                          }
                        }}
                      >
                        Copy
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {t.crypto_asset}/{t.fiat_currency}
                  </td>
                  <td className="px-3 py-2 font-mono">{t.price}</td>
                  <td className="px-3 py-2 font-mono">
                    {t.price_deviation_pct ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span>{t.status}</span>
                      {roleBadgeFor(t)}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-950"
                        disabled={
                          transitioningTradeId === t.id ||
                          !canTransitionTrade(t.status, "awaiting_payment")
                        }
                        onClick={() => void transitionTrade(t.id, "awaiting_payment")}
                        title={actionTitle(t, {
                          label: "created → awaiting_payment",
                          to: "awaiting_payment",
                        })}
                      >
                        Awaiting
                      </button>

                      <button
                        type="button"
                        className="rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-950"
                        disabled={
                          transitioningTradeId === t.id ||
                          !canTransitionTrade(t.status, "paid_marked") ||
                          scopeUserId !== t.buyer_user_id
                        }
                        onClick={() => void transitionTrade(t.id, "paid_marked")}
                        title={actionTitle(t, {
                          label: "awaiting_payment → paid_marked",
                          to: "paid_marked",
                          role: "buyer",
                        })}
                      >
                        Paid
                      </button>

                      <button
                        type="button"
                        className="rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-950"
                        disabled={
                          transitioningTradeId === t.id ||
                          !canTransitionTrade(t.status, "released") ||
                          scopeUserId !== t.seller_user_id
                        }
                        onClick={() => void transitionTrade(t.id, "released")}
                        title={actionTitle(t, {
                          label: "paid_marked → released",
                          to: "released",
                          role: "seller",
                        })}
                      >
                        Release
                      </button>

                      <button
                        type="button"
                        className="rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-950"
                        disabled={
                          transitioningTradeId === t.id ||
                          !canTransitionTrade(t.status, "resolved")
                        }
                        onClick={() => void transitionTrade(t.id, "resolved")}
                        title={actionTitle(t, { label: "Resolve trade", to: "resolved" })}
                      >
                        Resolve
                      </button>

                      <button
                        type="button"
                        className="rounded border border-red-200 px-2 py-1 text-[11px] text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-950/40"
                        disabled={
                          transitioningTradeId === t.id ||
                          t.status === "disputed" ||
                          !canTransitionTrade(t.status, "canceled")
                        }
                        onClick={() => void transitionTrade(t.id, "canceled")}
                        title={actionTitle(t, { label: "Cancel trade", to: "canceled" })}
                      >
                        Cancel
                      </button>

                      <button
                        type="button"
                        className="rounded border border-amber-200 px-2 py-1 text-[11px] text-amber-800 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-950/40"
                        disabled={
                          transitioningTradeId === t.id ||
                          !scopeUserId ||
                          !canOpenDispute(t.status)
                        }
                        onClick={() => void openDispute(t.id)}
                        title={actionTitle(t, { label: "Open dispute", kind: "dispute" })}
                      >
                        Dispute
                      </button>
                    </div>
                  </td>

                  <td className="px-3 py-2 font-mono">{t.created_at}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <a className="text-xs underline" href={proofPackHrefFor(t.id)}>
                        ZIP
                      </a>
                      <button
                        type="button"
                        className="rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-950"
                        onClick={async () => {
                          try {
                            const href = proofPackHrefFor(t.id);
                            const absolute = new URL(href, window.location.origin).toString();
                            const ok = await copyToClipboard(absolute);
                            if (ok) {
                              setToastKind("success");
                              setToastMessage("Proof pack link copied.");
                            } else {
                              setToastKind("error");
                              setToastMessage("Copy failed.");
                            }
                          } catch {
                            setToastKind("error");
                            setToastMessage("Copy failed.");
                          }
                        }}
                      >
                        Copy link
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {trades.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-sm text-zinc-500" colSpan={8}>
                    No trades yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="text-xs text-zinc-500">
        <div>
          Pro tip: after creating a trade, open it and upload evidence, then
          download the Proof Pack ZIP.
        </div>
      </section>
    </div>
  );
}
