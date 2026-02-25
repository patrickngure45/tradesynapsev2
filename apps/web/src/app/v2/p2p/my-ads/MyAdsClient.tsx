"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { V2Button } from "@/components/v2/Button";
import { V2Card, V2CardBody, V2CardHeader } from "@/components/v2/Card";
import { V2Input } from "@/components/v2/Input";
import { V2Sheet } from "@/components/v2/Sheet";
import { V2Skeleton } from "@/components/v2/Skeleton";
import { V2Tabs } from "@/components/v2/Tabs";
import { describeClientError, formatClientErrorDetails } from "@/lib/api/errorMessages";

type PaymentMethod = {
  id: string;
  identifier: string;
  name: string;
  details: any;
};

type P2PMyAd = {
  id: string;
  side: "BUY" | "SELL";
  asset_symbol: string;
  fiat_currency: string;
  fixed_price: string | null;
  total_amount: string;
  remaining_amount: string;
  min_limit: string;
  max_limit: string;
  payment_method_ids: any;
  payment_window_minutes: number;
  terms?: string | null;
  status: "online" | "offline" | "closed";
  highlighted_until?: string | null;
};

type ApiErr = { error: string; message?: string; details?: any };

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
  const match = document.cookie.match(/(?:^|;\s*)__csrf=([^;]+)/);
  return match?.[1] ?? null;
}

function parseMethodIds(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x)).filter(Boolean);
  if (typeof raw === "string") {
    const s = raw.trim();
    if (s.startsWith("[")) {
      try {
        const arr = JSON.parse(s);
        if (Array.isArray(arr)) return arr.map((x) => String(x)).filter(Boolean);
      } catch {
        return [];
      }
    }
    return [];
  }
  return [];
}

function errText(err: ApiErr | null): { title: string; lines: string[] } | null {
  if (!err?.error) return null;
  const info = describeClientError(err.error);
  const detailLines = formatClientErrorDetails(err.details) ?? [];
  const msg = typeof err.message === "string" && err.message ? [err.message] : [];
  const lines = [...msg, ...detailLines].filter(Boolean);
  return { title: info.title, lines: lines.length ? lines : [info.message] };
}

