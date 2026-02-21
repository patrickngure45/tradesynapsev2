/*
Smoke test for Arcade endpoints.

Supports three auth modes:
1) COOKIE (recommended for prod):
   - Export your cookie string from the browser (session + __csrf), set COOKIE env var.
   - Script will auto-send x-csrf-token using __csrf cookie value.

2) INTERNAL service token (prod):
   - Set INTERNAL_SERVICE_SECRET + SMOKE_USER_ID env vars.
   - Only works if the server has INTERNAL_SERVICE_SECRET configured.

3) Dev header (local dev only):
   - Set X_USER_ID env var.

Usage examples:
  BASE=https://tradesynapsev2-production.up.railway.app COOKIE='__Host-...=...; __csrf=...' npm run smoke:arcade
  BASE=http://localhost:3000 X_USER_ID=... npm run smoke:arcade

Optional:
  CRON_SECRET=...  (used to call /api/arcade/cron/resolve-ready during the run)
*/

type Json = any;

type AuthHeaders = {
  headers: Record<string, string>;
  csrfToken: string | null;
};

function requiredEnv(name: string): string {
  const v = (process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function optEnv(name: string): string | null {
  const v = (process.env[name] ?? "").trim();
  return v ? v : null;
}

function baseUrl(): string {
  return (process.env.BASE ?? "http://localhost:3000").trim().replace(/\/$/, "");
}

function parseCookieValue(cookieHeader: string, name: string): string | null {
  const parts = cookieHeader.split(";").map((x) => x.trim());
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq <= 0) continue;
    const k = p.slice(0, eq).trim();
    const v = p.slice(eq + 1);
    if (k === name) return v;
  }
  return null;
}

function buildAuthHeaders(): AuthHeaders {
  const cookie = optEnv("COOKIE");
  if (cookie) {
    const csrf = parseCookieValue(cookie, "__csrf");
    return {
      csrfToken: csrf,
      headers: {
        cookie,
      },
    };
  }

  const internal = optEnv("INTERNAL_SERVICE_SECRET");
  const smokeUserId = optEnv("SMOKE_USER_ID");
  if (internal && smokeUserId) {
    return {
      csrfToken: null,
      headers: {
        "x-internal-service-token": internal,
        "x-user-id": smokeUserId,
      },
    };
  }

  const xuid = optEnv("X_USER_ID");
  if (xuid) {
    return {
      csrfToken: null,
      headers: {
        "x-user-id": xuid,
      },
    };
  }

  return { csrfToken: null, headers: {} };
}

async function fetchJson(path: string, init?: RequestInit): Promise<{ status: number; json: Json }> {
  const url = `${baseUrl()}${path}`;
  const res = await fetch(url, init);
  const text = await res.text().catch(() => "");
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }
  return { status: res.status, json };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, Math.floor(ms))));
}

