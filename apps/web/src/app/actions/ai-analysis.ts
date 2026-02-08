"use server";

import { getMarketSentiment } from "@/lib/ai/client";

export async function analyzeTokenAction(symbol: string) {
  if (!symbol) return "Please provide a symbol.";
  // Append USDT if not present
  const pair = symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  return await getMarketSentiment(pair);
}