export function MyAdsClient() {
  const [ads, setAds] = useState<P2PMyAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<ApiErr | null>(null);

  const loadSeqRef = useRef(0);

  const load = async () => {
    const seq = ++loadSeqRef.current;
    setLoadErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/p2p/my-ads", { cache: "no-store", credentials: "include" });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        const code = typeof json?.error === "string" ? json.error : `http_${res.status}`;
        setLoadErr({ error: code, message: json?.message, details: json?.details });
        return;
      }
      if (seq !== loadSeqRef.current) return;
      setAds(Array.isArray(json?.ads) ? json.ads : []);
    } catch (e) {
      setLoadErr({ error: "internal_error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [methodsLoaded, setMethodsLoaded] = useState(false);
  const loadMyMethods = async () => {
    if (methodsLoaded) return;
    try {
      const res = await fetch("/api/p2p/payment-methods", { cache: "no-store", credentials: "include" });
      const json = (await res.json().catch(() => null)) as any;
      if (res.ok) setMethods(Array.isArray(json?.methods) ? json.methods : []);
    } finally {
      setMethodsLoaded(true);
    }
  };

  const methodsById = useMemo(() => {
    const m = new Map<string, PaymentMethod>();
    for (const row of methods) m.set(String(row.id), row);
    return m;
  }, [methods]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createErr, setCreateErr] = useState<ApiErr | null>(null);
  const [creating, setCreating] = useState(false);
  const [createSide, setCreateSide] = useState<"BUY" | "SELL">("BUY");

  const asset = "USDT";
  const fiat = "USD";

  const [createFixedPrice, setCreateFixedPrice] = useState("");
  const [createTotalAmount, setCreateTotalAmount] = useState("");
  const [createMinLimit, setCreateMinLimit] = useState("");
  const [createMaxLimit, setCreateMaxLimit] = useState("");
  const [createWindow, setCreateWindow] = useState("15");
  const [createTerms, setCreateTerms] = useState("");
  const [createPaymentMethodIds, setCreatePaymentMethodIds] = useState<string[]>([]);

  const openCreate = () => {
    setCreateErr(null);
    setCreateSide("BUY");
    setCreateFixedPrice("");
    setCreateTotalAmount("");
    setCreateMinLimit("");
    setCreateMaxLimit("");
    setCreateWindow("15");
    setCreateTerms("");
    setCreatePaymentMethodIds([]);
    setCreateOpen(true);
    void loadMyMethods();
  };

  const toggleCreateMethodId = (id: string) => {
    setCreatePaymentMethodIds((prev) => {
      const has = prev.includes(id);
      const next = has ? prev.filter((x) => x !== id) : [...prev, id];
      return next.slice(0, 3);
    });
  };

  const createAd = async () => {
    if (creating) return;
    setCreateErr(null);

    const fixed_price = toNum(createFixedPrice);
    const total_amount = toNum(createTotalAmount);
    const min_limit = toNum(createMinLimit);
    const max_limit = toNum(createMaxLimit);
    const payment_window_minutes = Math.max(15, Math.min(180, Math.floor(toNum(createWindow) ?? 15)));

    if (!fixed_price || fixed_price <= 0) {
      setCreateErr({ error: "invalid_input", message: "Enter a valid fixed price." });
      return;
    }
    if (!total_amount || total_amount <= 0) {
      setCreateErr({ error: "invalid_input", message: "Enter a valid total amount." });
      return;
    }
    if (min_limit == null || min_limit <= 0) {
      setCreateErr({ error: "invalid_input", message: "Enter a valid min limit." });
      return;
    }
    if (max_limit == null || max_limit <= 0) {
      setCreateErr({ error: "invalid_input", message: "Enter a valid max limit." });
      return;
    }
    if (min_limit > max_limit) {
      setCreateErr({ error: "invalid_input", message: "min_limit must be <= max_limit." });
      return;
    }
    if (createSide === "SELL" && createPaymentMethodIds.length === 0) {
      setCreateErr({ error: "invalid_input", message: "SELL ads must include at least one payment method." });
      return;
    }

    setCreating(true);
    try {
      const csrf = getCsrfToken();
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (csrf) headers["x-csrf-token"] = csrf;

      const res = await fetch("/api/p2p/ads", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          side: createSide,
          asset,
          fiat,
          price_type: "fixed",
          fixed_price,
          total_amount,
          min_limit,
          max_limit,
          payment_window_minutes,
          terms: createTerms,
          ...(createSide === "SELL" ? { payment_methods: createPaymentMethodIds } : {}),
        }),
      });

      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        const code = typeof json?.error === "string" ? json.error : `http_${res.status}`;
        setCreateErr({ error: code, message: json?.message, details: json?.details });
        return;
      }

      setCreateOpen(false);
      await load();
    } catch (e) {
      setCreateErr({ error: "internal_error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setCreating(false);
    }
  };

  const [editOpen, setEditOpen] = useState(false);
  const [editAd, setEditAd] = useState<P2PMyAd | null>(null);
  const [editErr, setEditErr] = useState<ApiErr | null>(null);
  const [editing, setEditing] = useState(false);
  const [editFixedPrice, setEditFixedPrice] = useState("");
  const [editMinLimit, setEditMinLimit] = useState("");
  const [editMaxLimit, setEditMaxLimit] = useState("");
  const [editWindow, setEditWindow] = useState("15");
  const [editTerms, setEditTerms] = useState("");

  const openEdit = (ad: P2PMyAd) => {
    setEditErr(null);
    setEditAd(ad);
    setEditFixedPrice(String(ad.fixed_price ?? ""));
    setEditMinLimit(String(ad.min_limit ?? ""));
    setEditMaxLimit(String(ad.max_limit ?? ""));
    setEditWindow(String(ad.payment_window_minutes ?? 15));
    setEditTerms(String(ad.terms ?? ""));
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editAd || editing) return;
    setEditErr(null);

    const fixed_price = toNum(editFixedPrice);
    const min_limit = toNum(editMinLimit);
    const max_limit = toNum(editMaxLimit);
    const payment_window_minutes = Math.max(15, Math.min(180, Math.floor(toNum(editWindow) ?? 15)));

    if (!fixed_price || fixed_price <= 0) {
      setEditErr({ error: "invalid_input", message: "Enter a valid fixed price." });
      return;
    }
    if (min_limit == null || min_limit <= 0) {
      setEditErr({ error: "invalid_input", message: "Enter a valid min limit." });
      return;
    }
    if (max_limit == null || max_limit <= 0) {
      setEditErr({ error: "invalid_input", message: "Enter a valid max limit." });
      return;
    }
    if (min_limit > max_limit) {
      setEditErr({ error: "invalid_input", message: "min_limit must be <= max_limit." });
      return;
    }

    setEditing(true);
    try {
      const csrf = getCsrfToken();
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (csrf) headers["x-csrf-token"] = csrf;

      const res = await fetch(`/api/p2p/my-ads/${encodeURIComponent(editAd.id)}`, {
        method: "PATCH",
        headers,
        credentials: "include",
        body: JSON.stringify({
          fixed_price,
          min_limit,
          max_limit,
          payment_window_minutes,
          terms: editTerms,
        }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        const code = typeof json?.error === "string" ? json.error : `http_${res.status}`;
        setEditErr({ error: code, message: json?.message, details: json?.details });
        return;
      }

      setEditOpen(false);
      await load();
    } catch (e) {
      setEditErr({ error: "internal_error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setEditing(false);
    }
  };

  const toggleStatus = async (ad: P2PMyAd) => {
    const next = ad.status === "online" ? "offline" : "online";
    const csrf = getCsrfToken();
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (csrf) headers["x-csrf-token"] = csrf;

    const res = await fetch(`/api/p2p/my-ads/${encodeURIComponent(ad.id)}`, {
      method: "PATCH",
      headers,
      credentials: "include",
      body: JSON.stringify({ status: next }),
    });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok) {
      const code = typeof json?.error === "string" ? json.error : `http_${res.status}`;
      setLoadErr({ error: code, message: json?.message, details: json?.details });
      return;
    }
    await load();
  };

  const tabs = useMemo(
    () => [
      { id: "BUY", label: "Buy" },
      { id: "SELL", label: "Sell" },
    ],
    [],
  );

  const loadErrText = errText(loadErr);
  const createErrText = errText(createErr);
  const editErrText = errText(editErr);

  return (
    <main className="space-y-4">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">P2P</div>
            <h1 className="text-2xl font-extrabold tracking-tight">My ads</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/v2/p2p"
              className="rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-2 text-[12px] font-semibold text-[var(--v2-text)]"
            >
              Marketplace
            </Link>
            <Link
              href="/v2/p2p/orders"
              className="rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-2 text-[12px] font-semibold text-[var(--v2-text)]"
            >
              My orders
            </Link>
            <Link
              href="/v2/p2p/payment-methods"
              className="rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-2 text-[12px] font-semibold text-[var(--v2-text)]"
            >
              Methods
            </Link>
          </div>
        </div>
        <p className="text-sm text-[var(--v2-muted)]">Create, edit, and pause your ads.</p>
      </header>

      {loadErrText ? (
        <V2Card>
          <V2CardHeader title={loadErrText.title} subtitle={loadErrText.lines[0]} />
          <V2CardBody>
            {loadErrText.lines.slice(1).length ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--v2-muted)]">
                {loadErrText.lines.slice(1).map((l, idx) => (
                  <li key={idx}>{l}</li>
                ))}
              </ul>
            ) : null}
            <div className="mt-3 flex gap-2">
              <V2Button variant="secondary" onClick={() => void load()}>
                Retry
              </V2Button>
            </div>
          </V2CardBody>
        </V2Card>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-[var(--v2-muted)]">{loading ? "Loading…" : `${ads.length} ads`}</div>
        <V2Button variant="primary" onClick={() => openCreate()}>
          Create ad
        </V2Button>
      </div>

      {loading ? (
        <div className="grid gap-2">
          <V2Skeleton className="h-20" />
          <V2Skeleton className="h-20" />
          <V2Skeleton className="h-20" />
        </div>
      ) : ads.length === 0 ? (
        <V2Card>
          <V2CardHeader title="No ads yet" subtitle="Create your first ad to appear in marketplace." />
          <V2CardBody>
            <div className="text-sm text-[var(--v2-muted)]">You can pause ads anytime without deleting them.</div>
          </V2CardBody>
        </V2Card>
      ) : (
        <section className="grid gap-2">
          {ads.map((ad) => {
            const fiatCur = String(ad.fiat_currency || fiat);
            const status = String(ad.status);
            const side = String(ad.side);
            const pmIds = parseMethodIds(ad.payment_method_ids);
            const pmLabels = pmIds
              .map((id) => methodsById.get(id))
              .filter(Boolean)
              .map((m) => String(m!.name || m!.identifier));

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
                      <div className="truncate text-[15px] font-semibold text-[var(--v2-text)]">
                        {side} {String(ad.asset_symbol || asset)}
                      </div>
                      <span className="rounded-full border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-2 py-0.5 text-[11px] font-semibold text-[var(--v2-muted)]">
                        {status}
                      </span>
                    </div>
                    <div className="mt-1 text-[12px] text-[var(--v2-muted)]">
                      Price {fmtMoney(ad.fixed_price, fiatCur)} · Limit {fmtMoney(ad.min_limit, fiatCur)} – {fmtMoney(ad.max_limit, fiatCur)}
                    </div>
                    <div className="mt-1 text-[12px] text-[var(--v2-muted)]">Remaining {fmtNum(ad.remaining_amount)} {String(ad.asset_symbol || asset)}</div>
                    {ad.side === "SELL" ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(pmLabels.length ? pmLabels : pmIds).slice(0, 4).map((x) => (
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
                    <div className="flex items-center justify-end gap-2">
                      <V2Button variant="secondary" size="sm" onClick={() => openEdit(ad)}>
                        Edit
                      </V2Button>
                      <V2Button
                        variant={ad.status === "online" ? "secondary" : "primary"}
                        size="sm"
                        onClick={() => void toggleStatus(ad)}
                      >
                        {ad.status === "online" ? "Pause" : "Resume"}
                      </V2Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}

      <V2Sheet open={createOpen} onClose={() => setCreateOpen(false)} title="Create ad">
        <div className="space-y-3">
          <V2Tabs tabs={tabs} activeId={createSide} onChange={(id) => setCreateSide(id as any)} />

          <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-3">
            <div className="text-[12px] font-semibold text-[var(--v2-text)]">Pair</div>
            <div className="mt-1 text-[12px] text-[var(--v2-muted)]">
              {asset} / {fiat}
            </div>
          </div>

          <V2Input value={createFixedPrice} onChange={(e) => setCreateFixedPrice(e.target.value)} placeholder={`Fixed price (${fiat} per ${asset})`} inputMode="decimal" />
          <V2Input value={createTotalAmount} onChange={(e) => setCreateTotalAmount(e.target.value)} placeholder={`Total amount (${asset})`} inputMode="decimal" />
          <V2Input value={createMinLimit} onChange={(e) => setCreateMinLimit(e.target.value)} placeholder={`Min trade (${fiat})`} inputMode="decimal" />
          <V2Input value={createMaxLimit} onChange={(e) => setCreateMaxLimit(e.target.value)} placeholder={`Max trade (${fiat})`} inputMode="decimal" />
          <V2Input value={createWindow} onChange={(e) => setCreateWindow(e.target.value)} placeholder="Payment window minutes (15-180)" inputMode="numeric" />
          <V2Input value={createTerms} onChange={(e) => setCreateTerms(e.target.value)} placeholder="Terms (optional)" />

          {createSide === "SELL" ? (
            <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-3">
              <div className="text-[12px] font-semibold text-[var(--v2-text)]">Payment methods</div>
              <div className="mt-1 text-[12px] text-[var(--v2-muted)]">Select up to 3 payout methods.</div>
              {!methodsLoaded ? (
                <div className="mt-3 grid gap-2">
                  <V2Skeleton className="h-10" />
                  <V2Skeleton className="h-10" />
                </div>
              ) : methods.length === 0 ? (
                <div className="mt-2 text-[12px] text-[var(--v2-muted)]">
                  No payout methods yet. Add one in <Link className="underline" href="/v2/p2p/payment-methods">Payment methods</Link>.
                </div>
              ) : (
                <div className="mt-2 grid gap-2">
                  {methods.slice(0, 10).map((m) => {
                    const active = createPaymentMethodIds.includes(m.id);
                    const disabled = !active && createPaymentMethodIds.length >= 3;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => toggleCreateMethodId(m.id)}
                        className={
                          "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left" +
                          (active
                            ? " border-[color-mix(in_srgb,var(--v2-accent)_55%,transparent)] bg-[color-mix(in_srgb,var(--v2-accent)_12%,transparent)]"
                            : " border-[var(--v2-border)] bg-[var(--v2-surface-2)]") +
                          (disabled ? " opacity-60" : "")
                        }
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-semibold text-[var(--v2-text)]">{String(m.name || m.identifier)}</div>
                          <div className="truncate text-[11px] text-[var(--v2-muted)]">{String(m.identifier)}</div>
                        </div>
                        <div className="text-[12px] font-semibold text-[var(--v2-muted)]">{active ? "Selected" : disabled ? "Limit" : "Select"}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {createErrText ? (
            <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-3">
              <div className="text-[12px] font-semibold text-[var(--v2-text)]">{createErrText.title}</div>
              <div className="mt-1 text-[12px] text-[var(--v2-down)]">{createErrText.lines[0]}</div>
              {createErrText.lines.slice(1).length ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] text-[var(--v2-down)]">
                  {createErrText.lines.slice(1).map((l, idx) => (
                    <li key={idx}>{l}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <V2Button variant="primary" fullWidth disabled={creating} onClick={() => void createAd()}>
            {creating ? "Creating…" : "Create"}
          </V2Button>
        </div>
      </V2Sheet>

      <V2Sheet open={editOpen} onClose={() => setEditOpen(false)} title="Edit ad">
        {!editAd ? (
          <div className="text-sm text-[var(--v2-muted)]">No ad selected.</div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-[12px] font-semibold text-[var(--v2-text)]">
                  {String(editAd.side)} {String(editAd.asset_symbol || asset)}
                </div>
                <span className="rounded-full border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-2 py-0.5 text-[11px] font-semibold text-[var(--v2-muted)]">
                  {String(editAd.status)}
                </span>
              </div>
              <div className="mt-1 text-[12px] text-[var(--v2-muted)]">Only pricing & limits can be edited (amount/asset can’t).</div>
            </div>

            <V2Input value={editFixedPrice} onChange={(e) => setEditFixedPrice(e.target.value)} placeholder={`Fixed price (${fiat} per ${asset})`} inputMode="decimal" />
            <V2Input value={editMinLimit} onChange={(e) => setEditMinLimit(e.target.value)} placeholder={`Min trade (${fiat})`} inputMode="decimal" />
            <V2Input value={editMaxLimit} onChange={(e) => setEditMaxLimit(e.target.value)} placeholder={`Max trade (${fiat})`} inputMode="decimal" />
            <V2Input value={editWindow} onChange={(e) => setEditWindow(e.target.value)} placeholder="Payment window minutes (15-180)" inputMode="numeric" />
            <V2Input value={editTerms} onChange={(e) => setEditTerms(e.target.value)} placeholder="Terms (optional)" />

            {editErrText ? (
              <div className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-3">
                <div className="text-[12px] font-semibold text-[var(--v2-text)]">{editErrText.title}</div>
                <div className="mt-1 text-[12px] text-[var(--v2-down)]">{editErrText.lines[0]}</div>
                {editErrText.lines.slice(1).length ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] text-[var(--v2-down)]">
                    {editErrText.lines.slice(1).map((l, idx) => (
                      <li key={idx}>{l}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <V2Button variant="primary" fullWidth disabled={editing} onClick={() => void saveEdit()}>
              {editing ? "Saving…" : "Save"}
            </V2Button>
          </div>
        )}
      </V2Sheet>
    </main>
  );
}
