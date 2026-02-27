import { z } from "zod";

import { fetchMarketSnapshot } from "@/lib/market";
import type { ExchangeId } from "@/lib/market/types";
import { syntheticMarketSnapshot } from "@/lib/market/synthetic";
import { computeDeviationPct, computePriceBand } from "@/lib/market/band";
import { apiError, apiUpstreamUnavailable, apiZodError } from "@/lib/api/errors";

const querySchema = z.object({
  exchange: z.enum(["binance", "bybit"]),
  symbol: z.string().min(3).max(30),
  quote_price: z.string().optional(),
  pct: z.coerce.number().gt(0).lt(0.5).optional().default(0.01),
});

export async function GET(request: Request) {
  const url = new URL(request.url);

  let parsed: z.infer<typeof querySchema>;
  try {
    parsed = querySchema.parse({
      exchange: url.searchParams.get("exchange"),
      symbol: url.searchParams.get("symbol"),
      quote_price: url.searchParams.get("quote_price") ?? undefined,
      pct: url.searchParams.get("pct") ?? undefined,
    });
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const snapshot = await fetchMarketSnapshot(
    parsed.exchange as ExchangeId,
    parsed.symbol
  ).catch((err) => {
    if (process.env.NODE_ENV === "production") {
      return null;
    }
    return syntheticMarketSnapshot(parsed.exchange as ExchangeId, parsed.symbol, { err });
  });

  if (!snapshot) {
    return apiUpstreamUnavailable({ exchange: parsed.exchange, symbol: parsed.symbol });
  }

  const band = computePriceBand(snapshot, parsed.pct);

  const deviation_pct = parsed.quote_price
    ? computeDeviationPct(parsed.quote_price, band.mid)
    : null;

  return Response.json({ snapshot, band, deviation_pct });
}
