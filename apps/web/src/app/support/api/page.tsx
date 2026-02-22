import { SiteChrome } from "@/components/SiteChrome";
import { LastRequestIdCard } from "@/components/LastRequestIdCard";
import { BRAND_NAME } from "@/lib/seo/brand";

export const metadata = { title: `API Documentation — ${BRAND_NAME}` };

function MethodPill({ method }: { method: "GET" | "POST" }) {
    const tone =
        method === "GET"
            ? "border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)]"
            : "border-[color-mix(in_srgb,var(--accent-2)_35%,var(--border))] bg-[color-mix(in_srgb,var(--accent-2)_10%,transparent)] text-[var(--accent-2)]";
    return (
        <span className={`rounded-lg border px-2 py-0.5 text-[11px] font-extrabold tracking-wide ${tone}`}>{method}</span>
    );
}

export default function ApiDocsPage() {
  return (
    <SiteChrome>
      <div className="mx-auto max-w-4xl px-6 py-12">
        <header className="mb-8">
            <h1 className="text-3xl font-bold">API Documentation</h1>
                        <p className="mt-2 text-[var(--muted)]">Reference for the built-in API endpoints used by the Coinwaka web app.</p>
        </header>

                <div className="mb-8">
                    <LastRequestIdCard />
                </div>

        <div className="grid gap-12 md:grid-cols-[200px_1fr]">
            <aside className="hidden md:block">
                <nav className="sticky top-24 space-y-1 text-sm border-l-2 border-[var(--border)] pl-4">
                    <a href="#auth" className="block text-[var(--muted)] hover:text-[var(--accent)] hover:border-l-2 hover:border-[var(--accent)] -ml-4 pl-4 py-1">Authentication</a>
                    <a href="#market" className="block text-[var(--muted)] hover:text-[var(--accent)] hover:border-l-2 hover:border-[var(--accent)] -ml-4 pl-4 py-1">Market Data</a>
                                        <a href="#trade" className="block text-[var(--muted)] hover:text-[var(--accent)] hover:border-l-2 hover:border-[var(--accent)] -ml-4 pl-4 py-1">Trade Execution</a>
                                        <a href="#explain" className="block text-[var(--muted)] hover:text-[var(--accent)] hover:border-l-2 hover:border-[var(--accent)] -ml-4 pl-4 py-1">Explainability</a>
                                        <a href="#transparency" className="block text-[var(--muted)] hover:text-[var(--accent)] hover:border-l-2 hover:border-[var(--accent)] -ml-4 pl-4 py-1">Transparency</a>
                </nav>
            </aside>

            <main className="space-y-10">
                <section id="auth">
                    <h2 className="text-xl font-bold mb-4">Authentication</h2>
                                        <p className="text-sm mb-4 text-[var(--muted)]">
                                            Most private endpoints require a valid session cookie (login). In development, some endpoints also accept a dev-only
                                            <span className="font-mono"> x-user-id</span> header when auth enforcement is disabled.
                                        </p>
                                        <div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-4 text-xs overflow-x-auto">
                                                <div className="font-mono text-[var(--muted)]">Dev-only header (when enabled)</div>
                                                <div className="mt-2 font-mono">x-user-id: &lt;uuid&gt;</div>
                                                <div className="mt-3 text-[var(--muted)]">In production, use sessions. Admin endpoints require an admin role.</div>
                                        </div>
                </section>

                <section id="market">
                    <h2 className="text-xl font-bold mb-4">Market Data</h2>
                    
                    <div className="space-y-6">
                        <div>
                             <h3 className="font-semibold text-sm flex items-center gap-2">
                                                                <MethodPill method="GET" />
                                /api/exchange/tickers
                             </h3>
                             <p className="text-sm text-[var(--muted)] mt-1">24hr ticker price change statistics.</p>
                        </div>
                        
                        <div>
                             <h3 className="font-semibold text-sm flex items-center gap-2">
                                                                <MethodPill method="GET" />
                                                                /api/exchange/marketdata/depth
                             </h3>
                             <p className="text-sm text-[var(--muted)] mt-1">Get order book depth.</p>
                        </div>

                                                <div>
                                                         <h3 className="font-semibold text-sm flex items-center gap-2">
                                                                <MethodPill method="GET" />
                                                                /api/exchange/marketdata/trades
                                                         </h3>
                                                         <p className="text-sm text-[var(--muted)] mt-1">Recent trades for a market.</p>
                                                </div>

                                                <div>
                                                         <h3 className="font-semibold text-sm flex items-center gap-2">
                                                                <MethodPill method="GET" />
                                                                /api/exchange/marketdata/stream (SSE)
                                                         </h3>
                                                         <p className="text-sm text-[var(--muted)] mt-1">Server-Sent Events stream (top/depth/trades). Designed for browser clients.</p>
                                                </div>
                    </div>
                </section>

                <section id="trade">
                    <h2 className="text-xl font-bold mb-4">Trade Execution</h2>
                     <div>
                        <h3 className="font-semibold text-sm flex items-center gap-2">
                                                <MethodPill method="POST" />
                                                /api/exchange/orders
                        </h3>
                                                 <pre className="mt-3 bg-[var(--card)] border border-[var(--border)] rounded-md p-4 text-xs">
{`{
  "symbol": "BTCUSDT",
  "side": "BUY",
  "type": "LIMIT",
  "timeInForce": "GTC",
  "quantity": 0.001,
  "price": 65000.00
}`}
                         </pre>
                    </div>
                </section>

                                <section id="explain">
                                        <h2 className="text-xl font-bold mb-4">Explainability</h2>
                                        <p className="text-sm text-[var(--muted)] mb-4">
                                            These endpoints return rules-based explanations for user-facing state. Optionally, when enabled, you can request an AI rephrase
                                            using <span className="font-mono">?ai=1</span> (rules-first output remains canonical).
                                        </p>

                                        <div className="space-y-6">
                                            <div>
                                                <h3 className="font-semibold text-sm flex items-center gap-2">
                                                    <MethodPill method="GET" />
                                                    /api/explain/order?id=&lt;uuid&gt;[&amp;ai=1]
                                                </h3>
                                                <p className="text-sm text-[var(--muted)] mt-1">Explains an exchange order status for the acting user.</p>
                                            </div>

                                            <div>
                                                <h3 className="font-semibold text-sm flex items-center gap-2">
                                                    <MethodPill method="GET" />
                                                    /api/explain/withdrawal?id=&lt;uuid&gt;[&amp;ai=1]
                                                </h3>
                                                <p className="text-sm text-[var(--muted)] mt-1">Explains a withdrawal request status for the acting user.</p>
                                            </div>

                                            <div>
                                                <h3 className="font-semibold text-sm flex items-center gap-2">
                                                    <MethodPill method="GET" />
                                                    /api/explain/p2p-order?id=&lt;uuid&gt;[&amp;ai=1]
                                                </h3>
                                                <p className="text-sm text-[var(--muted)] mt-1">Explains a P2P order status (buyer/seller/maker/taker).</p>
                                            </div>
                                        </div>

                                        <div className="mt-6">
                                            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Admin-only</div>
                                            <div className="mt-3 space-y-4">
                                                <div>
                                                    <h3 className="font-semibold text-sm flex items-center gap-2">
                                                        <MethodPill method="GET" />
                                                        /api/admin/explain/withdrawal?id=&lt;uuid&gt;[&amp;ai=1]
                                                    </h3>
                                                    <p className="text-sm text-[var(--muted)] mt-1">Explains a withdrawal request status (admin).</p>
                                                </div>

                                                <div>
                                                    <h3 className="font-semibold text-sm flex items-center gap-2">
                                                        <MethodPill method="GET" />
                                                        /api/admin/explain/order?id=&lt;uuid&gt;[&amp;ai=1]
                                                    </h3>
                                                    <p className="text-sm text-[var(--muted)] mt-1">Explains an exchange order status (admin).</p>
                                                </div>

                                                <div>
                                                    <h3 className="font-semibold text-sm flex items-center gap-2">
                                                        <MethodPill method="GET" />
                                                        /api/admin/explain/p2p-order?id=&lt;uuid&gt;[&amp;ai=1]
                                                    </h3>
                                                    <p className="text-sm text-[var(--muted)] mt-1">Explains a P2P order status (admin).</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 text-sm text-[var(--muted)]">
                                            Enable AI rephrase with <span className="font-mono">EXPLAIN_ENABLE_AI_REPHRASE=1</span> (and <span className="font-mono">GROQ_API_KEY</span>).
                                        </div>
                                </section>

                                <section id="transparency">
                                        <h2 className="text-xl font-bold mb-4">Transparency</h2>
                                        <p className="text-sm text-[var(--muted)] mb-4">Aggregated transparency stats for Arcade modules (distributions, latency, overdue counts).</p>

                                        <div className="space-y-6">
                                            <div>
                                                <h3 className="font-semibold text-sm flex items-center gap-2">
                                                    <MethodPill method="GET" />
                                                    /api/arcade/transparency
                                                </h3>
                                                <p className="text-sm text-[var(--muted)] mt-1">Per-user transparency dashboard data.</p>
                                            </div>

                                            <div>
                                                <h3 className="font-semibold text-sm flex items-center gap-2">
                                                    <MethodPill method="GET" />
                                                    /api/admin/arcade/transparency
                                                </h3>
                                                <p className="text-sm text-[var(--muted)] mt-1">Admin/global transparency dashboard data.</p>
                                            </div>
                                        </div>
                                </section>
            </main>
        </div>
      </div>
    </SiteChrome>
  );
}
