import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { isTransientDbError, responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

// ── SSE connection limiter (per-IP + global cap) ──────────────────────
const MAX_CONNECTIONS_GLOBAL = 500;
const MAX_CONNECTIONS_PER_IP = 10;
const activeConnections = new Map<string, number>();
let totalConnections = 0;

function acquireConnection(ip: string): boolean {
  if (totalConnections >= MAX_CONNECTIONS_GLOBAL) return false;
  const current = activeConnections.get(ip) ?? 0;
  if (current >= MAX_CONNECTIONS_PER_IP) return false;
  activeConnections.set(ip, current + 1);
  totalConnections++;
  return true;
}

function releaseConnection(ip: string): void {
  const current = activeConnections.get(ip) ?? 0;
  if (current <= 1) {
    activeConnections.delete(ip);
  } else {
    activeConnections.set(ip, current - 1);
  }
  totalConnections = Math.max(0, totalConnections - 1);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  market_id: z.string().uuid(),
  topics: z
    .string()
    .optional()
    .default("top,depth,trades")
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  levels: z.coerce.number().int().min(1).max(50).optional().default(10),
  trades_limit: z.coerce.number().int().min(1).max(200).optional().default(25),
  trades_delta: z
    .union([z.literal("0"), z.literal("1")])
    .optional()
    .default("1")
    .transform((v) => v === "1"),
  poll_ms: z.coerce.number().int().min(250).max(5000).optional().default(1000),
  heartbeat_ms: z.coerce.number().int().min(5000).max(60000).optional().default(15000),
});

type TopLevel = { price: string; quantity: string; order_count: number };
type DepthLevel = { price: string; quantity: string; order_count: number };
type Trade = {
  id: string;
  price: string;
  quantity: string;
  maker_order_id: string;
  taker_order_id: string;
  created_at: string;
};

function sseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function sseComment(text: string) {
  return `: ${text}\n\n`;
}

function sseRetry(ms: number) {
  return `retry: ${ms}\n\n`;
}

