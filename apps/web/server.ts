/**
 * Custom server — Next.js + WebSocket on the same port.
 *
 * Handles HTTP upgrade on the `/ws` path to attach WebSocket
 * connections, while all other requests pass through to Next.js.
 *
 * Usage:
 *   tsx server.ts          (development, replaces `next dev`)
 *   node server.js         (production, after `next build`)
 */

import "dotenv/config";
import type { IncomingMessage } from "node:http";
import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { WebSocketServer, type WebSocket } from "ws";
import type { Duplex } from "node:stream";
import { createSql } from "./src/lib/db";
import {
  acquireWs,
  releaseWs,
  addClient,
  removeClient,
  handleMessage,
  startPolling,
  stopPolling,
  getClients,
  type ClientState,
} from "./src/lib/ws/channels";

const dev = process.env.NODE_ENV !== "production";

function isPlaceholderSecret(raw: string): boolean {
  const v = String(raw ?? "").trim();
  if (!v) return true;
  const lower = v.toLowerCase();
  if (lower.includes("change-me")) return true;
  if (lower.includes("changeme")) return true;
  if (lower.includes("replace")) return true;
  if (lower.includes("placeholder")) return true;
  if (lower === "dev" || lower === "test" || lower === "password") return true;
  return false;
}

function assertProdPreflight(): void {
  if (dev) return;

  const problems: string[] = [];

  const baseUrl = String(process.env.NEXT_PUBLIC_BASE_URL ?? "").trim();
  if (!baseUrl) {
    problems.push("NEXT_PUBLIC_BASE_URL must be set in production (e.g. https://coinwaka.com)");
  } else {
    const lower = baseUrl.toLowerCase();
    if (lower.includes("localhost") || lower.includes("127.0.0.1") || lower.startsWith("http://")) {
      problems.push("NEXT_PUBLIC_BASE_URL must be a public https URL (not localhost/http)");
    }
  }

  const allowedOrigin = String(process.env.ALLOWED_ORIGIN ?? "").trim();
  if (!allowedOrigin) {
    problems.push("ALLOWED_ORIGIN should be set in production to your public origin (for CSRF/origin checks)");
  } else {
    const lower = allowedOrigin.toLowerCase();
    if (lower.includes("localhost") || lower.includes("127.0.0.1")) {
      problems.push("ALLOWED_ORIGIN must not be localhost in production");
    }
  }

  const evidenceStorage = String(process.env.EVIDENCE_STORAGE ?? "local").trim().toLowerCase();
  const allowLocalEvidence = String(process.env.ALLOW_LOCAL_EVIDENCE_STORAGE_IN_PROD ?? "").trim() === "1";
  if (evidenceStorage === "local" && !allowLocalEvidence) {
    problems.push(
      "EVIDENCE_STORAGE=local is unsafe in production (ephemeral disk). Set EVIDENCE_STORAGE=s3 or set ALLOW_LOCAL_EVIDENCE_STORAGE_IN_PROD=1 to override.",
    );
  }

  const sessionSecret = String(process.env.PROOFPACK_SESSION_SECRET ?? "").trim();
  if (isPlaceholderSecret(sessionSecret) || sessionSecret.length < 32) {
    problems.push("PROOFPACK_SESSION_SECRET must be set to a strong random value (>= 32 chars)");
  }

  const bootstrap = String(process.env.PROOFPACK_SESSION_BOOTSTRAP_KEY ?? "").trim();
  if (isPlaceholderSecret(bootstrap) || bootstrap.length < 16) {
    problems.push("PROOFPACK_SESSION_BOOTSTRAP_KEY must be set in production (>= 16 chars)");
  }

  const adminKey = String(process.env.EXCHANGE_ADMIN_KEY ?? "").trim();
  if (isPlaceholderSecret(adminKey) || adminKey.length < 16) {
    problems.push("EXCHANGE_ADMIN_KEY must be set in production (>= 16 chars)");
  }

  const enableConditional = String(process.env.EXCHANGE_ENABLE_CONDITIONAL_ORDERS ?? "").trim() === "1";
  const enablePriceAlerts = String(process.env.EXCHANGE_ENABLE_PRICE_ALERTS ?? "").trim() === "1";
  const enableOutboxCron = true; // outbox worker cron endpoint exists and is expected in prod.

  if (enableConditional || enablePriceAlerts || enableOutboxCron) {
    const cron = String(process.env.EXCHANGE_CRON_SECRET ?? process.env.CRON_SECRET ?? "").trim();
    if (isPlaceholderSecret(cron) || cron.length < 16) {
      problems.push("EXCHANGE_CRON_SECRET (or CRON_SECRET) must be set in production (>= 16 chars)");
    }
  }

  const requireSigned = String(process.env.PROOFPACK_REQUIRE_SIGNED ?? "").trim() === "1";
  if (requireSigned) {
    const pk = String(process.env.PROOFPACK_SIGNING_PRIVATE_KEY ?? process.env.PROOFPACK_SIGNING_PRIVATE_KEY_B64 ?? "").trim();
    if (isPlaceholderSecret(pk) || pk.length < 32) {
      problems.push("PROOFPACK_SIGNING_PRIVATE_KEY(_B64) must be set when PROOFPACK_REQUIRE_SIGNED=1");
    }
  }

  if (problems.length) {
    const msg =
      "Refusing to start in production due to missing/placeholder secrets:\n" +
      problems.map((p) => "- " + p).join("\n");
    throw new Error(msg);
  }
}
// Next.js 16 uses Turbopack by default in dev in some setups.
// We run a custom server (`tsx server.ts`), and on Windows it’s easy to end up with
// a corrupted Turbopack cache DB which prevents startup.
//
// Force webpack dev bundler for reliability.
if (dev) {
  process.env.NEXT_DISABLE_TURBOPACK ??= "1";
}

