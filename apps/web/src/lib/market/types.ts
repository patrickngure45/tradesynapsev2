export type ExchangeId = "binance" | "bybit";

export type MarketSnapshot = {
  exchange: ExchangeId;
  symbol: string;
  ts: Date;
  last: string | null;
  bid: string | null;
  ask: string | null;
  raw: unknown;
};
