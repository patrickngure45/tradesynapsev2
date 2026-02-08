import { unstable_cache } from 'next/cache';
import ccxt from 'ccxt';

// Initialize a public Binance instance (no keys needed for fetching public ticker data)
const binance = new ccxt.binance({
  enableRateLimit: true,
});

export interface MarketTicker {
  symbol: string;
  price: number;
  change24h: number; // Percentage
  volume: number;
}

async function fetchTickersInternal(): Promise<MarketTicker[]> {
  try {
    // focused list of pairs we care about
    const symbols = ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT'];
    const tickers = await binance.fetchTickers(symbols);
    
    return symbols.map(s => {
      const t = tickers[s];
      return {
        symbol: s,
        price: t?.last || 0,
        change24h: t?.percentage || 0,
        volume: t?.quoteVolume || 0
      };
    });
  } catch (error) {
    console.error("Failed to fetch tickers:", error);
    return [];
  }
}

// Cache the specific result for 15 seconds to avoid rate limits
// and improve page load speeds for concurrent users
export const getTopTickers = unstable_cache(
  fetchTickersInternal,
  ['market-tickers-binance'],
  { revalidate: 15 } 
);
