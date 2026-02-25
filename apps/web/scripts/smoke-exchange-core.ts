/*
Core Exchange smoke test.

Runs a minimal set of checks across:
- Orders API
- Withdrawals API (+ allowlist list)
- Marketdata SSE stream

Usage:
  npm run smoke:exchange-core
  npm run smoke:exchange-core:dev

Auth:
  BASE=http://localhost:3000 COOKIE='pp_session=...; __csrf=...' npm run smoke:exchange-core

In dev (NODE_ENV!=production), if no COOKIE/PP_SESSION is provided, this will
auto-bootstrap a session via /api/dev/login.
*/

import {
  resolveAuthHeaders,
  buildHeaders,
  fetchJson,
  baseUrl,
  summarizeAuth,
  assertOk,
  withOptionalDevServer,
} from "./smoke-util";

async function smokeOrders(auth: Awaited<ReturnType<typeof resolveAuthHeaders>>) {
  // 1) List orders
  {
    const { status, json } = await fetchJson("/api/exchange/orders", {
      method: "GET",
      headers: {
        ...buildHeaders(auth, "GET"),
      },
    });

    if (status !== 200) {
      console.error(`[orders:list] status=${status}`, json);
      throw new Error("GET /api/exchange/orders failed (check auth + DB).");
    }

    assertOk(typeof json?.user_id === "string" || typeof json?.user_id === "number", "orders:list missing user_id");
    assertOk(Array.isArray(json?.orders), "orders:list missing orders[]");

    console.log(`[orders:list] ok orders=${json.orders.length}`);
  }

  // 2) Invalid placement should reject
  {
    const { status, json } = await fetchJson("/api/exchange/orders", {
      method: "POST",
      headers: {
        ...buildHeaders(auth, "POST"),
      },
      body: JSON.stringify({}),
    });

    if (status < 400 || status >= 500) {
      console.error(`[orders:place:invalid] status=${status}`, json);
      throw new Error("POST /api/exchange/orders did not reject invalid input as expected.");
    }

    console.log(`[orders:place:invalid] ok status=${status} error=${json?.error ?? "(none)"}`);
  }
}

async function smokeWithdrawals(auth: Awaited<ReturnType<typeof resolveAuthHeaders>>) {
  // 1) List withdrawals
  {
    const { status, json } = await fetchJson("/api/exchange/withdrawals", {
      method: "GET",
      headers: {
        ...buildHeaders(auth, "GET"),
      },
    });

    if (status !== 200) {
      console.error(`[withdrawals:list] status=${status}`, json);
      throw new Error("GET /api/exchange/withdrawals failed (check auth + DB).");
    }

    assertOk(Array.isArray(json?.withdrawals), "withdrawals:list missing withdrawals[]");
    console.log(`[withdrawals:list] ok withdrawals=${json.withdrawals.length}`);
  }

  // 2) Allowlist list
  {
    const { status, json } = await fetchJson("/api/exchange/withdrawals/allowlist", {
      method: "GET",
      headers: {
        ...buildHeaders(auth, "GET"),
      },
    });

    if (status !== 200) {
      console.error(`[allowlist:list] status=${status}`, json);
      throw new Error("GET /api/exchange/withdrawals/allowlist failed (check auth + DB).");
    }

    assertOk(Array.isArray(json?.addresses), "allowlist:list missing addresses[]");
    console.log(`[allowlist:list] ok addresses=${json.addresses.length}`);
  }

  // 3) Invalid withdrawal request should reject
  {
    const { status, json } = await fetchJson("/api/exchange/withdrawals/request", {
      method: "POST",
      headers: {
        ...buildHeaders(auth, "POST"),
      },
      body: JSON.stringify({}),
    });

    if (status < 400 || status >= 500) {
      console.error(`[withdrawals:request:invalid] status=${status}`, json);
      throw new Error("POST /api/exchange/withdrawals/request did not reject invalid input as expected.");
    }

    console.log(`[withdrawals:request:invalid] ok status=${status} error=${json?.error ?? "(none)"}`);
  }
}

async function smokeMarketdataStream() {
  // Reuse the existing dedicated script logic by doing the same minimal handshake:
  // fetch a market_id from overview, then open SSE stream for that market.
  const overview = await fetchJson("/api/exchange/markets/overview", { method: "GET" });
  if (overview.status !== 200) {
    console.error(`[marketdata:overview] status=${overview.status}`, overview.json);
    throw new Error("GET /api/exchange/markets/overview failed.");
  }

  const marketId =
    overview.json?.markets?.[0]?.id ??
    overview.json?.top?.[0]?.market_id ??
    overview.json?.overview?.[0]?.market_id ??
    null;

  assertOk(typeof marketId === "string" && marketId.length > 0, "marketdata: missing a market_id from overview");

  const url = `${baseUrl()}/api/exchange/marketdata/stream?market_id=${encodeURIComponent(marketId)}`;
  const res = await fetch(url, { method: "GET", headers: { accept: "text/event-stream" } });
  if (res.status !== 200) {
    const text = await res.text().catch(() => "");
    console.error(`[sse] status=${res.status}`, text.slice(0, 500));
    throw new Error("GET /api/exchange/marketdata/stream did not return 200.");
  }

  // Read a small chunk to confirm it's an SSE stream.
  const reader = res.body?.getReader();
  if (!reader) throw new Error("SSE response has no body.");

  const { value } = await reader.read();
  const chunk = value ? new TextDecoder().decode(value) : "";
  await reader.cancel().catch(() => undefined);

  assertOk(chunk.includes("data:") || chunk.includes("event:"), "SSE stream did not emit any event lines");
  console.log(`[sse] ok market_id=${marketId}`);
}

async function run() {
  const auth = await resolveAuthHeaders();

  console.log(`[smoke:exchange-core] BASE=${baseUrl()}`);
  console.log(`[smoke:exchange-core] auth=${summarizeAuth(auth)}`);

  if (auth.mode === "none") {
    throw new Error(
      "No auth configured. Provide COOKIE='pp_session=...; __csrf=...' (recommended) or PP_SESSION+CSRF. " +
        "In dev, ensure /api/dev/login is available (NODE_ENV!=production)."
    );
  }

  await smokeOrders(auth);
  await smokeWithdrawals(auth);
  await smokeMarketdataStream();

  console.log("[smoke:exchange-core] PASS");
}

withOptionalDevServer(run).catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
    console.error(
      "[smoke:exchange-core] FAIL: cannot reach server. " +
        "Start it with `npm run dev:server` (or run `npm run smoke:exchange-core:dev`), or set BASE=https://your-host"
    );
  }
  console.error("[smoke:exchange-core] FAIL", e);
  process.exit(1);
});
