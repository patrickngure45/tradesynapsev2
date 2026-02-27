import { z } from "zod";

import { getSql } from "@/lib/db";
import { fetchMarketSnapshot } from "@/lib/market";
import type { ExchangeId } from "@/lib/market/types";
import { syntheticMarketSnapshot } from "@/lib/market/synthetic";
import { apiError, apiUpstreamUnavailable, apiZodError } from "@/lib/api/errors";
import { responseForDbError } from "@/lib/dbTransient";

const querySchema = z.object({
  exchange: z.enum(["binance", "bybit"]),
  symbol: z.string().min(3).max(30),
  persist: z
    .enum(["0", "1", "false", "true"])
    .optional()
    .default("0"),
  debug: z
    .enum(["0", "1", "false", "true"])
    .optional()
    .default("0"),
});

export async function GET(request: Request) {
  const url = new URL(request.url);

  let parsed: z.infer<typeof querySchema>;
  try {
    parsed = querySchema.parse({
      exchange: url.searchParams.get("exchange"),
      symbol: url.searchParams.get("symbol"),
      persist: url.searchParams.get("persist") ?? "0",
      debug: url.searchParams.get("debug") ?? "0",
    });
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const exchange = parsed.exchange as ExchangeId;
  const debug = parsed.debug === "1" || parsed.debug === "true";
  const snapshot = await fetchMarketSnapshot(exchange, parsed.symbol).catch((err) => {
    if (process.env.NODE_ENV === "production" && !debug) {
      return null;
    }
    return syntheticMarketSnapshot(exchange, parsed.symbol, { err });
  });

  if (!snapshot) {
    return apiUpstreamUnavailable({ exchange, symbol: parsed.symbol });
  }

  const shouldPersist = parsed.persist === "1" || parsed.persist === "true";

  if (shouldPersist) {
    const sql = getSql();

    try {
      const rows = await (sql as any)<{
        id: string;
        created_at: string;
      }[]>`
        INSERT INTO market_snapshot (exchange, symbol, last, bid, ask, ts, raw_json)
        VALUES (
          ${snapshot.exchange},
          ${snapshot.symbol},
          ${snapshot.last},
          ${snapshot.bid},
          ${snapshot.ask},
          ${snapshot.ts.toISOString()},
          ${snapshot.raw}::jsonb
        )
        RETURNING id, created_at
      `;

      return Response.json({ snapshot, persisted: rows[0] });
    } catch (e) {
      const resp = responseForDbError("market.snapshot.persist", e);
      if (resp) return resp;
      throw e;
    }
  }

  return Response.json({ snapshot, persisted: null });
}
