import { SiteChrome } from "@/components/SiteChrome";
import { BRAND_NAME } from "@/lib/seo/brand";

export const metadata = { title: `API Documentation — ${BRAND_NAME}` };

export default function ApiDocsPage() {
  return (
    <SiteChrome>
      <div className="mx-auto max-w-4xl px-6 py-12">
        <header className="mb-8">
            <h1 className="text-3xl font-bold">API Documentation</h1>
            <p className="mt-2 text-[var(--muted)]">Automate your trading strategies with our high-performance REST API.</p>
        </header>

        <div className="grid gap-12 md:grid-cols-[200px_1fr]">
            <aside className="hidden md:block">
                <nav className="sticky top-24 space-y-1 text-sm border-l-2 border-[var(--border)] pl-4">
                    <a href="#auth" className="block text-[var(--muted)] hover:text-[var(--accent)] hover:border-l-2 hover:border-[var(--accent)] -ml-4 pl-4 py-1">Authentication</a>
                    <a href="#market" className="block text-[var(--muted)] hover:text-[var(--accent)] hover:border-l-2 hover:border-[var(--accent)] -ml-4 pl-4 py-1">Market Data</a>
                    <a href="#trade" className="block text-[var(--muted)] hover:text-[var(--accent)] hover:border-l-2 hover:border-[var(--accent)] -ml-4 pl-4 py-1">Trade Execution</a>
                    <a href="#websocket" className="block text-[var(--muted)] hover:text-[var(--accent)] hover:border-l-2 hover:border-[var(--accent)] -ml-4 pl-4 py-1">WebSockets</a>
                </nav>
            </aside>

            <main className="space-y-10">
                <section id="auth">
                    <h2 className="text-xl font-bold mb-4">Authentication</h2>
                    <p className="text-sm mb-4">All private endpoints require API Key signing. You can generate keys in your <a href="/account" className="text-[var(--accent)] underline">Account Settings</a>.</p>
                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-4 font-mono text-xs overflow-x-auto">
                        <div className="text-[var(--muted)]"># Example Header</div>
                        <div>X-MBX-APIKEY: vmPUZE6mv9SD5VNHk4HlWFsOr6aKE2...</div>
                    </div>
                </section>

                <section id="market">
                    <h2 className="text-xl font-bold mb-4">Market Data</h2>
                    
                    <div className="space-y-6">
                        <div>
                             <h3 className="font-semibold text-sm flex items-center gap-2">
                                <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs">GET</span> 
                                /api/exchange/tickers
                             </h3>
                             <p className="text-sm text-[var(--muted)] mt-1">24hr ticker price change statistics.</p>
                        </div>
                        
                        <div>
                             <h3 className="font-semibold text-sm flex items-center gap-2">
                                <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs">GET</span> 
                                /api/exchange/depth
                             </h3>
                             <p className="text-sm text-[var(--muted)] mt-1">Get order book depth.</p>
                        </div>
                    </div>
                </section>

                <section id="trade">
                    <h2 className="text-xl font-bold mb-4">Trade Execution</h2>
                     <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 p-4 rounded-lg text-sm mb-4">
                        Rate limit: 50 orders / 10 seconds per IP.
                     </div>
                     <div>
                        <h3 className="font-semibold text-sm flex items-center gap-2">
                        <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">POST</span> 
                        /api/exchange/order
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

                <section id="websocket">
                    <h2 className="text-xl font-bold mb-4">WebSockets</h2>
                    <p className="text-sm mb-4">Connect to real-time streams for lowest latency.</p>
                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-4 font-mono text-xs">
                        wss://stream.tradesynapse.com/ws/v1
                    </div>
                </section>
            </main>
        </div>
      </div>
    </SiteChrome>
  );
}
