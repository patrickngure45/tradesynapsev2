import http from "node:http";

const port = parseInt(process.env.PORT ?? "8080", 10);
const relayKey = process.env.EXCHANGE_RELAY_KEY ?? "";

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method !== "POST" || req.url !== "/fetch") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not_found" }));
      return;
    }

    if (relayKey) {
      const provided = req.headers["x-relay-key"];
      if (!provided || provided !== relayKey) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
    }

    const body = await readJson(req);
    const url = body?.url;
    const method = body?.method ?? "GET";
    const headers = body?.headers ?? {};
    const forwardBody = body?.body ?? undefined;

    if (!url || typeof url !== "string") {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_url" }));
      return;
    }

    // Basic SSRF guard: only allow https and a small allowlist of hosts
    const u = new URL(url);
    if (u.protocol !== "https:") {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_protocol" }));
      return;
    }

    const allowedHosts = new Set([
      "api.binance.com",
      "api1.binance.com",
      "api2.binance.com",
      "api3.binance.com",
      "data-api.binance.vision",
      "api.binance.vision",
      "api.bybit.com",
      "api2.bybit.com",
      "api.bytick.com",
    ]);

    if (!allowedHosts.has(u.hostname)) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "host_not_allowed", host: u.hostname }));
      return;
    }

    const r = await fetch(url, {
      method,
      headers,
      body: forwardBody,
    });

    const text = await r.text();

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: r.status, body: text }));
  } catch (e) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "relay_error", message: e instanceof Error ? e.message : String(e) }));
  }
});

server.listen(port, () => {
  console.log(`[exchange-relay] listening on :${port}`);
});
