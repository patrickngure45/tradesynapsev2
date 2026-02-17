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
  type ClientState,
} from "./src/lib/ws/channels";

const dev = process.env.NODE_ENV !== "production";
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
let handleUpgrade: undefined | ((req: any, socket: any, head: any) => void);

app
  .prepare()
  .then(() => {
  handleUpgrade = (app as any).getUpgradeHandler ? (app as any).getUpgradeHandler() : undefined;
  const sql = createSql();

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