async function main() {
  const auth = buildAuthHeaders();
  const cronSecret = optEnv("CRON_SECRET") ?? optEnv("EXCHANGE_CRON_SECRET") ?? null;

  console.log(`[smoke:arcade] BASE=${baseUrl()}`);
  console.log(`[smoke:arcade] auth=${optEnv("COOKIE") ? "cookie" : optEnv("INTERNAL_SERVICE_SECRET") ? "internal" : optEnv("X_USER_ID") ? "x-user-id" : "none"}`);

  // 0) Basic auth check
  {
    const { status, json } = await fetchJson("/api/arcade/inventory", {
      method: "GET",
      headers: {
        ...auth.headers,
      },
    });

    if (status !== 200) {
      console.error(`[inventory] status=${status}`, json);
      throw new Error("Arcade inventory request failed (check auth).")
    }

    console.log(`[inventory] shards=${json?.shards ?? "?"} items=${Array.isArray(json?.items) ? json.items.length : "?"}`);
  }

  // 1) Open an insight pack (commit -> reveal)
  {
    const clientSeed = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const commitHash = await sha256Hex(clientSeed);

    const commit = await fetchJson("/api/arcade/insight/commit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...auth.headers,
        ...(auth.csrfToken ? { "x-csrf-token": auth.csrfToken } : {}),
      },
      body: JSON.stringify({ profile: "low", client_commit_hash: commitHash }),
    });

    if (commit.status !== 200 || !commit.json?.action_id) {
      console.error(`[insight/commit] status=${commit.status}`, commit.json);
      throw new Error("Insight commit failed");
    }

    const actionId = String(commit.json.action_id);

    const reveal = await fetchJson("/api/arcade/insight/reveal", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...auth.headers,
        ...(auth.csrfToken ? { "x-csrf-token": auth.csrfToken } : {}),
      },
      body: JSON.stringify({ action_id: actionId, client_seed: clientSeed }),
    });

    if (reveal.status !== 200) {
      console.error(`[insight/reveal] status=${reveal.status}`, reveal.json);
      throw new Error("Insight reveal failed");
    }

    console.log(`[insight] ok action=${actionId.slice(0, 8)}… rarity=${reveal.json?.result?.outcome?.rarity ?? "?"}`);
  }

  // 2) Community status + (optional) claim
  {
    const st = await fetchJson("/api/arcade/community/status", {
      method: "GET",
      headers: { ...auth.headers },
    });

    if (st.status !== 200) {
      console.error(`[community/status] status=${st.status}`, st.json);
      throw new Error("Community status failed");
    }

    console.log(`[community] week=${st.json?.week_start ?? "?"} progress=${st.json?.progress ?? "?"}/${st.json?.threshold ?? "?"} unlocked=${!!st.json?.unlocked} claimed=${!!st.json?.claimed}`);

    if (st.json?.unlocked && !st.json?.claimed) {
      const claim = await fetchJson("/api/arcade/community/claim", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...auth.headers,
          ...(auth.csrfToken ? { "x-csrf-token": auth.csrfToken } : {}),
        },
        body: JSON.stringify({}),
      });

      if (claim.status !== 200) {
        console.error(`[community/claim] status=${claim.status}`, claim.json);
        throw new Error("Community claim failed");
      }

      console.log(`[community] claimed ok`);
    }
  }

  // 3) Blind creation: create, optionally nudge cron resolver, poll until ready/resolved, then reveal.
  {
    const clientSeed = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const commitHash = await sha256Hex(clientSeed);

    const created = await fetchJson("/api/arcade/creation/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...auth.headers,
        ...(auth.csrfToken ? { "x-csrf-token": auth.csrfToken } : {}),
      },
      body: JSON.stringify({ profile: "low", client_commit_hash: commitHash }),
    });

    if (created.status !== 201 || !created.json?.action_id) {
      console.error(`[creation/create] status=${created.status}`, created.json);
      throw new Error("Blind creation create failed");
    }

    const actionId = String(created.json.action_id);
    console.log(`[creation] created action=${actionId.slice(0, 8)}… resolves_at=${created.json?.resolves_at ?? "?"}`);

    if (cronSecret) {
      const cron = await fetchJson(`/api/arcade/cron/resolve-ready?secret=${encodeURIComponent(cronSecret)}`, { method: "GET" });
      console.log(`[creation] cron resolve-ready status=${cron.status}`);
    }

    // Poll actions until the status changes to ready/resolved (max ~2 min).
    let status: string | null = null;
    for (let i = 0; i < 12; i += 1) {
      const list = await fetchJson("/api/arcade/actions?module=blind_creation&limit=10", {
        method: "GET",
        headers: { ...auth.headers },
      });

      const rows: any[] = Array.isArray(list.json?.actions) ? list.json.actions : [];
      const row = rows.find((r) => String(r?.id) === actionId);
      status = row?.status ?? null;

      if (status === "ready" || status === "resolved") break;
      await sleep(10_000);

      if (cronSecret) {
        await fetchJson(`/api/arcade/cron/resolve-ready?secret=${encodeURIComponent(cronSecret)}`, { method: "GET" });
      }
    }

    if (status !== "ready" && status !== "resolved") {
      console.log(`[creation] not ready yet (status=${status ?? "?"}). This is expected until resolves_at.`);
    } else if (status === "resolved") {
      console.log(`[creation] already resolved`);
    } else {
      const reveal = await fetchJson("/api/arcade/creation/reveal", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...auth.headers,
          ...(auth.csrfToken ? { "x-csrf-token": auth.csrfToken } : {}),
        },
        body: JSON.stringify({ action_id: actionId, client_seed: clientSeed }),
      });

      if (reveal.status !== 200) {
        console.error(`[creation/reveal] status=${reveal.status}`, reveal.json);
        throw new Error("Blind creation reveal failed");
      }

      console.log(`[creation] revealed rarity=${reveal.json?.result?.outcome?.rarity ?? "?"}`);
    }
  }

  console.log("[smoke:arcade] OK");
}

async function sha256Hex(input: string): Promise<string> {
  // Node 18+ has WebCrypto.
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

main().catch((e) => {
  console.error("[smoke:arcade] FAILED", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
