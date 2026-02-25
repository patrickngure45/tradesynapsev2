"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { V2Button } from "@/components/v2/Button";
import { V2Card, V2CardBody, V2CardHeader } from "@/components/v2/Card";
import { V2Input } from "@/components/v2/Input";
import { V2Sheet } from "@/components/v2/Sheet";
import { V2Skeleton } from "@/components/v2/Skeleton";
import { V2Tabs } from "@/components/v2/Tabs";
import { describeClientError } from "@/lib/api/errorMessages";

type P2PAd = {
  id: string;
  user_id: string;
  side: "BUY" | "SELL"; // maker side
  fiat_currency: string;
  fixed_price: string | null;
  remaining_amount: string;
  min_limit: string;
  max_limit: string;
  payment_window_minutes: number;
  payment_methods?: string[];
  email?: string;
  display_name?: string | null;
  completed_count?: number;
  rep_positive?: number;
  rep_negative?: number;
  rep_total?: number;
  terms?: string | null;
  is_verified_agent?: boolean;
  highlighted_until?: string | null;
};

type AdsResponse = { ads?: P2PAd[] };

type PaymentMethod = {
  id: string;
  identifier: string;
  name: string;
  details: any;
};

type PaymentMethodsResponse = { methods?: PaymentMethod[] };

type CreateOrderResponse =
  | { success: true; order_id: string }
  | { error: string; message?: string; details?: any };

function toNum(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(String(v));
  return Number.isFinite(n) ? n : null;
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

function fmtNum(v: string | null | undefined): string {
  const n = toNum(v);
  if (n == null) return "—";
  if (n === 0) return "0";
  const abs = Math.abs(n);
  const decimals = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 6 : 8;
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

function clampNum(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)__csrf=([^;]+)/);
  return match?.[1] ?? null;
}

function parseJsonSafe(raw: string): { value: any | null; error: string | null } {
  const text = raw.trim();
  if (!text) return { value: {}, error: null };
  try {
    return { value: JSON.parse(text), error: null };
  } catch {
    return { value: null, error: "Details JSON is invalid." };
  }
}

function paymentMethodRules(identifierRaw: string): { requiredKeys: string[]; tips: string[] } {
  const identifier = identifierRaw.trim().toLowerCase();
  if (identifier === "mpesa") {
    return {
      requiredKeys: ["phoneNumber"],
      tips: ["Use a reachable phone number in local format or E.164."],
    };
  }
  if (identifier === "bank_transfer" || identifier === "bank") {
    return {
      requiredKeys: ["bankName", "accountName", "accountNumber"],
      tips: ["Include branchCode or swift when needed for settlement."],
    };
  }
  return {
    requiredKeys: [],
    tips: ["Use a JSON object with the fields needed for this payment rail."],
  };
}

function paymentMethodExample(identifierRaw: string): { label: string; json: string } {
  const identifier = identifierRaw.trim().toLowerCase();
  if (identifier === "bank_transfer" || identifier === "bank") {
    return {
      label: "bank_transfer",
      json: '{\n  "bankName": "Example Bank",\n  "accountName": "Jane Doe",\n  "accountNumber": "1234567890",\n  "branchCode": "001"\n}',
    };
  }
  return {
    label: "mpesa",
    json: '{\n  "phoneNumber": "0712345678"\n}',
  };
}

function humanizeActionError(codeOrMessage: string): string {
  const info = describeClientError(codeOrMessage);
  return info.message;
}

