/*
Smoke test for Exchange Withdrawals endpoints.

Default behavior is non-destructive:
- Requires auth
- Verifies GET /api/exchange/withdrawals works
- Verifies GET /api/exchange/withdrawals/allowlist works
- Verifies POST /api/exchange/withdrawals/request rejects invalid input

Auth (recommended):
  BASE=http://localhost:3000 COOKIE='pp_session=...; __csrf=...' npm run smoke:exchange-withdrawals
*/

import { resolveAuthHeaders, buildHeaders, fetchJson, baseUrl, summarizeAuth, assertOk, withOptionalDevServer } from "./smoke-util";

async function run() {
  const auth = await resolveAuthHeaders();

  console.log(`[smoke:exchange-withdrawals] BASE=${baseUrl()}`);
  console.log(`[smoke:exchange-withdrawals] auth=${summarizeAuth(auth)}`);

  if (auth.mode === "none") {
    throw new Error(
      "No auth configured. Provide COOKIE='pp_session=...; __csrf=...' (recommended) or PP_SESSION+CSRF. " +
        "In dev, run `npm run smoke:exchange:dev` (recommended) or `npm run smoke:exchange-withdrawals:dev`."
    );
  }

  // 1) List withdrawals (uses acting user id via middleware/session)
  {
    const { status, json } = await fetchJson("/api/exchange/withdrawals", {
      method: "GET",
      headers: {
        ...buildHeaders(auth, "GET"),
      },
    });

    if (status !== 200) {
      console.error(`[withdrawals:list] status=${status}`, json);
      throw new Error("GET /api/exchange/withdrawals failed (check auth/middleware + DB)." );
    }

    assertOk(Array.isArray(json?.withdrawals), "withdrawals:list missing withdrawals[]");
    console.log(`[withdrawals:list] ok withdrawals=${json.withdrawals.length}`);
  }

  // 2) List allowlist
  {
    const { status, json } = await fetchJson("/api/exchange/withdrawals/allowlist", {
      method: "GET",
      headers: {
        ...buildHeaders(auth, "GET"),
      },
    });

    if (status !== 200) {
      console.error(`[allowlist:list] status=${status}`, json);
      throw new Error("GET /api/exchange/withdrawals/allowlist failed (check session auth + DB)." );
    }

    assertOk(Array.isArray(json?.addresses), "allowlist:list missing addresses[]");
    console.log(`[allowlist:list] ok addresses=${json.addresses.length}`);
  }

  // 3) Withdrawal request rejects invalid input
  {
    const { status, json } = await fetchJson("/api/exchange/withdrawals/request", {
      method: "POST",
      headers: {
        ...buildHeaders(auth, "POST"),
      },
      body: JSON.stringify({}),
    });

    // Expect a validation error (usually 400)
    if (status < 400 || status >= 500) {
      console.error(`[withdrawals:request:invalid] status=${status}`, json);
      throw new Error("POST /api/exchange/withdrawals/request did not reject invalid input as expected.");
    }

    console.log(`[withdrawals:request:invalid] ok status=${status} error=${json?.error ?? "(none)"}`);
  }

  console.log("[smoke:exchange-withdrawals] PASS");
}

withOptionalDevServer(run).catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
    console.error(
      "[smoke:exchange-withdrawals] FAIL: cannot reach server. " +
      "Start it with `npm run dev:server` (or run `npm run smoke:exchange-withdrawals:dev`), or set BASE=https://your-host"
    );
  }
  console.error("[smoke:exchange-withdrawals] FAIL", e);
  process.exit(1);
});
