import type { Sql } from "postgres";

import { getExternalIndexUsdt } from "@/lib/market/indexPrice";

export type FxQuote = {
  base: string;
  quote: string;
  bid: number;
  ask: number;
  mid: number;
  sources: Record<string, unknown>;
  computedAt: Date;
  validUntil: Date;
};

function nowPlusMs(ms: number) {
  return new Date(Date.now() + ms);
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function parseNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isMissingRelation(err: unknown): boolean {
  // Postgres undefined_table SQLSTATE is 42P01.
  if (!err || typeof err !== "object") return false;
  const anyErr = err as { code?: unknown; message?: unknown };
  if (anyErr.code === "42P01") return true;
  const msg = typeof anyErr.message === "string" ? anyErr.message : "";
  return /relation\s+"[^"]+"\s+does\s+not\s+exist/i.test(msg);
}

async function getLiveUsdToFiatRate(fiat: string): Promise<number | null> {
  const to = fiat.toUpperCase();
  if (!/^[A-Z]{2,5}$/.test(to)) return null;
  if (to === "USD" || to === "USDT") return 1;

  // Operator override (reliable for prod if outbound FX APIs are blocked).
  // Example: FX_USD_FIAT_OVERRIDE_KES=160.25
  const override = process.env[`FX_USD_FIAT_OVERRIDE_${to}`] ?? process.env.FX_USD_FIAT_OVERRIDE;
  if (override) {
    const n = Number(override);
    if (Number.isFinite(n) && n > 0) return n;
  }

  const timeoutMs = clamp(Number(process.env.FX_LIVE_TIMEOUT_MS ?? "2500"), 500, 10_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const primaryUrl = `https://api.frankfurter.app/latest?from=USD&to=${encodeURIComponent(to)}`;
    const r1 = await fetch(primaryUrl, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (r1.ok) {
      const j = (await r1.json()) as { rates?: Record<string, unknown> };
      const raw = j?.rates?.[to];
      const v = parseNum(raw);
      if (v && v > 0) return v;
    }

    const secondaryUrl = "https://open.er-api.com/v6/latest/USD";
    const r2 = await fetch(secondaryUrl, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!r2.ok) return null;

    const j2 = (await r2.json()) as { rates?: Record<string, unknown> };
    const raw2 = j2?.rates?.[to];
    const v2 = parseNum(raw2);
    return v2 && v2 > 0 ? v2 : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function getExternalUsdtPerAsset(sym: string): Promise<number | null> {
  const s = sym.trim().toUpperCase();
  if (!s) return null;
  if (s === "USDT" || s === "USD") return 1;
  const q = await getExternalIndexUsdt(s);
  const mid = q?.mid;
  return mid && Number.isFinite(mid) && mid > 0 ? mid : null;
}

async function getAssetId(sql: Sql, symbol: string): Promise<string | null> {
  const rows = await sql<{ id: string }[]>`
    SELECT id::text AS id
    FROM ex_asset
    WHERE chain = 'bsc' AND symbol = ${symbol.toUpperCase()} AND is_enabled = true
    LIMIT 1
  `;
  return rows[0]?.id ?? null;
}

async function getP2pFiatPerAssetFixedTop(sql: Sql, assetSymbol: string, fiat: string) {
  const assetId = await getAssetId(sql, assetSymbol);
  if (!assetId) return null;

  // In this schema, fixed_price is interpreted as fiat_per_asset.
  // BUY ads => maker buys asset (so it's a bid in fiat/asset)
  // SELL ads => maker sells asset (so it's an ask in fiat/asset)
  const bidRows = await sql<{ price: string }[]>`
    SELECT fixed_price::text AS price
    FROM p2p_ad
    WHERE status = 'online'
      AND price_type = 'fixed'
      AND asset_id = ${assetId}::uuid
      AND fiat_currency = ${fiat.toUpperCase()}
      AND side = 'BUY'
      AND remaining_amount > 0
      AND fixed_price IS NOT NULL
    ORDER BY fixed_price DESC
    LIMIT 1
  `;

  const askRows = await sql<{ price: string }[]>`
    SELECT fixed_price::text AS price
    FROM p2p_ad
    WHERE status = 'online'
      AND price_type = 'fixed'
      AND asset_id = ${assetId}::uuid
      AND fiat_currency = ${fiat.toUpperCase()}
      AND side = 'SELL'
      AND remaining_amount > 0
      AND fixed_price IS NOT NULL
    ORDER BY fixed_price ASC
    LIMIT 1
  `;

  const bid = parseNum(bidRows[0]?.price ?? null);
  const ask = parseNum(askRows[0]?.price ?? null);

  if (!bid && !ask) return null;

  const mid = bid && ask ? (bid + ask) / 2 : bid ?? ask!;

  return {
    bid: bid ?? mid,
    ask: ask ?? mid,
    mid,
    sources: {
      kind: "p2p_fixed_top",
      asset: assetSymbol.toUpperCase(),
      fiat: fiat.toUpperCase(),
      top_bid: bid,
      top_ask: ask,
    },
  };
}

async function getInternalMarketMid(sql: Sql, baseSymbol: string, quoteSymbol: string) {
  const baseId = await getAssetId(sql, baseSymbol);
  const quoteId = await getAssetId(sql, quoteSymbol);
  if (!baseId || !quoteId) return null;

  const marketRows = await sql<{ id: string; base_asset_id: string; quote_asset_id: string; symbol: string }[]>`
    SELECT id::text AS id, base_asset_id::text, quote_asset_id::text, symbol
    FROM ex_market
    WHERE chain = 'bsc'
      AND (
        (base_asset_id = ${baseId}::uuid AND quote_asset_id = ${quoteId}::uuid)
        OR
        (base_asset_id = ${quoteId}::uuid AND quote_asset_id = ${baseId}::uuid)
      )
      AND status = 'enabled'
    LIMIT 1
  `;

  const market = marketRows[0];
  if (!market) return null;

  const isInverted = market.base_asset_id !== baseId;

  // Best bid/ask from open orderbook.
  const bidRows = await sql<{ price: string }[]>`
    SELECT price::text AS price
    FROM ex_order
    WHERE market_id = ${market.id}::uuid
      AND side = 'buy'
      AND status IN ('open','partially_filled')
    ORDER BY price DESC, created_at ASC
    LIMIT 1
  `;

  const askRows = await sql<{ price: string }[]>`
    SELECT price::text AS price
    FROM ex_order
    WHERE market_id = ${market.id}::uuid
      AND side = 'sell'
      AND status IN ('open','partially_filled')
    ORDER BY price ASC, created_at ASC
    LIMIT 1
  `;

  let bid = parseNum(bidRows[0]?.price ?? null);
  let ask = parseNum(askRows[0]?.price ?? null);

  // If orderbook is empty, fall back to last execution.
  if (!bid && !ask) {
    const lastExec = await sql<{ price: string }[]>`
      SELECT price::text AS price
      FROM ex_execution
      WHERE market_id = ${market.id}::uuid
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const p = parseNum(lastExec[0]?.price ?? null);
    if (!p) return null;

    // Synthetic spread of 20 bps around last price.
    const spreadBps = clamp(Number(process.env.FX_INTERNAL_FALLBACK_SPREAD_BPS ?? "20"), 1, 500);
    const half = spreadBps / 2 / 10_000;
    bid = p * (1 - half);
    ask = p * (1 + half);
  }

  const mid = ((bid ?? 0) + (ask ?? 0)) / 2;

  // Convert to requested orientation if market was inverted.
  // Price stored as quote_per_base.
  if (isInverted) {
    // If market is quote/base, then its price is base_per_quote.
    // Invert to get quote_per_base.
    const invBid = bid ? 1 / bid : null;
    const invAsk = ask ? 1 / ask : null;
    const invMid = 1 / (mid || (bid ?? ask!));

    const outBid = invBid ?? invMid;
    const outAsk = invAsk ?? invMid;

    return {
      bid: Math.min(outBid, outAsk),
      ask: Math.max(outBid, outAsk),
      mid: (outBid + outAsk) / 2,
      sources: {
        kind: "internal_market",
        market_symbol: market.symbol,
        inverted: true,
      },
    };
  }

  const outBid = bid ?? mid;
  const outAsk = ask ?? mid;

  return {
    bid: Math.min(outBid, outAsk),
    ask: Math.max(outBid, outAsk),
    mid: (outBid + outAsk) / 2,
    sources: {
      kind: "internal_market",
      market_symbol: market.symbol,
      inverted: false,
    },
  };
}

export async function getOrComputeFxReferenceRate(
  sql: Sql,
  base: string,
  quote: string,
  opts?: { ttlMs?: number },
): Promise<FxQuote | null> {
  const ttlMs = clamp(opts?.ttlMs ?? Number(process.env.FX_REFERENCE_TTL_MS ?? "20000"), 2000, 120_000);

  const baseSym = base.toUpperCase();
  const quoteSym = quote.toUpperCase();

  // Try cache first (best-effort). If the cache table isn't migrated yet,
  // fall back to computing the rate without caching.
  try {
    const cached = await sql<
      {
        bid: string;
        ask: string;
        mid: string;
        sources: any;
        computed_at: string;
        valid_until: string;
      }[]
    >`
      SELECT bid::text, ask::text, mid::text, sources, computed_at::text, valid_until::text
      FROM fx_reference_rate
      WHERE base_symbol = ${baseSym} AND quote_symbol = ${quoteSym} AND valid_until > now()
      ORDER BY computed_at DESC
      LIMIT 1
    `;

    if (cached.length) {
      const row = cached[0]!;
      const bid = parseNum(row.bid);
      const ask = parseNum(row.ask);
      const mid = parseNum(row.mid);
      if (bid && ask && mid) {
        return {
          base: baseSym,
          quote: quoteSym,
          bid,
          ask,
          mid,
          sources: (row.sources ?? {}) as Record<string, unknown>,
          computedAt: new Date(row.computed_at),
          validUntil: new Date(row.valid_until),
        };
      }
    }
  } catch (e) {
    if (!isMissingRelation(e)) throw e;
  }

  // Compute.
  let computed: { bid: number; ask: number; mid: number; sources: Record<string, unknown> } | null = null;

  if (quoteSym.length < 2) return null;

  // 1) Compute USDT/fiat reference (used by many flows: min/max limits, indices).
  // Prefer live USD->fiat (market-based) first, then fall back to P2P top-of-book if live FX is unavailable.
  const usdtFiat = await (async () => {
    const usdFiat = await getLiveUsdToFiatRate(quoteSym);
    if (usdFiat) {
      const spreadBps = clamp(Number(process.env.FX_USDT_FIAT_FALLBACK_SPREAD_BPS ?? "10"), 0, 500);
      const half = spreadBps / 2 / 10_000;
      const bid = usdFiat * (1 - half);
      const ask = usdFiat * (1 + half);
      const mid = (bid + ask) / 2;
      return {
        bid,
        ask,
        mid,
        sources: {
          kind: "live_usd_fiat_fallback",
          base: "USDT",
          quote: quoteSym,
          usd_fiat_mid: usdFiat,
          spread_bps: spreadBps,
          note: "USDT pegged to USD for fallback conversion",
        },
      };
    }

    const p2p = await getP2pFiatPerAssetFixedTop(sql, "USDT", quoteSym);
    if (p2p) return p2p;

    return null;
  })();

  if (!usdtFiat) return null;

  // Base=USDT is a direct quote.
  if (baseSym === "USDT") {
    computed = usdtFiat;
  } else {
    // 2) Compute asset/fiat via asset/USDT external index and USDT/fiat.
    const baseUsdtMid = await getExternalUsdtPerAsset(baseSym);
    if (!baseUsdtMid) return null;

    const mid = baseUsdtMid * usdtFiat.mid;
    if (!Number.isFinite(mid) || mid <= 0) return null;

    // Conservative reference spread for guardrails.
    const spreadBps = clamp(Number(process.env.FX_ASSET_FIAT_SPREAD_BPS ?? "20"), 0, 500);
    const half = spreadBps / 2 / 10_000;
    const bid = mid * (1 - half);
    const ask = mid * (1 + half);

    computed = {
      bid,
      ask,
      mid,
      sources: {
        kind: "chained_external_index_usdt",
        base: baseSym,
        quote: quoteSym,
        base_usdt_mid: baseUsdtMid,
        usdt_fiat_mid: usdtFiat.mid,
        usdt_fiat_sources: usdtFiat.sources,
        spread_bps: spreadBps,
      },
    };
  }

  const computedAt = new Date();
  const validUntil = nowPlusMs(ttlMs);

  // Best-effort cache insert. If the cache table isn't present yet, ignore.
  try {
    await sql`
      INSERT INTO fx_reference_rate (base_symbol, quote_symbol, bid, ask, mid, sources, computed_at, valid_until)
      VALUES (
        ${baseSym},
        ${quoteSym},
        (${computed.bid}::numeric),
        (${computed.ask}::numeric),
        (${computed.mid}::numeric),
        ${JSON.stringify(computed.sources)}::jsonb,
        ${computedAt.toISOString()}::timestamptz,
        ${validUntil.toISOString()}::timestamptz
      )
    `;
  } catch (e) {
    if (!isMissingRelation(e)) {
      // ignore other cache write errors too (cache is non-critical)
    }
  }

  return {
    base: baseSym,
    quote: quoteSym,
    bid: computed.bid,
    ask: computed.ask,
    mid: computed.mid,
    sources: computed.sources,
    computedAt,
    validUntil,
  };
}
