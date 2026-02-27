/*
Smoke test for Exchange marketdata SSE.

 Fetches /api/exchange/markets/overview to pick a market_id
- Connects to /api/exchange/marketdata/stream and verifies it returns SSE

Usage:
  BASE=http://localhost:3000 npm run smoke:exchange-marketdata-stream
*/

import { baseUrl, fetchJson, assertOk, withOptionalDevServer } from "./smoke-util";

async function readSomeSse(res: Response, opts: { maxBytes: number; timeoutMs: number }): Promise<string> {
  assertOk(res.body, "SSE response has no body");

  // Node 22 supports Web Streams on fetch Response.
  const reader = (res.body as any).getReader();
  const decoder = new TextDecoder();

  let out = "";
  let bytes = 0;

  try {
    // Time budgeting is handled by the caller aborting the fetch via AbortController.
    while (bytes < opts.maxBytes) {
      const { done, value } = (await reader.read()) as any;

      if (done) break;
      if (!value) continue;

      bytes += value.byteLength ?? value.length ?? 0;
      out += decoder.decode(value, { stream: true });

      // Stop early once we see any SSE frame-ish content.
      if (out.includes("event:") || out.includes("data:")) break;
    }

    return out;
  } finally {
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
  }
}

async function run() {
  console.log(`[smoke:exchange-marketdata-stream] BASE=${baseUrl()}`);

  const { status: ms, json: overview } = await fetchJson("/api/exchange/markets/overview", {
    method: "GET",
  });

  if (ms !== 200) {
    console.error(`[markets:overview] status=${ms}`, overview);
    throw new Error("GET /api/exchange/markets/overview failed");
  }

  const markets: any[] = Array.isArray(overview?.markets) ? overview.markets : [];
  assertOk(markets.length > 0, "No enabled markets found (seed markets first)." );

  const marketId = markets[0]?.id;
  assertOk(typeof marketId === "string" && marketId.length > 10, "Invalid market_id from overview" );

  const url = `${baseUrl()}/api/exchange/marketdata/stream?market_id=${encodeURIComponent(marketId)}&topics=top&poll_ms=500&heartbeat_ms=5000`;
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 12_000);
  let res: Response | null = null;
  try {
    res = await fetch(url, { method: "GET", signal: ac.signal, headers: { accept: "text/event-stream" } });

    if (res.status !== 200) {
      const text = await res.text().catch(() => "");
      console.error(`[sse] status=${res.status} body=${text.slice(0, 300)}`);
      throw new Error("SSE connection failed");
    }

    const ct = res.headers.get("content-type") ?? "";
    assertOk(ct.includes("text/event-stream"), `Expected text/event-stream, got: ${ct}`);

    const chunk = await readSomeSse(res, { maxBytes: 32_000, timeoutMs: 10_000 });
    assertOk(chunk.includes("event:") || chunk.includes("data:"), "Did not receive any SSE event/data within time budget." );

    console.log(`[sse] ok market_id=${marketId}`);
    console.log("[smoke:exchange-marketdata-stream] PASS");
  } finally {
    clearTimeout(timeout);
    try {
      ac.abort();
    } catch {
      // ignore
    }
    // Best-effort: ensure the response body is closed.
    try {
      await (res as any)?.body?.cancel?.();
    } catch {
      // ignore
    }
  }
}

withOptionalDevServer(run).catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
    console.error(
      "[smoke:exchange-marketdata-stream] FAIL: cannot reach server. " +
      "Run `npm run smoke:exchange:dev` (recommended) or start it with `npm run dev:server` (or run `npm run smoke:exchange-marketdata-stream:dev`), or set BASE=https://your-host"
    );
  }
  console.error("[smoke:exchange-marketdata-stream] FAIL", e);
  process.exit(1);
});
