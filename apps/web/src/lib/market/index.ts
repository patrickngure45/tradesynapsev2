import type { ExchangeId, MarketSnapshot } from "./types";
import { fetchBinanceBookTicker } from "./binance";
import { fetchBybitSpotTicker } from "./bybit";

export async function fetchMarketSnapshot(
  exchange: ExchangeId,
  symbol: string
): Promise<MarketSnapshot> {
  switch (exchange) {
    case "binance":
      return fetchBinanceBookTicker(symbol);
    case "bybit":
      return fetchBybitSpotTicker(symbol);
    default: {
      const exhaustiveCheck: never = exchange;
      throw new Error(`unsupported_exchange: ${exhaustiveCheck}`);
    }
  }
}