export function P2PClient() {
  const router = useRouter();

  const [tab, setTab] = useState<"BUY" | "SELL">("BUY");

  const asset = "USDT";
  const fiat = "USD";

  const [amountFiat, setAmountFiat] = useState("");

  const [ads, setAds] = useState<P2PAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hasLoadedRef = useRef(false);
  const tabRef = useRef<"BUY" | "SELL">("BUY");
  const amountFiatRef = useRef<string>("");

  const loadSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = async () => {
    const seq = ++loadSeqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setError(null);
    if (!hasLoadedRef.current) setLoading(true);

    try {
      const qs = new URLSearchParams({ side: tabRef.current, asset, fiat });
      const n = toNum(amountFiatRef.current);
      if (n != null && n > 0) qs.set("amount", String(n));

      const res = await fetch(`/api/p2p/ads?${qs.toString()}`, { cache: "no-store", signal: controller.signal });
      const json = (await res.json().catch(() => null)) as AdsResponse | null;
      if (!res.ok) {
        const code = typeof (json as any)?.error === "string" ? (json as any).error : `http_${res.status}`;
        throw new Error(code);
      }

      if (seq !== loadSeqRef.current) return;
      setAds(Array.isArray(json?.ads) ? json!.ads : []);
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
    tabRef.current = tab;
  }, [tab]);

  useEffect(() => {
    amountFiatRef.current = amountFiat;
  }, [amountFiat]);

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
      const delayMs = 35_000;
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
  }, []);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (document.visibilityState !== "visible") return;
      void load();
    }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountFiat]);

  const tabs = useMemo(
    () => [
      { id: "BUY", label: "Buy" },
      { id: "SELL", label: "Sell" },
    ],
    [],
  );

  const errorInfo = useMemo(() => {
    if (!error) return null;
    return describeClientError(error);
  }, [error]);

  const [takeSheetOpen, setTakeSheetOpen] = useState(false);
  const [takeAd, setTakeAd] = useState<P2PAd | null>(null);
  const [takeAmount, setTakeAmount] = useState("");
  const [takeError, setTakeError] = useState<string | null>(null);
  const [taking, setTaking] = useState(false);

  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [methodsLoaded, setMethodsLoaded] = useState(false);
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);

  const [addingMethod, setAddingMethod] = useState(false);
  const [addMethodError, setAddMethodError] = useState<string | null>(null);
  const [newMethodIdentifier, setNewMethodIdentifier] = useState("mpesa");
  const [newMethodName, setNewMethodName] = useState("M-Pesa");
  const [newMethodDetailsJson, setNewMethodDetailsJson] = useState("{\n  \"phoneNumber\": \"\"\n}");

  const addMethodParsed = useMemo(() => parseJsonSafe(newMethodDetailsJson), [newMethodDetailsJson]);
  const addMethodRules = useMemo(() => paymentMethodRules(newMethodIdentifier), [newMethodIdentifier]);
  const addMethodExample = useMemo(() => paymentMethodExample(newMethodIdentifier), [newMethodIdentifier]);
  const addMethodMissingRequired = useMemo(() => {
    if (addMethodParsed.error || !addMethodParsed.value || typeof addMethodParsed.value !== "object") {
      return addMethodRules.requiredKeys;
    }
    const obj = addMethodParsed.value as Record<string, unknown>;
    return addMethodRules.requiredKeys.filter((key) => {
      const value = obj[key];
      return typeof value !== "string" || value.trim().length === 0;
    });
  }, [addMethodParsed.error, addMethodParsed.value, addMethodRules.requiredKeys]);

  const needsSellerMethod = tab === "SELL";

  const openTake = (ad: P2PAd) => {
    setTakeAd(ad);
    setTakeError(null);
    setTakeAmount("");
    setSelectedMethodId(null);
    setAddMethodError(null);
    setTakeSheetOpen(true);
  };

  const loadMyMethods = async () => {
    if (methodsLoaded) return;
    try {
      const res = await fetch("/api/p2p/payment-methods", { cache: "no-store", credentials: "include" });
      const json = (await res.json().catch(() => null)) as PaymentMethodsResponse | null;
      if (res.ok) {
        const rows = Array.isArray(json?.methods) ? json!.methods : [];
        setMethods(rows);
      }
    } finally {
      setMethodsLoaded(true);
    }
  };

  useEffect(() => {
    if (!takeSheetOpen) return;
    if (!needsSellerMethod) return;
    void loadMyMethods();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [takeSheetOpen, needsSellerMethod]);

  const createOrder = async () => {
    if (!takeAd || taking) return;

    const min = toNum(takeAd.min_limit) ?? 0;
    const max = toNum(takeAd.max_limit) ?? 0;

    const raw = toNum(takeAmount);
    if (raw == null || raw <= 0) {
      setTakeError("Enter an amount.");
      return;
    }

    const amount = max > 0 ? clampNum(raw, min || 0, max) : raw;
    if (min > 0 && amount < min) {
      setTakeError(`Minimum is ${fmtNum(String(min))} ${fiat}.`);
      return;
    }
    if (max > 0 && amount > max) {
      setTakeError(`Maximum is ${fmtNum(String(max))} ${fiat}.`);
      return;
    }

    if (needsSellerMethod && !selectedMethodId) {
      setTakeError("Select a payout method (required to sell).");
      return;
    }

    setTaking(true);
    setTakeError(null);

    try {
      const csrf = getCsrfToken();
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (csrf) headers["x-csrf-token"] = csrf;

      const res = await fetch("/api/p2p/orders", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          ad_id: takeAd.id,
          amount_fiat: amount,
          ...(needsSellerMethod ? { payment_method_id: selectedMethodId } : {}),
        }),
      });
      const json = (await res.json().catch(() => null)) as CreateOrderResponse | null;
      if (!res.ok) {
        const code = typeof (json as any)?.error === "string" ? (json as any).error : `http_${res.status}`;
        throw new Error(code);
      }
      const orderId = typeof (json as any)?.order_id === "string" ? (json as any).order_id : null;
      if (!orderId) throw new Error("order_create_failed");

      setTakeSheetOpen(false);
      router.push(`/v2/p2p/orders/${encodeURIComponent(orderId)}`);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      setTakeError(humanizeActionError(raw));
    } finally {
      setTaking(false);
    }
  };

  const addPaymentMethod = async () => {
    if (addingMethod) return;
    setAddMethodError(null);

    const identifier = newMethodIdentifier.trim();
    const name = newMethodName.trim();
    const rawDetails = newMethodDetailsJson.trim();

    if (!identifier) {
      setAddMethodError("Enter a method identifier (e.g. mpesa).");
      return;
    }
    if (!name) {
      setAddMethodError("Enter a name/label.");
      return;
    }

    let details: any = {};
    if (rawDetails) {
      try {
        details = JSON.parse(rawDetails);
      } catch {
        setAddMethodError("Details must be valid JSON.");
        return;
      }
    }

    if (identifier.trim().toLowerCase() === "mpesa") {
      const phoneNumber = typeof details?.phoneNumber === "string" ? details.phoneNumber.trim() : "";
      if (!phoneNumber) {
        setAddMethodError("For mpesa, details.phoneNumber is required.");
        return;
      }
    }

    setAddingMethod(true);
    try {
      const csrf = getCsrfToken();
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (csrf) headers["x-csrf-token"] = csrf;

      const res = await fetch("/api/p2p/payment-methods", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ identifier, name, details }),
      });

      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        const code = typeof json?.error === "string" ? json.error : `http_${res.status}`;
        throw new Error(code);
      }

      const created = json?.method as PaymentMethod | undefined;
      if (!created?.id) throw new Error("payment_method_create_failed");

      setMethods((prev) => [created, ...(prev ?? [])]);
      setSelectedMethodId(created.id);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      setAddMethodError(humanizeActionError(raw));
    } finally {
      setAddingMethod(false);
    }
  };

  return (
    <main className="space-y-4">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">P2P</div>
            <h1 className="text-2xl font-extrabold tracking-tight">Buy / sell {asset}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/v2/p2p/orders"
              className="rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-2 text-[12px] font-semibold text-[var(--v2-text)]"
            >
              My orders
            </Link>
            <Link
              href="/v2/p2p/my-ads"
              className="rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-2 text-[12px] font-semibold text-[var(--v2-text)]"
            >
              My ads
            </Link>
            <Link
              href="/v2/p2p/payment-methods"
              className="rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-2 text-[12px] font-semibold text-[var(--v2-text)]"
            >
              Methods
            </Link>
          </div>
        </div>
        <p className="text-sm text-[var(--v2-muted)]">Escrow-backed trades. Choose an ad and place an order.</p>
      </header>

      <V2Tabs tabs={tabs} activeId={tab} onChange={(id) => setTab(id as any)} />

      <V2Input
        value={amountFiat}
        onChange={(e) => setAmountFiat(e.target.value)}
        placeholder={`Optional amount (${fiat})`}
        inputMode="decimal"
      />

      {errorInfo && ads.length === 0 ? (
        <V2Card>
          <V2CardHeader title={errorInfo.title} subtitle={errorInfo.message} />
          <V2CardBody>
            <div className="text-sm text-[var(--v2-muted)]">Error code: {errorInfo.code}</div>
            <div className="mt-3">
              <V2Button variant="primary" fullWidth onClick={() => void load()}>
                Retry
              </V2Button>
            </div>
          </V2CardBody>
        </V2Card>
      ) : loading && ads.length === 0 ? (
        <div className="grid gap-2">
          <V2Skeleton className="h-20" />
          <V2Skeleton className="h-20" />
          <V2Skeleton className="h-20" />
        </div>
      ) : ads.length === 0 ? (
        <V2Card>
          <V2CardHeader title="No ads available" subtitle="Try switching side or changing the amount." />
          <V2CardBody>
            <div className="text-sm text-[var(--v2-muted)]">We couldn’t find matching ads right now.</div>
          </V2CardBody>
        </V2Card>
      ) : (
        <section className="grid gap-2">
          {errorInfo ? (
            <div className="rounded-2xl border border-[color-mix(in_srgb,var(--v2-down)_45%,var(--v2-border))] bg-[color-mix(in_srgb,var(--v2-down)_10%,transparent)] px-3 py-2 text-xs text-[var(--v2-muted)]">
              <span className="font-semibold">Refresh warning:</span> {errorInfo.message}
            </div>
          ) : null}
          {ads.map((ad) => {
            const maker = String(ad.display_name || ad.email || "Trader");
            const priceText = fmtMoney(ad.fixed_price, fiat);
            const minText = fmtMoney(ad.min_limit, fiat);
            const maxText = fmtMoney(ad.max_limit, fiat);
            const remText = `${fmtNum(ad.remaining_amount)} ${asset}`;
            const pm = Array.isArray(ad.payment_methods) ? ad.payment_methods : [];

            return (
              <div
                key={ad.id}
                className={
                  "rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-3 shadow-[var(--v2-shadow-sm)]" +
                  (ad.highlighted_until ? " ring-1 ring-[color-mix(in_srgb,var(--v2-accent)_35%,transparent)]" : "")
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-[15px] font-semibold text-[var(--v2-text)]">{maker}</div>
                      {ad.is_verified_agent ? (
                        <span className="rounded-full border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-2 py-0.5 text-[11px] font-semibold text-[var(--v2-muted)]">
                          Verified agent
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-[12px] text-[var(--v2-muted)]">
                      Limit {minText} – {maxText} · Remaining {remText}
                    </div>
                    {pm.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {pm.slice(0, 4).map((x) => (
                          <span
                            key={x}
                            className="rounded-full border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-2 py-0.5 text-[11px] font-semibold text-[var(--v2-muted)]"
                          >
                            {String(x)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="text-[13px] font-semibold text-[var(--v2-muted)]">Price</div>
                    <div className="mt-0.5 font-mono text-[14px] font-semibold text-[var(--v2-text)]">{priceText}</div>
                    <div className="mt-2">
                      <V2Button variant="primary" size="sm" onClick={() => openTake(ad)}>
                        Take
                      </V2Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}

      <V2Sheet open={takeSheetOpen} onClose={() => setTakeSheetOpen(false)} title="Take ad">
        {!takeAd ? (
          <div className="text-sm text-[var(--v2-muted)]">No ad selected.</div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-[12px] font-semibold text-[var(--v2-text)]">
                  {String(takeAd.display_name || takeAd.email || "Trader")}
                </div>
                {takeAd.is_verified_agent ? (
                  <span className="rounded-full border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-2 py-0.5 text-[11px] font-semibold text-[var(--v2-muted)]">
                    Verified agent
                  </span>
                ) : null}
              </div>

              <div className="text-[12px] font-semibold text-[var(--v2-muted)]">Price</div>
              <div className="mt-1 font-mono text-[16px] font-semibold text-[var(--v2-text)]">{fmtMoney(takeAd.fixed_price, fiat)}</div>
              <div className="mt-1 text-[12px] text-[var(--v2-muted)]">
                Limit {fmtMoney(takeAd.min_limit, fiat)} – {fmtMoney(takeAd.max_limit, fiat)}
              </div>
            </div>

            <V2Input
              value={takeAmount}
              onChange={(e) => setTakeAmount(e.target.value)}
              placeholder={`Amount (${fiat})`}
              inputMode="decimal"
            />

            {needsSellerMethod ? (
              <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-3">
                <div className="text-[12px] font-semibold text-[var(--v2-text)]">Payout method</div>
                <div className="mt-1 text-[12px] text-[var(--v2-muted)]">Required when you sell (so the buyer can pay you).</div>

                {!methodsLoaded ? (
                  <div className="mt-3 grid gap-2">
                    <V2Skeleton className="h-10" />
                    <V2Skeleton className="h-10" />
                  </div>
                ) : methods.length === 0 ? (
                  <div className="mt-2 space-y-2">
                    <div className="text-[12px] text-[var(--v2-muted)]">
                      No payout methods yet. Add one to continue.
                    </div>

                    <V2Input
                      value={newMethodIdentifier}
                      onChange={(e) => setNewMethodIdentifier(e.target.value)}
                      placeholder="Method identifier (e.g. mpesa)"
                    />
                    <V2Input
                      value={newMethodName}
                      onChange={(e) => setNewMethodName(e.target.value)}
                      placeholder="Display name (e.g. M-Pesa)"
                    />
                    <textarea
                      value={newMethodDetailsJson}
                      onChange={(e) => setNewMethodDetailsJson(e.target.value)}
                      placeholder='Details JSON (e.g. {"phoneNumber":"..."})'
                      className="min-h-24 w-full resize-y rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 text-[12px] text-[var(--v2-text)] placeholder:text-[var(--v2-muted)]"
                    />

                    <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 text-[11px] text-[var(--v2-muted)]">
                      <div className="font-semibold text-[var(--v2-text)]">Validation hints</div>
                      {addMethodParsed.error ? <div className="mt-1 text-[var(--v2-down)]">{addMethodParsed.error}</div> : null}
                      {addMethodRules.requiredKeys.length ? (
                        <div className="mt-1">
                          Required keys: <span className="font-mono">{addMethodRules.requiredKeys.join(", ")}</span>
                        </div>
                      ) : null}
                      {addMethodMissingRequired.length ? (
                        <div className="mt-1 text-[var(--v2-down)]">
                          Missing: <span className="font-mono">{addMethodMissingRequired.join(", ")}</span>
                        </div>
                      ) : null}
                      {addMethodRules.tips.length ? <div className="mt-1">Tip: {addMethodRules.tips[0]}</div> : null}
                    </div>

                    <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--v2-muted)]">
                      <span>
                        Example ({addMethodExample.label}): <span className="font-mono">{addMethodExample.json}</span>
                      </span>
                      <button
                        type="button"
                        className="rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-2 py-1 text-[11px] font-semibold text-[var(--v2-muted)] hover:bg-[var(--v2-surface)]"
                        onClick={() => setNewMethodDetailsJson(addMethodExample.json)}
                      >
                        Use {addMethodExample.label} example
                      </button>
                    </div>

                    {addMethodError ? <div className="text-sm text-[var(--v2-down)]">{addMethodError}</div> : null}

                    <V2Button
                      variant="secondary"
                      fullWidth
                      disabled={addingMethod || Boolean(addMethodParsed.error)}
                      onClick={() => void addPaymentMethod()}
                    >
                      {addingMethod ? "Adding…" : "Add payout method"}
                    </V2Button>
                  </div>
                ) : (
                  <div className="mt-2 grid gap-2">
                    {methods.slice(0, 6).map((m) => {
                      const active = selectedMethodId === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSelectedMethodId(m.id)}
                          className={
                            "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left" +
                            (active
                              ? " border-[color-mix(in_srgb,var(--v2-accent)_55%,transparent)] bg-[color-mix(in_srgb,var(--v2-accent)_12%,transparent)]"
                              : " border-[var(--v2-border)] bg-[var(--v2-surface-2)]")
                          }
                        >
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-semibold text-[var(--v2-text)]">{String(m.name || m.identifier)}</div>
                            <div className="truncate text-[11px] text-[var(--v2-muted)]">{String(m.identifier)}</div>
                          </div>
                          <div className="text-[12px] font-semibold text-[var(--v2-muted)]">{active ? "Selected" : "Select"}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}

            {takeError ? <div className="text-sm text-[var(--v2-down)]">{takeError}</div> : null}

            <V2Button variant="primary" fullWidth disabled={taking} onClick={() => void createOrder()}>
              {taking ? "Creating…" : "Create order"}
            </V2Button>

            <Link href="/p2p" className="block text-center text-[12px] font-semibold text-[var(--v2-muted)]">
              Need advanced options? Open P2P.
            </Link>
          </div>
        )}
      </V2Sheet>
    </main>
  );
}
