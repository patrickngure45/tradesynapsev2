// Shared exchange market-data types.
// Kept in lib (not under src/app) so core utilities don't depend on removed UI routes.

export type TopLevel = {
  price: string;
  quantity: string;
};

export type MarketStats = {
  market_id: string;
  base_symbol: string;
  quote_symbol: string;

  last: string;
  open: string;
  high: string;
  low: string;

  vwap: string | null;
  volume_base: string;
  volume_quote: string;

  updated_at: string;
};

export type Trade = {
  id: string;
  created_at: string;
  price: string;
  quantity: string;
};

export type Candle = {
  ts: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  trade_count: number;
};
