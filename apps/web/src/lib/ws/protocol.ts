/**
 * WebSocket protocol types — shared between server and client.
 *
 * All messages are JSON-encoded.  The `type` field discriminates
 * them on both sides.
 */

// ── Shared data shapes (mirrors types.ts) ─────────────────────────

export type WsTopLevel = { price: string; quantity: string; order_count: number };

export type WsDepthLevel = { price: string; quantity: string; order_count: number };

export type WsTrade = {
  id: string;
  price: string;
  quantity: string;
  maker_order_id: string;
  taker_order_id: string;
  created_at: string;
};

// ── Client → Server messages ──────────────────────────────────────

export type ClientSubscribeMarket = {
  type: "subscribe";
  channel: "market";
  market_id: string;
  levels?: number;       // 1–50, default 10
  poll_ms?: number;      // 250–5000, default 1000
  trades_limit?: number; // 1–200, default 25
};

export type ClientUnsubscribeMarket = {
  type: "unsubscribe";
  channel: "market";
  market_id: string;
};

export type ClientPing = { type: "ping" };

export type ClientMessage =
  | ClientSubscribeMarket
  | ClientUnsubscribeMarket
  | ClientPing;

// ── Server → Client messages ──────────────────────────────────────

export type ServerTop = {
  type: "top";
  market_id: string;
  bid: WsTopLevel | null;
  ask: WsTopLevel | null;
  ts: string;
};

export type ServerDepth = {
  type: "depth";
  market_id: string;
  bids: WsDepthLevel[];
  asks: WsDepthLevel[];
  levels: number;
  ts: string;
};

export type ServerTrades = {
  type: "trades";
  market_id: string;
  trades: WsTrade[];
  mode: "snapshot" | "delta";
  ts: string;
};

export type ServerSubscribed = {
  type: "subscribed";
  channel: "market";
  market_id: string;
};

export type ServerUnsubscribed = {
  type: "unsubscribed";
  channel: "market";
  market_id: string;
};

export type ServerPong = { type: "pong" };

export type ServerError = {
  type: "error";
  message: string;
  code?: string;
};

export type ServerMessage =
  | ServerTop
  | ServerDepth
  | ServerTrades
  | ServerSubscribed
  | ServerUnsubscribed
  | ServerPong
  | ServerError;
