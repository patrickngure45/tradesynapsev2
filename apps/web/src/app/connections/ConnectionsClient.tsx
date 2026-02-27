"use client";

import { useCallback, useEffect, useState } from "react";
import { V2Button } from "@/components/v2/Button";
import { V2Input } from "@/components/v2/Input";
import { V2Skeleton } from "@/components/v2/Skeleton";
import { V2Card } from "@/components/v2/Card";

type Connection = {
  id: string;
  exchange: string;
  label: string;
  status: string;
  last_checked_at: string | null;
  last_error: string | null;
  created_at: string;
};

type Balance = { asset: string; free: string; locked: string };

const EXCHANGE_LABELS: Record<string, string> = {
  binance: "Binance",
  bybit: "Bybit",
  okx: "OKX",
  kucoin: "KuCoin",
  gateio: "Gate.io",
  bitget: "Bitget",
  mexc: "MEXC",
};

const EXCHANGE_COLORS: Record<string, string> = {
  binance: "var(--v2-warn)",
  bybit: "var(--v2-accent-2)",
  okx: "var(--v2-accent)",
  kucoin: "var(--v2-accent)",
  gateio: "var(--v2-accent-2)",
  bitget: "var(--v2-warn)",
  mexc: "var(--v2-accent)",
};

export function ConnectionsClient({ userId }: { userId: string | null }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [balances, setBalances] = useState<Record<string, Balance[]>>({});
  const [loadingBalances, setLoadingBalances] = useState<Record<string, boolean>>({});

  // Form state
  const [exchange, setExchange] = useState<string>("binance");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headers: HeadersInit = userId ? { "x-user-id": userId } : {};

  const fetchConnections = useCallback(async () => {
    try {
      const res = await fetch("/api/exchange/connections", { credentials: "include", headers });
      if (res.ok) {
        const data = await res.json();
        setConnections(data.connections ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) fetchConnections();
    else setLoading(false);
  }, [userId, fetchConnections]);

  const fetchBalances = async (connId: string) => {
    setLoadingBalances((prev) => ({ ...prev, [connId]: true }));
    try {
      const res = await fetch(`/api/exchange/connections/${connId}`, { credentials: "include", headers });
      if (res.ok) {
        const data = await res.json();
        setBalances((prev) => ({ ...prev, [connId]: data.balances }));
      }
    } catch {
      // ignore
    } finally {
      setLoadingBalances((prev) => ({ ...prev, [connId]: false }));
    }
  };

  const deleteConnection = async (connId: string) => {
    if (!confirm("Remove this exchange connection?")) return;
    await fetch(`/api/exchange/connections/${connId}`, { method: "DELETE", credentials: "include", headers });
    setConnections((prev) => prev.filter((c) => c.id !== connId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/exchange/connections", {
        method: "POST",
        credentials: "include",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          exchange,
          label,
          api_key: apiKey,
          api_secret: apiSecret,
          passphrase: passphrase || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Failed to add connection");
        return;
      }

      setShowForm(false);
      setLabel("");
      setApiKey("");
      setApiSecret("");
      setPassphrase("");
      fetchConnections();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!userId) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <div className="text-lg font-extrabold tracking-tight text-[var(--v2-text)]">Connect your exchanges</div>
        <div className="text-[13px] text-[var(--v2-muted)]">Sign in to connect your Binance, Bybit, or OKX API keys.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight text-[var(--v2-text)]">API connections</h2>
          <p className="text-[13px] text-[var(--v2-muted)]">Connect external exchange APIs for arbitrage signals and copy trading.</p>
          <p className="mt-1 text-[12px] text-[var(--v2-muted)]">
            Scanning works without keys. Bots: Cash &amp; Carry needs 1 exchange; cross-exchange strategies may need 2.
          </p>
        </div>
        <V2Button variant={showForm ? "secondary" : "primary"} onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "+ Add connection"}
        </V2Button>
      </div>

      {/* Add form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] p-5 shadow-[var(--v2-shadow-md)]"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-[var(--v2-muted)]">Exchange</label>
              <select
                value={exchange}
                onChange={(e) => setExchange(e.target.value)}
                className="w-full rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 text-[13px] font-semibold text-[var(--v2-text)] outline-none shadow-[var(--v2-shadow-sm)] focus-visible:ring-2 focus-visible:ring-[var(--v2-ring)]"
              >
                <option value="binance">Binance</option>
                <option value="bybit">Bybit</option>
                <option value="okx">OKX</option>
                <option value="kucoin">KuCoin</option>
                <option value="gateio">Gate.io</option>
                <option value="bitget">Bitget</option>
                <option value="mexc">MEXC</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-[var(--v2-muted)]">Label</label>
              <V2Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Main Trading Account"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-[var(--v2-muted)]">API key</label>
              <V2Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="font-mono"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-[var(--v2-muted)]">API secret</label>
              <V2Input
                type="password"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                className="font-mono"
                required
              />
            </div>
            {(exchange === "okx" || exchange === "kucoin") && (
              <div className="sm:col-span-2">
                <label className="mb-1 block text-[12px] font-semibold text-[var(--v2-muted)]">
                  Passphrase ({exchange === "okx" ? "OKX" : "KuCoin"})
                </label>
                <V2Input
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  className="font-mono"
                />
              </div>
            )}
          </div>

          {error && (
            <div className="mt-3 rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-down-bg)] px-3 py-2 text-[12px] font-semibold text-[var(--v2-down)]">
              {error}
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            <V2Button type="submit" variant="primary" disabled={saving}>
              {saving ? "Validating…" : "Connect"}
            </V2Button>
            <span className="text-[12px] text-[var(--v2-muted)]">
              Credentials are encrypted at rest (AES-256-GCM). We validate by fetching balances.
            </span>
          </div>
        </form>
      )}

      {/* Connections list */}
      {loading ? (
        <div className="grid gap-3">
          <V2Skeleton className="h-24" />
          <V2Skeleton className="h-24" />
        </div>
      ) : connections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--v2-border)] bg-[var(--v2-surface)] py-12 text-center shadow-[var(--v2-shadow-sm)]">
          <div className="text-[13px] font-semibold text-[var(--v2-text)]">No connections yet</div>
          <div className="mt-1 text-[12px] text-[var(--v2-muted)]">Add your first exchange API to get started.</div>
        </div>
      ) : (
        <div className="grid gap-3">
          {connections.map((conn) => (
            <V2Card key={conn.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="grid h-9 w-9 place-items-center rounded-lg text-xs font-bold text-white"
                    style={{ background: EXCHANGE_COLORS[conn.exchange] ?? "var(--v2-accent)" }}
                  >
                    {conn.exchange.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-[13px] font-bold text-[var(--v2-text)]">{conn.label}</div>
                    <div className="flex items-center gap-2 text-[12px] text-[var(--v2-muted)]">
                      <span>{EXCHANGE_LABELS[conn.exchange] ?? conn.exchange}</span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${conn.status === "active" ? "bg-[var(--v2-up-bg)] text-[var(--v2-up)]" : "bg-[var(--v2-down-bg)] text-[var(--v2-down)]"}`}>
                        <span className={`h-1 w-1 rounded-full ${conn.status === "active" ? "bg-[var(--v2-up)]" : "bg-[var(--v2-down)]"}`} />
                        {conn.status}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <V2Button variant="secondary" onClick={() => fetchBalances(conn.id)} disabled={loadingBalances[conn.id]}>
                    {loadingBalances[conn.id] ? "Loading…" : "Balances"}
                  </V2Button>
                  <V2Button variant="danger" onClick={() => deleteConnection(conn.id)}>
                    Remove
                  </V2Button>
                </div>
              </div>

              {/* Balances */}
              {balances[conn.id] && (
                <div className="mt-3 border-t border-[var(--v2-border)] pt-3">
                  <div className="grid grid-cols-3 gap-2 text-[12px]">
                    <div className="font-semibold text-[var(--v2-muted)]">Asset</div>
                    <div className="font-semibold text-[var(--v2-muted)]">Available</div>
                    <div className="font-semibold text-[var(--v2-muted)]">Locked</div>
                    {balances[conn.id]!.map((b) => (
                      <div key={b.asset} className="contents">
                        <div className="font-mono font-semibold text-[var(--v2-text)]">{b.asset}</div>
                        <div className="font-mono text-[var(--v2-text)]">{Number(b.free).toFixed(6)}</div>
                        <div className="font-mono text-[var(--v2-muted)]">{Number(b.locked).toFixed(6)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {conn.last_error && (
                <div className="mt-2 rounded-xl border border-[var(--v2-border)] bg-[var(--v2-down-bg)] px-2 py-1 text-[11px] font-semibold text-[var(--v2-down)]">
                  {conn.last_error}
                </div>
              )}
            </V2Card>
          ))}
        </div>
      )}
    </div>
  );
}
