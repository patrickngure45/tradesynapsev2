export type Market = {
  id: string;
  chain: string;
  symbol: string;
  base_asset_id: string;
  quote_asset_id: string;
  status: string;
  tick_size: string;
  lot_size: string;
  maker_fee_bps: number;
  taker_fee_bps: number;
};

export type TopLevel = { price: string; quantity: string; order_count: number };

export type DepthLevel = { price: string; quantity: string; order_count: number };

export type Trade = {
  id: string;
  price: string;
  quantity: string;
  maker_order_id: string;
  taker_order_id: string;
  created_at: string;
};

export type Candle = {
  ts: string; // UTC minute bucket, e.g. 2026-02-05T12:34:00Z
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  trade_count: number;
};

export type BalanceRow = {
  asset_id: string;
  chain: string;
  symbol: string;
  decimals: number;
  posted: string;
  held: string;
  available: string;
};

export type HoldRow = {
  id: string;
  asset_id: string;
  chain: string;
  symbol: string;
  amount: string;
  remaining_amount: string;
  reason: string;
  status: "active" | "released" | "consumed";
  created_at: string;
  released_at: string | null;
};

export type MarketStats = {
  open: string;
  last: string;
  high: string;
  low: string;
  volume: string;
  quote_volume?: string;
  vwap?: string;
  trade_count: number;
};

export type TicketRequirement = {
  baseSym: string;
  quoteSym: string;
  requiredAsset: string;
  requiredAmount: string;
  notional: string | null;
  fee: string | null;
  total: string | null;
};

export type TicketQuoteBreakdown = {
  baseSym: string;
  quoteSym: string;
  gross: string;
  feeExpected: string;
  totalExpected: string;
  feeBpsExpected: number | null;
  liquidityHint: "maker" | "taker" | null;
  canInferLiquidity: boolean;
  expectedThresholdText: string | null;
  feeMax: string;
  totalMax: string;
  feeBpsMax: number;
  effFeePctExpected: string | null;
  effFeePctMax: string | null;
  effPriceExpected: string | null;
  effPriceMax: string | null;
  markStr: string | null;
  vsMarkExpected: { text: string; className: string } | null;
  vsMarkMax: { text: string; className: string } | null;
};

export type Order = {
  id: string;
  market_id: string;
  side: "buy" | "sell";
  type: "limit" | "market";
  price: string;
  quantity: string;
  remaining_quantity: string;
  status: string;
  created_at: string;
};
