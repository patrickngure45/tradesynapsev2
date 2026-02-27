export const dynamic = "force-dynamic";

function MethodPill({ method }: { method: "GET" | "POST" }) {
  const tone =
    method === "GET"
      ? "border-[var(--v2-border)] bg-[color-mix(in_srgb,var(--v2-accent)_10%,transparent)] text-[var(--v2-accent)]"
      : "border-[var(--v2-border)] bg-[color-mix(in_srgb,var(--v2-accent-2)_10%,transparent)] text-[var(--v2-accent-2)]";
  return (
    <span className={`rounded-lg border px-2 py-0.5 text-[11px] font-extrabold tracking-wide ${tone}`}>{method}</span>
  );
}

import { LastRequestIdCard } from "@/components/LastRequestIdCard";

export default function ApiDocsPage() {
  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">Support</div>
        <h1 className="text-2xl font-extrabold tracking-tight">API Documentation</h1>
        <p className="text-sm text-[var(--v2-muted)]">Reference for the built-in API endpoints used by the Coinwaka web app.</p>
      </header>

      <div>
        <LastRequestIdCard />
      </div>

      <section className="space-y-6">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight">Authentication</h2>
          <p className="mt-2 text-sm text-[var(--v2-muted)]">
            Most private endpoints require a valid session cookie (login). In development, some endpoints also accept a dev-only
            <span className="font-mono"> x-user-id</span> header when auth enforcement is disabled.
          </p>
          <div className="mt-3 rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] p-4 text-xs shadow-[var(--v2-shadow-sm)]">
            <div className="font-mono text-[var(--v2-muted)]">Dev-only header (when enabled)</div>
            <div className="mt-2 font-mono">x-user-id: &lt;uuid&gt;</div>
            <div className="mt-3 text-[var(--v2-muted)]">In production, use sessions. Admin endpoints require an admin role.</div>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-extrabold tracking-tight">Market Data</h2>
          <div className="mt-3 grid gap-2 text-sm">
            <div className="flex items-center gap-2"><MethodPill method="GET" /> <span className="font-mono">/api/exchange/tickers</span></div>
            <div className="flex items-center gap-2"><MethodPill method="GET" /> <span className="font-mono">/api/exchange/marketdata/depth</span></div>
            <div className="flex items-center gap-2"><MethodPill method="GET" /> <span className="font-mono">/api/exchange/marketdata/trades</span></div>
            <div className="flex items-center gap-2"><MethodPill method="GET" /> <span className="font-mono">/api/exchange/marketdata/stream</span> <span className="text-[var(--v2-muted)]">(SSE)</span></div>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-extrabold tracking-tight">Trade Execution</h2>
          <div className="mt-3">
            <div className="flex items-center gap-2 text-sm"><MethodPill method="POST" /> <span className="font-mono">/api/exchange/orders</span></div>
            <pre className="mt-3 overflow-x-auto rounded-xl border border-[var(--v2-border)] bg-[var(--v2-surface)] p-4 text-xs shadow-[var(--v2-shadow-sm)]">{`{
  "symbol": "BTCUSDT",
  "side": "BUY",
  "type": "LIMIT",
  "timeInForce": "GTC",
  "quantity": 0.001,
  "price": 65000.00
}`}</pre>
          </div>
        </div>
      </section>
    </main>
  );
}