export async function GET(request: Request) {
  const sql = getSql();
  const url = new URL(request.url);

  let q: z.infer<typeof querySchema>;
  try {
    q = querySchema.parse({
      market_id: url.searchParams.get("market_id"),
      topics: url.searchParams.get("topics") ?? undefined,
      levels: url.searchParams.get("levels") ?? undefined,
      trades_limit: url.searchParams.get("trades_limit") ?? undefined,
      trades_delta: url.searchParams.get("trades_delta") ?? undefined,
      poll_ms: url.searchParams.get("poll_ms") ?? undefined,
      heartbeat_ms: url.searchParams.get("heartbeat_ms") ?? undefined,
    });
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const topics = new Set(q.topics);

  // ── Connection limiting (per-IP + global) ──
  const clientIp =
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  if (!acquireConnection(clientIp)) {
    return Response.json(
      { error: "rate_limit_exceeded", message: "Too many concurrent SSE connections" },
      { status: 429, headers: { "Retry-After": "5" } },
    );
  }

  let market: { id: string; chain: string; symbol: string; status: string } | null = null;
  try {
    const data = await retryOnceOnTransientDbError(async () => {
      const markets = await sql<{ id: string; chain: string; symbol: string; status: string }[]>`
        SELECT id, chain, symbol, status
        FROM ex_market
        WHERE id = ${q.market_id}::uuid
        LIMIT 1
      `;
      return { market: markets[0] ?? null };
    });
    market = data.market;
  } catch (e) {
    releaseConnection(clientIp);
    return responseForDbError("exchange.marketdata.stream.connect", e) ?? apiError("upstream_unavailable");
  }

  if (!market) {
    releaseConnection(clientIp);
    return apiError("market_not_found");
  }

  const encoder = new TextEncoder();

  let lastTopKey = "";
  let lastDepthKey = "";
  let lastTradesKey = "";

  let stopFn: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let stopped = false;
      let pollTimer: ReturnType<typeof setInterval> | null = null;
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

      let tradesCursorCreatedAt: string | null = null;
      let tradesCursorId: string | null = null;

      const enqueue = (text: string) => {
        if (stopped) return;
        controller.enqueue(encoder.encode(text));
      };

      const stop = () => {
        if (stopped) return;
        stopped = true;
        releaseConnection(clientIp);
        if (pollTimer) clearInterval(pollTimer);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        try {
          controller.close();
        } catch {
          // ignore
        }
      };

      stopFn = stop;

      const pollOnce = async () => {
        try {
          await retryOnceOnTransientDbError(async () => {
            if (topics.has("top")) {
              const bidRows = await sql<TopLevel[]>`
                SELECT
                  price::text AS price,
                  sum(remaining_quantity)::text AS quantity,
                  count(*)::int AS order_count
                FROM ex_order
                WHERE market_id = ${q.market_id}::uuid
                  AND side = 'buy'
                  AND status IN ('open','partially_filled')
                  AND remaining_quantity > 0
                GROUP BY price
                ORDER BY price DESC
                LIMIT 1
              `;

              const askRows = await sql<TopLevel[]>`
                SELECT
                  price::text AS price,
                  sum(remaining_quantity)::text AS quantity,
                  count(*)::int AS order_count
                FROM ex_order
                WHERE market_id = ${q.market_id}::uuid
                  AND side = 'sell'
                  AND status IN ('open','partially_filled')
                  AND remaining_quantity > 0
                GROUP BY price
                ORDER BY price ASC
                LIMIT 1
              `;

              const topBid: TopLevel | null = bidRows[0] ?? null;
              const topAsk: TopLevel | null = askRows[0] ?? null;
              const topKey = `${topBid?.price ?? ""}|${topBid?.quantity ?? ""}|${topAsk?.price ?? ""}|${topAsk?.quantity ?? ""}`;
              if (topKey !== lastTopKey) {
                lastTopKey = topKey;
                enqueue(
                  sseEvent("top", {
                    top: { bid: topBid, ask: topAsk },
                    ts: new Date().toISOString(),
                  })
                );
              }
            }

            if (topics.has("depth")) {
              const bids = await sql<DepthLevel[]>`
                SELECT
                  price::text AS price,
                  sum(remaining_quantity)::text AS quantity,
                  count(*)::int AS order_count
                FROM ex_order
                WHERE market_id = ${q.market_id}::uuid
                  AND side = 'buy'
                  AND status IN ('open','partially_filled')
                  AND remaining_quantity > 0
                GROUP BY price
                ORDER BY price DESC
                LIMIT ${q.levels}
              `;

              const asks = await sql<DepthLevel[]>`
                SELECT
                  price::text AS price,
                  sum(remaining_quantity)::text AS quantity,
                  count(*)::int AS order_count
                FROM ex_order
                WHERE market_id = ${q.market_id}::uuid
                  AND side = 'sell'
                  AND status IN ('open','partially_filled')
                  AND remaining_quantity > 0
                GROUP BY price
                ORDER BY price ASC
                LIMIT ${q.levels}
              `;

              const depthKey = `${bids.map((b) => `${b.price}:${b.quantity}`).join(",")}|${asks
                .map((a) => `${a.price}:${a.quantity}`)
                .join(",")}`;
              if (depthKey !== lastDepthKey) {
                lastDepthKey = depthKey;
                enqueue(
                  sseEvent("depth", {
                    depth: { bids, asks },
                    levels: q.levels,
                    ts: new Date().toISOString(),
                  })
                );
              }
            }

            if (topics.has("trades")) {
              // First poll acts as a snapshot hydrator.
              if (!tradesCursorCreatedAt || !tradesCursorId) {
                const trades = await sql<Trade[]>`
                  SELECT
                    id,
                    price::text AS price,
                    quantity::text AS quantity,
                    maker_order_id,
                    taker_order_id,
                    created_at
                  FROM ex_execution
                  WHERE market_id = ${q.market_id}::uuid
                  ORDER BY created_at DESC, id DESC
                  LIMIT ${q.trades_limit}
                `;

                const newest = trades[0] ?? null;
                if (newest) {
                  tradesCursorCreatedAt = newest.created_at;
                  tradesCursorId = newest.id;
                }

                const tradesKey = trades.map((t) => t.id).join(",");
                if (tradesKey !== lastTradesKey) {
                  lastTradesKey = tradesKey;
                  enqueue(
                    sseEvent("trades", {
                      trades,
                      mode: "snapshot" as const,
                      ts: new Date().toISOString(),
                    })
                  );
                }

                return;
              }

              if (!q.trades_delta) {
                const trades = await sql<Trade[]>`
                  SELECT
                    id,
                    price::text AS price,
                    quantity::text AS quantity,
                    maker_order_id,
                    taker_order_id,
                    created_at
                  FROM ex_execution
                  WHERE market_id = ${q.market_id}::uuid
                  ORDER BY created_at DESC, id DESC
                  LIMIT ${q.trades_limit}
                `;

                const newest = trades[0] ?? null;
                if (newest) {
                  tradesCursorCreatedAt = newest.created_at;
                  tradesCursorId = newest.id;
                }

                const tradesKey = trades.map((t) => t.id).join(",");
                if (tradesKey !== lastTradesKey) {
                  lastTradesKey = tradesKey;
                  enqueue(
                    sseEvent("trades", {
                      trades,
                      mode: "snapshot" as const,
                      ts: new Date().toISOString(),
                    })
                  );
                }

                return;
              }

              const newTradesAsc = await sql<Trade[]>`
                SELECT
                  id,
                  price::text AS price,
                  quantity::text AS quantity,
                  maker_order_id,
                  taker_order_id,
                  created_at
                FROM ex_execution
                WHERE market_id = ${q.market_id}::uuid
                  AND (created_at, id) > (${tradesCursorCreatedAt}::timestamptz, ${tradesCursorId}::uuid)
                ORDER BY created_at ASC, id ASC
                LIMIT 200
              `;

              if (newTradesAsc.length > 0) {
                const newest = newTradesAsc[newTradesAsc.length - 1];
                tradesCursorCreatedAt = newest.created_at;
                tradesCursorId = newest.id;

                const newTradesDesc = [...newTradesAsc].reverse();
                enqueue(
                  sseEvent("trades", {
                    trades: newTradesDesc,
                    mode: "delta" as const,
                    ts: new Date().toISOString(),
                  })
                );
              }
            }
          });
        } catch (e) {
          if (isTransientDbError(e)) {
            enqueue(sseRetry(3000));
            enqueue(sseComment(`db_unavailable ${(e as Error)?.message ?? String(e)}`));
            stop();
            return;
          }

          enqueue(sseComment(`poll_error ${(e as Error)?.message ?? String(e)}`));
        }
      };

      pollTimer = setInterval(() => {
        void pollOnce();
      }, q.poll_ms);

      heartbeatTimer = setInterval(() => {
        enqueue(sseComment(`ping ${Date.now()}`));
      }, q.heartbeat_ms);

      request.signal.addEventListener("abort", () => stop());

      enqueue(sseRetry(2000));
      enqueue(sseComment("connected"));
      enqueue(sseEvent("market", { market, ts: new Date().toISOString() }));
      void pollOnce();
    },
    cancel() {
      // Some runtimes may call cancel() without triggering request.signal abort.
      // stop() handles releaseConnection; if stop was never called, release here.
      stopFn?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
