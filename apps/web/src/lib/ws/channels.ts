/**
 * WebSocket channel manager — server-side logic.
 *
 * Manages market-data subscriptions, DB polling, change detection,
 * and per-client broadcasting.  Mirrors the SSE stream route logic
 * but over WebSocket for bidirectional, multi-channel support.
 */

import type { WebSocket } from "ws";
import type postgres from "postgres";
import type {
  ClientMessage,
  ServerMessage,
  WsTopLevel,
  WsDepthLevel,
  WsTrade,
} from "./protocol";

// ── Connection bookkeeping ────────────────────────────────────────

const MAX_GLOBAL = 2000;
const MAX_PER_IP = 20;
const ipCounts = new Map<string, number>();
let totalCount = 0;

export function acquireWs(ip: string): boolean {
  if (totalCount >= MAX_GLOBAL) return false;
  const cur = ipCounts.get(ip) ?? 0;
  if (cur >= MAX_PER_IP) return false;
  ipCounts.set(ip, cur + 1);
  totalCount++;
  return true;
}

export function releaseWs(ip: string) {
  const cur = ipCounts.get(ip) ?? 0;
  if (cur <= 1) ipCounts.delete(ip);
  else ipCounts.set(ip, cur - 1);
  totalCount = Math.max(0, totalCount - 1);
}

// ── Per-client state ──────────────────────────────────────────────

export type ClientState = {
  ws: WebSocket;
  ip: string;
  alive: boolean;
  /** The market this client is subscribed to (at most one). */
  marketSub: {
    market_id: string;
    levels: number;
    poll_ms: number;
    trades_limit: number;
  } | null;
};

const clients = new Set<ClientState>();

export function getClients(): ReadonlySet<ClientState> {
  return clients;
}

export function addClient(cs: ClientState) {
  clients.add(cs);
}

export function removeClient(cs: ClientState) {
  clients.delete(cs);
}

// ── Market-data poller ────────────────────────────────────────────

type MarketPollState = {
  market_id: string;
  lastTopKey: string;
  lastDepthKey: string;
  tradesCursorCreatedAt: string | null;
  tradesCursorId: string | null;
};

const marketPollStates = new Map<string, MarketPollState>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcast(marketId: string, msg: ServerMessage) {
  for (const cs of clients) {
    if (cs.marketSub?.market_id === marketId) {
      send(cs.ws, msg);
    }
  }
}

/**
 * Returns the set of unique market IDs that at least one client is
 * subscribed to, along with the most-generous parameters.
 */
function activeMarkets(): Map<string, { levels: number; trades_limit: number }> {
  const result = new Map<string, { levels: number; trades_limit: number }>();
  for (const cs of clients) {
    if (!cs.marketSub) continue;
    const { market_id, levels, trades_limit } = cs.marketSub;
    const existing = result.get(market_id);
    if (existing) {
      existing.levels = Math.max(existing.levels, levels);
      existing.trades_limit = Math.max(existing.trades_limit, trades_limit);
    } else {
      result.set(market_id, { levels, trades_limit });
    }
  }
  return result;
}

/**
 * The minimum poll_ms across all subscriptions for a given market.
 */
function minPollMsForMarket(marketId: string): number {
  let min = 5000;
  for (const cs of clients) {
    if (cs.marketSub?.market_id === marketId) {
      min = Math.min(min, cs.marketSub.poll_ms);
    }
  }
  return min;
}

