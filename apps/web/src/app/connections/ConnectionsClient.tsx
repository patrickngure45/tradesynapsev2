"use client";

import { useCallback, useEffect, useState } from "react";

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
  binance: "var(--warn)",
  bybit: "var(--accent-2)",
  okx: "var(--accent)",
  kucoin: "var(--accent)",
  gateio: "var(--accent-2)",
  bitget: "var(--warn)",
  mexc: "var(--accent)",
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
        <div className="text-lg font-medium">Connect Your Exchanges</div>
        <div className="text-sm text-[var(--muted)]">Sign in to connect your Binance, Bybit, or OKX API keys.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">API Connections</h2>
          <p className="text-xs text-[var(--muted)]">Connect external exchange APIs for arbitrage signals and copy trading.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] px-4 py-2 text-xs font-semibold text-white transition hover:brightness-110"
        >
          {showForm ? "Cancel" : "+ Add Connection"}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Exchange</label>
              <select
                value={exchange}
                onChange={(e) => setExchange(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--card-2)] px-3 py-2 text-sm"
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
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Label</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Main Trading Account"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--card-2)] px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--card-2)] px-3 py-2 font-mono text-sm"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">API Secret</label>
              <input
                type="password"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--card-2)] px-3 py-2 font-mono text-sm"
                required
              />
            </div>
            {(exchange === "okx" || exchange === "kucoin") && (
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Passphrase ({exchange === "okx" ? "OKX" : "KuCoin"})</label>
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--card-2)] px-3 py-2 font-mono text-sm"
                />
              </div>
            )}
          </div>

          {error && (
            <div className="mt-3 rounded-lg bg-[var(--down-bg)] px-3 py-2 text-xs text-[var(--down)]">{error}</div>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {saving ? "Validating..." : "Connect"}
            </button>
            <span className="text-[10px] text-[var(--muted)]">
              Credentials are encrypted at rest (AES-256-GCM). We validate by fetching balances.
            </span>
          </div>
        </form>
      )}

      {/* Connections list */}
      {loading ? (
        <div className="py-8 text-center text-sm text-[var(--muted)]">Loading...</div>
      ) : connections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] py-12 text-center">
          <div className="text-sm font-medium text-[var(--muted)]">No connections yet</div>
          <div className="mt-1 text-xs text-[var(--muted)]">Add your first exchange API to get started.</div>
        </div>
      ) : (
        <div className="grid gap-3">
          {connections.map((conn) => (
            <div
              key={conn.id}
              className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="grid h-9 w-9 place-items-center rounded-lg text-xs font-bold text-white"
                    style={{ background: EXCHANGE_COLORS[conn.exchange] ?? "var(--accent)" }}
                  >
                    {conn.exchange.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{conn.label}</div>
                    <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                      <span>{EXCHANGE_LABELS[conn.exchange] ?? conn.exchange}</span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${conn.status === "active" ? "bg-[var(--up-bg)] text-[var(--up)]" : "bg-[var(--down-bg)] text-[var(--down)]"}`}>
                        <span className={`h-1 w-1 rounded-full ${conn.status === "active" ? "bg-[var(--up)]" : "bg-[var(--down)]"}`} />
                        {conn.status}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fetchBalances(conn.id)}
                    disabled={loadingBalances[conn.id]}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium transition hover:bg-[var(--card-2)] disabled:opacity-50"
                  >
                    {loadingBalances[conn.id] ? "Loading..." : "Balances"}
                  </button>
                  <button
                    onClick={() => deleteConnection(conn.id)}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--down)] transition hover:bg-[var(--down-bg)]"
                  >
                    Remove
                  </button>
                </div>
              </div>

              {/* Balances */}
              {balances[conn.id] && (
                <div className="mt-3 border-t border-[var(--border)] pt-3">
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="font-medium text-[var(--muted)]">Asset</div>
                    <div className="font-medium text-[var(--muted)]">Available</div>
                    <div className="font-medium text-[var(--muted)]">Locked</div>
                    {balances[conn.id]!.map((b) => (
                      <div key={b.asset} className="contents">
                        <div className="font-mono font-medium">{b.asset}</div>
                        <div className="font-mono">{Number(b.free).toFixed(6)}</div>
                        <div className="font-mono text-[var(--muted)]">{Number(b.locked).toFixed(6)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {conn.last_error && (
                <div className="mt-2 rounded-lg bg-[var(--down-bg)] px-2 py-1 text-[10px] text-[var(--down)]">
                  {conn.last_error}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