// Production safety: refuse to boot with placeholder secrets.
assertProdPreflight();
// IMPORTANT: Windows and some shells set HOSTNAME to the machine name (e.g. "Janjaa").
// Using that as the bind address makes the server listen only on a single LAN IP,
// which breaks access via localhost/127.0.0.1.
//
// - `BIND_HOST` controls what address we bind the HTTP server to.
// - `PUBLIC_HOST` controls what host we print/use for Next.js hostname.
const bindHost = process.env.BIND_HOST ?? (dev ? "0.0.0.0" : "0.0.0.0");
const publicHost = process.env.PUBLIC_HOST ?? (dev ? "localhost" : bindHost);
const port = parseInt(process.env.PORT ?? "3000", 10);

const app = next({ dev, hostname: publicHost, port });
const handle = app.getRequestHandler();
// Next.js dev server uses WebSocket upgrades for HMR. If we attach our own
// `upgrade` handler we must forward unknown upgrades to Next, otherwise the
// sockets can leak/hang and dev can crash.
type UpgradeHandler = (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
let handleUpgrade: UpgradeHandler | undefined;

app
  .prepare()
  .then(() => {
  const maybe = app as unknown as { getUpgradeHandler?: () => UpgradeHandler };
  handleUpgrade = typeof maybe.getUpgradeHandler === "function" ? maybe.getUpgradeHandler() : undefined;
  const sql = createSql();

  const bytesToMb = (b: number) => Math.round((b / 1024 / 1024) * 10) / 10;
  const shouldLogMemory =
    String(process.env.LOG_MEMORY ?? process.env.MEM_LOG ?? "").trim() === "1" ||
    String(process.env.LOG_MEMORY ?? process.env.MEM_LOG ?? "").trim().toLowerCase() === "true";
  const memoryLogIntervalMs = Math.max(10_000, Number(process.env.MEM_LOG_INTERVAL_MS ?? 60_000) || 60_000);
  let memTimer: ReturnType<typeof setInterval> | null = null;

  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? "/", true);
    void handle(req, res, parsedUrl);
  });

  // ── WebSocket server (noServer mode — manual upgrade) ─────────
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url ?? "/", true);

    if (pathname !== "/ws") {
      // Not our upgrade — forward to Next.js (HMR etc) if available.
      if (handleUpgrade) {
        return handleUpgrade(req, socket, head);
      }
      socket.destroy();
      return;
    }

    const ip =
      (req.headers["x-real-ip"] as string) ??
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
      (socket as Duplex & { remoteAddress?: string }).remoteAddress ??
      "unknown";

    if (!acquireWs(ip)) {
      socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      wss.emit("connection", ws, req, ip);
    });
  });

  wss.on("connection", (ws: WebSocket, _req: unknown, ip: string) => {
    const cs: ClientState = {
      ws,
      ip,
      alive: true,
      marketSub: null,
    };

    addClient(cs);

    ws.on("pong", () => {
      cs.alive = true;
    });

    ws.on("message", (data: Buffer | string) => {
      try {
        handleMessage(cs, data.toString());
      } catch (e) {
        console.error("[ws] message handler error:", e);
      }
    });

    ws.on("close", () => {
      removeClient(cs);
      releaseWs(ip);
    });

    ws.on("error", () => {
      removeClient(cs);
      releaseWs(ip);
    });
  });

  // Start the shared market-data poll loop
  startPolling(sql);

  // Lightweight operational logging (opt-in) for diagnosing memory growth/OOM.
  if (shouldLogMemory) {
    memTimer = setInterval(() => {
      const m = process.memoryUsage();
      const wsClients = getClients().size;
      const ab = (m as unknown as { arrayBuffers?: number }).arrayBuffers ?? 0;
      console.log(
        `🧠 mem rss=${bytesToMb(m.rss)}MB heapUsed=${bytesToMb(m.heapUsed)}MB heapTotal=${bytesToMb(m.heapTotal)}MB ` +
          `ext=${bytesToMb(m.external)}MB ab=${bytesToMb(ab)}MB wsClients=${wsClients}`,
      );
    }, memoryLogIntervalMs);
    // Don't keep the process alive purely because of this timer.
    (memTimer as unknown as { unref?: () => void }).unref?.();
  }

  server.listen(port, bindHost, () => {
    console.log(`  ▲ TradeSynapse ready on http://${publicHost}:${port}`);
    console.log(`  ⚡ WebSocket endpoint: ws://${publicHost}:${port}/ws`);
    if (bindHost === "0.0.0.0") {
      console.log("  ↳ Also reachable via http://127.0.0.1:" + port);
    }
  });

  // ── Graceful shutdown ────────────────────────────────────────────
  const shutdown = () => {
    console.log("\n  Shutting down...");
    stopPolling();

    if (memTimer) {
      clearInterval(memTimer);
      memTimer = null;
    }

    wss.clients.forEach((ws: WebSocket) => ws.close());
    wss.close();

    server.close(() => {
      sql.end().then(() => process.exit(0));
    });

    // Force exit after 5s
    setTimeout(() => process.exit(1), 5000);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  })
  .catch((err) => {
    console.error("[server] Failed to start:", err);
    process.exit(1);
  });
