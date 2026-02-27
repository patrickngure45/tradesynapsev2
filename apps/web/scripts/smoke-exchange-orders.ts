/*
Smoke test for Exchange Orders endpoints.

Default behavior is intentionally low-risk and non-destructive:
- Requires auth
- Verifies GET /api/exchange/orders works
- Verifies POST /api/exchange/orders rejects invalid input

Auth:
  BASE=http://localhost:3000 COOKIE='pp_session=...; __csrf=...' npm run smoke:exchange-orders
*/

import { resolveAuthHeaders, buildHeaders, fetchJson, baseUrl, summarizeAuth, assertOk, withOptionalDevServer } from "./smoke-util";

async function run() {
  const auth = await resolveAuthHeaders();

  console.log(`[smoke:exchange-orders] BASE=${baseUrl()}`);
  console.log(`[smoke:exchange-orders] auth=${summarizeAuth(auth)}`);

  if (auth.mode === "none") {
    throw new Error(
      "No auth configured. Provide COOKIE='pp_session=...; __csrf=...' (recommended) or PP_SESSION+CSRF. " +
        "In dev, run `npm run smoke:exchange:dev` (recommended) or `npm run smoke:exchange-orders:dev`."
    );
  }

  // 1) List orders (requires session auth)
  {
    const { status, json } = await fetchJson("/api/exchange/orders", {
      method: "GET",
      headers: {
        ...buildHeaders(auth, "GET"),
      },
    });

    if (status !== 200) {
      console.error(`[orders:list] status=${status}`, json);
      throw new Error("GET /api/exchange/orders failed (check auth + DB)." );
    }

    assertOk(typeof json?.user_id === "string" || typeof json?.user_id === "number", "orders:list missing user_id");
    assertOk(Array.isArray(json?.orders), "orders:list missing orders[]");

    console.log(`[orders:list] ok orders=${json.orders.length}`);
  }

  // 2) Validate placement route is reachable and enforces schema
  {
    const { status, json } = await fetchJson("/api/exchange/orders", {
      method: "POST",
      headers: {
        ...buildHeaders(auth, "POST"),
      },
      body: JSON.stringify({}),
    });

    // Expect a validation error (usually 400)
    if (status < 400 || status >= 500) {
      console.error(`[orders:place:invalid] status=${status}`, json);
      throw new Error("POST /api/exchange/orders did not reject invalid input as expected.");
    }

    console.log(`[orders:place:invalid] ok status=${status} error=${json?.error ?? "(none)"}`);
  }

  console.log("[smoke:exchange-orders] PASS");
}

withOptionalDevServer(run).catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
    console.error(
      "[smoke:exchange-orders] FAIL: cannot reach server. " +
      "Start it with `npm run dev:server` (or run `npm run smoke:exchange-orders:dev`), or set BASE=https://your-host"
    );
  }
  console.error("[smoke:exchange-orders] FAIL", e);
  process.exit(1);
});
