"use client";

/**
 * useExchangeStream — WebSocket client hook for live market data.
 *
 * Connects to the exchange WS server, subscribes to a market channel,
 * and dispatches typed callbacks on incoming top/depth/trades events.
 *
 * Features:
 *   • Exponential backoff reconnection (2s base, 30s cap, ±20% jitter)
 *   • Connection status tracking
 *   • Automatic re-subscribe on market/param changes
 *   • Ping/pong keep-alive
 *   • SSE fallback URL support for gradual migration
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ServerMessage,
  WsTopLevel,
  WsDepthLevel,
  WsTrade,
} from "@/lib/ws/protocol";

// ── Types ──────────────────────────────────────────────────────────

export type StreamStatus = "disconnected" | "connecting" | "connected" | "error";

export type UseExchangeStreamOptions = {
  /** Enable/disable the connection. */
  enabled?: boolean;
  /** Order book depth levels (1–50). */
  levels?: number;
  /** Server-side poll cadence in ms (250–5000). */
  pollMs?: number;
  /** Max trades in initial snapshot (1–200). */
  tradesLimit?: number;
  /** Called when best bid/ask updates. */
  onTop?: (bid: WsTopLevel | null, ask: WsTopLevel | null) => void;
  /** Called when order book depth updates. */
  onDepth?: (bids: WsDepthLevel[], asks: WsDepthLevel[]) => void;
  /** Called when trades update (delta or snapshot). */
  onTrades?: (trades: WsTrade[], mode: "snapshot" | "delta") => void;
};

export type UseExchangeStreamReturn = {
  status: StreamStatus;
  attempt: number;
  nextRetryAtMs: number | null;
  lastUpdateAtMs: number | null;
  reconnectNow: () => void;
};

// ── Hook ───────────────────────────────────────────────────────────

export function useExchangeStream(
  marketId: string | null,
  options: UseExchangeStreamOptions = {},
): UseExchangeStreamReturn {
  const {
    enabled = true,
    levels = 10,
    pollMs = 1000,
    tradesLimit = 25,
    onTop,
    onDepth,
    onTrades,
  } = options;

  // Store callbacks in refs to avoid reconnecting when they change
  const onTopRef = useRef(onTop);
  const onDepthRef = useRef(onDepth);
  const onTradesRef = useRef(onTrades);
  useEffect(() => { onTopRef.current = onTop; }, [onTop]);
  useEffect(() => { onDepthRef.current = onDepth; }, [onDepth]);
  useEffect(() => { onTradesRef.current = onTrades; }, [onTrades]);

  const [status, setStatus] = useState<StreamStatus>("disconnected");
  const [attempt, setAttempt] = useState(0);
  const [nextRetryAtMs, setNextRetryAtMs] = useState<number | null>(null);
  const [lastUpdateAtMs, setLastUpdateAtMs] = useState<number | null>(null);

  // Mutable refs for reconnection logic
  const attemptRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [epoch, setEpoch] = useState(0);

  const reconnectNow = useCallback(() => {
    if (!enabled) return;
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    setNextRetryAtMs(null);
    setEpoch((v) => v + 1);
  }, [enabled]);

  useEffect(() => {
    if (!marketId || !enabled) {
      setStatus("disconnected");
      return;
    }

    setStatus("connecting");

    // Cancel any pending retry
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    setNextRetryAtMs(null);

    // Build WS URL — same host, /ws path
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      setStatus("error");
      return;
    }

    let closed = false;

    const resetBackoff = () => {
      attemptRef.current = 0;
      setAttempt(0);
      setNextRetryAtMs(null);
    };

    const scheduleReconnect = () => {
      if (!enabled || !marketId || retryTimerRef.current) return;

      const att = attemptRef.current + 1;
      attemptRef.current = att;
      setAttempt(att);
      setStatus("error");

      const base = 2000;
      const max = 30_000;
      const exp = Math.min(max, base * Math.pow(2, Math.max(0, att - 1)));
      const jitter = exp * (0.2 * (Math.random() - 0.5) * 2);
      const delay = Math.max(750, Math.floor(exp + jitter));

      setNextRetryAtMs(Date.now() + delay);

      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        setEpoch((v) => v + 1);
      }, delay);
    };

    ws.onopen = () => {
      setStatus("connected");
      resetBackoff();

      // Subscribe to the market channel
      ws.send(JSON.stringify({
        type: "subscribe",
        channel: "market",
        market_id: marketId,
        levels,
        poll_ms: pollMs,
        trades_limit: tradesLimit,
      }));
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string) as ServerMessage;

        switch (msg.type) {
          case "top":
            onTopRef.current?.(msg.bid, msg.ask);
            setLastUpdateAtMs(Date.now());
            break;

          case "depth":
            onDepthRef.current?.(msg.bids, msg.asks);
            setLastUpdateAtMs(Date.now());
            break;

          case "trades":
            onTradesRef.current?.(msg.trades, msg.mode);
            setLastUpdateAtMs(Date.now());
            break;

          case "pong":
          case "subscribed":
          case "unsubscribed":
            // informational, no action needed
            break;

          case "error":
            console.warn("[ws] server error:", msg.message);
            break;
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      if (!closed) scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };

    // Ping keep-alive every 25s
    const pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 25_000);

    return () => {
      closed = true;
      clearInterval(pingTimer);
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      ws.close();
      setStatus("disconnected");
    };
  }, [marketId, enabled, levels, pollMs, tradesLimit, epoch]);

  // Reset state on market change
  useEffect(() => {
    attemptRef.current = 0;
    setAttempt(0);
    setNextRetryAtMs(null);
    setLastUpdateAtMs(null);
  }, [marketId]);

  return { status, attempt, nextRetryAtMs, lastUpdateAtMs, reconnectNow };
}
