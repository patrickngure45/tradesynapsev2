import { z } from "zod";

import { getSql } from "@/lib/db";
import { apiError, apiZodError } from "@/lib/api/errors";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { getExternalIndexUsdt } from "@/lib/market/indexPrice";
import { getOrComputeFxReferenceRate } from "@/lib/fx/reference";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  fiat: z
    .string()
    .optional()
    .transform((v) => (v ?? "KES").trim().toUpperCase())
    .refine((v) => /^[A-Z]{2,5}$/.test(v), "invalid_fiat"),
});

function n(v: unknown): number | null {
  const x = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(x) ? x : null;
}

function asText(v: number | null): string | null {
  if (v == null) return null;
  if (!Number.isFinite(v)) return null;
  return String(v);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  let q: z.infer<typeof querySchema>;
  try {
    q = querySchema.parse({ fiat: url.searchParams.get("fiat") ?? undefined });
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const fiat = q.fiat;

  try {
    const sql = getSql();

    const payload = await retryOnceOnTransientDbError(async () => {
      const markets = await sql<
        {
          id: string;
          chain: string;
          symbol: string;
          status: string;
          tick_size: string;
          lot_size: string;
          maker_fee_bps: number;
          taker_fee_bps: number;
          base_symbol: string;
          quote_symbol: string;
        }[]
      >`
        SELECT
          m.id::text AS id,
          m.chain,
          m.symbol,
          m.status,
          m.tick_size::text AS tick_size,
          m.lot_size::text AS lot_size,
          m.maker_fee_bps,
          m.taker_fee_bps,
          b.symbol AS base_symbol,
          q.symbol AS quote_symbol
        FROM ex_market m
        JOIN ex_asset b ON b.id = m.base_asset_id
        JOIN ex_asset q ON q.id = m.quote_asset_id
        WHERE m.status = 'enabled'
        ORDER BY m.chain ASC, m.symbol ASC
      `;

      const tickers = await sql<
        {
          market_id: string;
          open: string | null;
          last: string | null;
          high: string | null;
          low: string | null;
          volume: string | null;
          quote_volume: string | null;
          trade_count: number;
        }[]
      >`
        WITH stats AS (
          SELECT
            market_id,
            (array_agg(price ORDER BY created_at ASC, id ASC))[1] as open,
            (array_agg(price ORDER BY created_at DESC, id DESC))[1] as last,
            MAX(price) as high,
            MIN(price) as low,
            SUM(quantity) as volume,
            SUM(price * quantity) as quote_volume,
            COUNT(*) as trade_count
          FROM ex_execution
          WHERE created_at >= NOW() - INTERVAL '24 hours'
          GROUP BY market_id
        )
        SELECT
          m.id::text as market_id,
          s.open::text,
          s.last::text,
          s.high::text,
          s.low::text,
          COALESCE(s.volume, 0)::text as volume,
          COALESCE(s.quote_volume, 0)::text as quote_volume,
          COALESCE(s.trade_count, 0)::int as trade_count
        FROM ex_market m
        LEFT JOIN stats s ON s.market_id = m.id
        WHERE m.status = 'enabled'
      `;

      const top = await sql<
        {
          market_id: string;
          bid: string | null;
          ask: string | null;
        }[]
      >`
        SELECT
          m.id::text AS market_id,
          (
            SELECT o.price::text
            FROM ex_order o
            WHERE o.market_id = m.id
              AND o.side = 'buy'
              AND o.status IN ('open','partially_filled')
            ORDER BY o.price DESC, o.created_at ASC
            LIMIT 1
          ) AS bid,
          (
            SELECT o.price::text
            FROM ex_order o
            WHERE o.market_id = m.id
              AND o.side = 'sell'
              AND o.status IN ('open','partially_filled')
            ORDER BY o.price ASC, o.created_at ASC
            LIMIT 1
          ) AS ask
        FROM ex_market m
        WHERE m.status = 'enabled'
      `;

      const enabledAssets = await sql<
        {
          id: string;
          chain: string;
          symbol: string;
          name: string | null;
          decimals: number;
          contract_address: string | null;
          has_market: boolean;
        }[]
      >`
        WITH mkt AS (
          SELECT base_asset_id AS asset_id FROM ex_market WHERE status = 'enabled'
          UNION
          SELECT quote_asset_id AS asset_id FROM ex_market WHERE status = 'enabled'
        )
        SELECT
          a.id::text AS id,
          a.chain,
          a.symbol,
          a.name,
          a.decimals,
          a.contract_address,
          (m.asset_id IS NOT NULL) AS has_market
        FROM ex_asset a
        LEFT JOIN mkt m ON m.asset_id = a.id
        WHERE a.is_enabled = true
        ORDER BY a.chain ASC, a.symbol ASC
      `;

      return { markets, tickers, top, enabledAssets };
    });

    // FX:
    // - USDT/fiat is the primary display anchor (Binance-style)
    const usdtFiat = await getOrComputeFxReferenceRate(sql, "USDT", fiat);

    const tickerByMarket = new Map(payload.tickers.map((t) => [t.market_id, t] as const));
    const topByMarket = new Map(payload.top.map((t) => [t.market_id, t] as const));

    const maxIndexAssets = (() => {
      const raw = process.env.MARKETS_INDEX_MAX_ASSETS;
      const v = raw ? Number(raw) : NaN;
      return Number.isFinite(v) ? Math.max(1, Math.min(200, Math.floor(v))) : 25;
    })();

    const marketBaseSymbols = Array.from(
      new Set(
        payload.markets
          .map((m) => m.base_symbol.toUpperCase())
          .filter((s) => s && s !== "USDT"),
      ),
    );

    // Fetch external index quotes only for the base symbols we actually list as markets.
    const indexByBase = new Map<string, Awaited<ReturnType<typeof getExternalIndexUsdt>> | null>();
    await Promise.all(
      marketBaseSymbols.slice(0, maxIndexAssets).map(async (base) => {
        const q = await getExternalIndexUsdt(base);
        indexByBase.set(base, q);
      }),
    );

    const markets = payload.markets.map((m) => {
      const t = tickerByMarket.get(m.id) ?? null;
      const book = topByMarket.get(m.id) ?? { bid: null, ask: null };

      const bid = n(book.bid);
      const ask = n(book.ask);
      const internalMid = bid != null && ask != null ? (bid + ask) / 2 : null;

      const last = n(t?.last ?? null);
      const internalDisplayMid = internalMid ?? last;

      // External index (best-effort): base/USDT median.
      let indexUsdt: number | null = null;
      let indexSourcesUsed: number | null = null;
      let indexDispersionBps: number | null = null;
      let indexAgeMs: number | null = null;

      if (m.quote_symbol.toUpperCase() === "USDT") {
        const idx = indexByBase.get(m.base_symbol.toUpperCase()) ?? null;
        if (idx?.mid) {
          indexUsdt = idx.mid;
          indexSourcesUsed = idx.sourcesUsed;
          indexDispersionBps = idx.dispersionBps;
          indexAgeMs = Date.now() - idx.computedAt.getTime();
        }
      }

      const deviationPct =
        internalDisplayMid != null && indexUsdt != null && indexUsdt > 0
          ? ((internalDisplayMid - indexUsdt) / indexUsdt) * 100
          : null;

      const quoteSym = m.quote_symbol.toUpperCase();
      const quoteFiatMid = quoteSym === "USDT" ? usdtFiat?.mid ?? null : null;

      const lastFiat = last != null && quoteFiatMid ? last * quoteFiatMid : null;

      // Prefer USDT anchor for fiat conversions when external index is available.
      const idx = indexByBase.get(m.base_symbol.toUpperCase()) ?? null;
      const indexFiat = idx?.mid != null && usdtFiat?.mid ? idx.mid * usdtFiat.mid : null;

      return {
        id: m.id,
        chain: m.chain,
        symbol: m.symbol,
        status: m.status,
        tick_size: m.tick_size,
        lot_size: m.lot_size,
        maker_fee_bps: m.maker_fee_bps,
        taker_fee_bps: m.taker_fee_bps,
        base_symbol: m.base_symbol,
        quote_symbol: m.quote_symbol,

        stats: t
          ? {
              open: t.open ?? "0",
              last: t.last ?? "0",
              high: t.high ?? "0",
              low: t.low ?? "0",
              volume: t.volume ?? "0",
              quote_volume: t.quote_volume ?? "0",
              trade_count: t.trade_count ?? 0,
            }
          : null,

        book: { bid: book.bid, ask: book.ask, mid: asText(internalMid) },

        index: {
          price_usdt: asText(indexUsdt),
          sources_used: indexSourcesUsed,
          dispersion_bps: indexDispersionBps,
          age_ms: indexAgeMs,
          deviation_pct: deviationPct,
          fiat,
          price_fiat: asText(indexFiat),
        },

        last_fiat: { fiat, value: asText(lastFiat) },
      };
    });

    // Supported assets list: show what the "master wallet" supports (enabled assets).
    // External index is best-effort and intentionally limited to assets that have markets.
    const assetIndexEligible = new Set(
      payload.enabledAssets
        .filter((a) => a.has_market)
        .map((a) => a.symbol.toUpperCase())
        .filter((s) => s && s !== "USDT"),
    );

    const assets = payload.enabledAssets.map((a) => {
      const sym = a.symbol.toUpperCase();

      let indexUsdt: number | null = null;
      if (sym === "USDT") indexUsdt = 1;
      else if (assetIndexEligible.has(sym)) indexUsdt = indexByBase.get(sym)?.mid ?? null;

      const indexFiat = indexUsdt != null && usdtFiat?.mid ? indexUsdt * usdtFiat.mid : null;

      return {
        id: a.id,
        chain: a.chain,
        symbol: a.symbol,
        name: a.name,
        decimals: a.decimals,
        contract_address: a.contract_address,
        has_market: a.has_market,
        index_usdt: asText(indexUsdt),
        index_fiat: asText(indexFiat),
      };
    });

    return Response.json(
      {
        fiat,
        fx: {
          usdt_fiat: usdtFiat ? { mid: usdtFiat.mid, computed_at: usdtFiat.computedAt } : null,
        },
        markets,
        assets,
      },
      { status: 200 },
    );
  } catch (e) {
    const dbResp = responseForDbError("exchange.markets.overview", e);
    if (dbResp) return dbResp;

    console.error("[exchange.markets.overview] internal error", e);
    const msg = e instanceof Error ? e.message : String(e);
    const details = process.env.NODE_ENV === "production" ? undefined : msg;
    return apiError("internal_error", { status: 500, details });
  }
}