async function pollMarkets(sql: ReturnType<typeof postgres>) {
  const markets = activeMarkets();
  if (markets.size === 0) return;

  const now = Date.now();

  for (const [marketId, params] of markets) {
    let ps = marketPollStates.get(marketId);
    if (!ps) {
      ps = {
        market_id: marketId,
        lastTopKey: "",
        lastDepthKey: "",
        tradesCursorCreatedAt: null,
        tradesCursorId: null,
      };
      marketPollStates.set(marketId, ps);
    }

    try {
      // ── top ──
      const bidRows = await sql<WsTopLevel[]>`
        SELECT
          price::text AS price,
          sum(remaining_quantity)::text AS quantity,
          count(*)::int AS order_count
        FROM ex_order
        WHERE market_id = ${marketId}::uuid
          AND side = 'buy'
          AND status IN ('open','partially_filled')
          AND remaining_quantity > 0
        GROUP BY price
        ORDER BY price DESC
        LIMIT 1
      `;

      const askRows = await sql<WsTopLevel[]>`
        SELECT
          price::text AS price,
          sum(remaining_quantity)::text AS quantity,
          count(*)::int AS order_count
        FROM ex_order
        WHERE market_id = ${marketId}::uuid
          AND side = 'sell'
          AND status IN ('open','partially_filled')
          AND remaining_quantity > 0
        GROUP BY price
        ORDER BY price ASC
        LIMIT 1
      `;

      const topBid: WsTopLevel | null = bidRows[0] ?? null;
      const topAsk: WsTopLevel | null = askRows[0] ?? null;
      const topKey = `${topBid?.price ?? ""}|${topBid?.quantity ?? ""}|${topAsk?.price ?? ""}|${topAsk?.quantity ?? ""}`;

      if (topKey !== ps.lastTopKey) {
        ps.lastTopKey = topKey;
        broadcast(marketId, {
          type: "top",
          market_id: marketId,
          bid: topBid,
          ask: topAsk,
          ts: new Date().toISOString(),
        });
      }

      // ── depth ──
      const bids = await sql<WsDepthLevel[]>`
        SELECT
          price::text AS price,
          sum(remaining_quantity)::text AS quantity,
          count(*)::int AS order_count
        FROM ex_order
        WHERE market_id = ${marketId}::uuid
          AND side = 'buy'
          AND status IN ('open','partially_filled')
          AND remaining_quantity > 0
        GROUP BY price
        ORDER BY price DESC
        LIMIT ${params.levels}
      `;

      const asks = await sql<WsDepthLevel[]>`
        SELECT
          price::text AS price,
          sum(remaining_quantity)::text AS quantity,
          count(*)::int AS order_count
        FROM ex_order
        WHERE market_id = ${marketId}::uuid
          AND side = 'sell'
          AND status IN ('open','partially_filled')
          AND remaining_quantity > 0
        GROUP BY price
        ORDER BY price ASC
        LIMIT ${params.levels}
      `;

      const depthKey = `${bids.map((b) => `${b.price}:${b.quantity}`).join(",")}|${asks
        .map((a) => `${a.price}:${a.quantity}`)
        .join(",")}`;

      if (depthKey !== ps.lastDepthKey) {
        ps.lastDepthKey = depthKey;
        broadcast(marketId, {
          type: "depth",
          market_id: marketId,
          bids,
          asks,
          levels: params.levels,
          ts: new Date().toISOString(),
        });
      }

      // ── trades ──
      if (!ps.tradesCursorCreatedAt || !ps.tradesCursorId) {
        // First poll → snapshot
        const trades = await sql<WsTrade[]>`
          SELECT
            id,
            price::text AS price,
            quantity::text AS quantity,
            maker_order_id,
            taker_order_id,
            created_at
          FROM ex_execution
          WHERE market_id = ${marketId}::uuid
          ORDER BY created_at DESC, id DESC
          LIMIT ${params.trades_limit}
        `;

        const newest = trades[0] ?? null;
        if (newest) {
          ps.tradesCursorCreatedAt = newest.created_at;
          ps.tradesCursorId = newest.id;
        }

        broadcast(marketId, {
          type: "trades",
          market_id: marketId,
          trades,
          mode: "snapshot",
          ts: new Date().toISOString(),
        });
      } else {
        // Subsequent polls → delta
        const newTradesAsc = await sql<WsTrade[]>`
          SELECT
            id,
            price::text AS price,
            quantity::text AS quantity,
            maker_order_id,
            taker_order_id,
            created_at
          FROM ex_execution
          WHERE market_id = ${marketId}::uuid
            AND (created_at, id) > (${ps.tradesCursorCreatedAt}::timestamptz, ${ps.tradesCursorId}::uuid)
          ORDER BY created_at ASC, id ASC
          LIMIT 200
        `;

        if (newTradesAsc.length > 0) {
          const newest = newTradesAsc[newTradesAsc.length - 1]!;
          ps.tradesCursorCreatedAt = newest.created_at;
          ps.tradesCursorId = newest.id;

          broadcast(marketId, {
            type: "trades",
            market_id: marketId,
            trades: [...newTradesAsc].reverse(),
            mode: "delta",
            ts: new Date().toISOString(),
          });
        }
      }
    } catch (e) {
      console.error(`[ws] poll error for market ${marketId}:`, (e as Error)?.message ?? e);
    }
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────

let sqlInstance: ReturnType<typeof postgres> | null = null;

/**
 * Start the shared market-data poll loop.
 * Call once at server startup, passing the postgres instance.
 */
export function startPolling(sql: ReturnType<typeof postgres>) {
  sqlInstance = sql;

  if (pollTimer) return; // already running

  // Poll at the fastest requested cadence (re-evaluated each tick)
  pollTimer = setInterval(() => {
    void pollMarkets(sql);
  }, 500); // base tick — actual per-market cadence is limited by change detection

  heartbeatTimer = setInterval(() => {
    for (const cs of clients) {
      if (!cs.alive) {
        cs.ws.terminate();
        continue;
      }
      cs.alive = false;
      cs.ws.ping();
    }
  }, 30_000);
}

export function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

// ── Message handler ───────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function handleMessage(cs: ClientState, raw: string) {
  let msg: ClientMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    send(cs.ws, { type: "error", message: "invalid JSON" });
    return;
  }

  switch (msg.type) {
    case "ping":
      send(cs.ws, { type: "pong" });
      break;

    case "subscribe": {
      if (msg.channel !== "market") {
        send(cs.ws, { type: "error", message: `unknown channel: ${(msg as { channel?: string }).channel}` });
        return;
      }

      if (!msg.market_id || !UUID_RE.test(msg.market_id)) {
        send(cs.ws, { type: "error", message: "invalid market_id", code: "invalid_market_id" });
        return;
      }

      const levels = Math.max(1, Math.min(50, msg.levels ?? 10));
      const poll_ms = Math.max(250, Math.min(5000, msg.poll_ms ?? 1000));
      const trades_limit = Math.max(1, Math.min(200, msg.trades_limit ?? 25));

      cs.marketSub = {
        market_id: msg.market_id,
        levels,
        poll_ms,
        trades_limit,
      };

      // Reset per-market poll state so this client gets a fresh snapshot
      // (only if it's the only subscriber — otherwise let the existing cursor continue)
      const existingPollState = marketPollStates.get(msg.market_id);
      if (!existingPollState) {
        marketPollStates.set(msg.market_id, {
          market_id: msg.market_id,
          lastTopKey: "",
          lastDepthKey: "",
          tradesCursorCreatedAt: null,
          tradesCursorId: null,
        });
      }

      send(cs.ws, { type: "subscribed", channel: "market", market_id: msg.market_id });

      // Trigger an immediate poll for this market
      if (sqlInstance) void pollMarkets(sqlInstance);
      break;
    }

    case "unsubscribe": {
      if (msg.channel !== "market") return;
      const prevMarketId = cs.marketSub?.market_id ?? null;
      cs.marketSub = null;

      if (prevMarketId) {
        send(cs.ws, { type: "unsubscribed", channel: "market", market_id: prevMarketId });

        // Garbage-collect poll state if no one else is subscribed
        let hasOtherSub = false;
        for (const other of clients) {
          if (other !== cs && other.marketSub?.market_id === prevMarketId) {
            hasOtherSub = true;
            break;
          }
        }
        if (!hasOtherSub) {
          marketPollStates.delete(prevMarketId);
        }
      }
      break;
    }

    default:
      send(cs.ws, { type: "error", message: `unknown message type: ${(msg as { type?: string }).type}` });
  }
}
