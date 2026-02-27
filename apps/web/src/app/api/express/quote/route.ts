import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getSql } from "@/lib/db";
import { apiError, apiZodError } from "@/lib/api/errors";
import { fetchMarketSnapshot } from "@/lib/market";
import type { ExchangeId } from "@/lib/market/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  side: z.enum(["BUY", "SELL"]).default("BUY"),
  asset: z.string().min(2).max(16).default("USDT"),
  fiat: z.string().min(2).max(5).default("USD"),
  amount_fiat: z.coerce.number().positive(),
});

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const v = raw ? Number(raw) : NaN;
  return Number.isFinite(v) ? v : fallback;
}

function parseCsvEnvLower(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parts = raw
    .split(/[,\n]/g)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return parts.length ? parts : fallback;
}

function bpsToFrac(bps: number): number {
  return bps / 10_000;
}

type BestP2PAd = {
  id: string;
  side: "BUY" | "SELL";
  fiat_currency: string;
  price_type: "fixed" | "floating";
  fixed_price: string | null;
  remaining_amount: string;
  min_limit: string;
  max_limit: string;
  payment_window_minutes: number;
};

async function getBestP2PAdForUSDT(opts: {
  side: "BUY" | "SELL";
  fiat: string;
  amountFiat: number;
}): Promise<BestP2PAd | null> {
  const sql = getSql();

  // User intent vs advertiser intent.
  const targetSide = opts.side === "BUY" ? "SELL" : "BUY";
  const orderDir = targetSide === "SELL" ? sql`ASC` : sql`DESC`;

  const [usdtAsset] = await sql`SELECT id FROM ex_asset WHERE symbol = 'USDT' AND chain = 'bsc' LIMIT 1`;
  if (!usdtAsset) return null;

  const rows = await sql<BestP2PAd[]>`
    SELECT
      ad.id,
      ad.side,
      ad.fiat_currency,
      ad.price_type,
      ad.fixed_price::text,
      ad.remaining_amount::text,
      ad.min_limit::text,
      ad.max_limit::text,
      ad.payment_window_minutes
    FROM p2p_ad ad
    WHERE ad.status = 'online'
      AND ad.side = ${targetSide}
      AND ad.asset_id = ${usdtAsset.id}
      AND ad.fiat_currency = ${opts.fiat}
      AND ad.min_limit <= ${opts.amountFiat}
      AND ad.max_limit >= ${opts.amountFiat}
      AND ad.remaining_amount > 0
      AND ad.price_type = 'fixed'
      AND ad.fixed_price IS NOT NULL
    ORDER BY ad.fixed_price ${orderDir}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

type SpotLeg = {
  exchange: ExchangeId;
  symbol: string;
  bid: number;
  ask: number;
  effectiveBid: number;
  effectiveAsk: number;
};

async function getBestSpotLeg(opts: {
  side: "BUY" | "SELL";
  asset: string;
  takerFeeBps: number;
  slippageBps: number;
}): Promise<{ best: SpotLeg | null; errors: Array<{ exchange: string; message: string }> }> {
  const exchanges = parseCsvEnvLower("EXPRESS_EXCHANGES", ["binance", "bybit"]) as ExchangeId[];
  const symbol = `${opts.asset.toUpperCase()}USDT`;

  const costFrac = bpsToFrac(Math.max(0, opts.takerFeeBps) + Math.max(0, opts.slippageBps));

  const settled = await Promise.allSettled(
    exchanges.map(async (exchange) => {
      const snap = await fetchMarketSnapshot(exchange, symbol);
      const bid = Number.parseFloat(String(snap.bid ?? "0"));
      const ask = Number.parseFloat(String(snap.ask ?? "0"));
      if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) {
        throw new Error("invalid_ticker");
      }
      const effectiveAsk = ask * (1 + costFrac);
      const effectiveBid = bid * (1 - costFrac);
      return {
        exchange,
        symbol,
        bid,
        ask,
        effectiveAsk,
        effectiveBid,
      } satisfies SpotLeg;
    }),
  );

  const legs: SpotLeg[] = [];
  const errors: Array<{ exchange: string; message: string }> = [];

  for (const r of settled) {
    if (r.status === "fulfilled") legs.push(r.value);
    else {
      const exchange = (() => {
        const m = String(r.reason ?? "");
        if (m.includes("bybit")) return "bybit";
        if (m.includes("binance")) return "binance";
        return "unknown";
      })();
      errors.push({ exchange, message: r.reason instanceof Error ? r.reason.message : String(r.reason) });
    }
  }

  if (legs.length === 0) return { best: null, errors };

  // BUY: minimize effective ask. SELL: maximize effective bid.
  const best = legs.reduce((acc, cur) => {
    if (!acc) return cur;
    if (opts.side === "BUY") return cur.effectiveAsk < acc.effectiveAsk ? cur : acc;
    return cur.effectiveBid > acc.effectiveBid ? cur : acc;
  }, null as SpotLeg | null);

  return { best, errors };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) return apiZodError(parsed.error) ?? apiError("invalid_input");

    const side = parsed.data.side;
    const asset = parsed.data.asset.toUpperCase();
    const fiat = parsed.data.fiat.toUpperCase();
    const amountFiat = parsed.data.amount_fiat;

    // Reuse the same safety defaults as arbitrage unless explicitly overridden.
    const takerFeeBps = Math.max(0, numEnv("EXPRESS_TAKER_FEE_BPS", numEnv("ARB_TAKER_FEE_BPS", 10)));
    const slippageBps = Math.max(0, numEnv("EXPRESS_SLIPPAGE_BPS", numEnv("ARB_SLIPPAGE_BPS", 3)));

    const p2p = await getBestP2PAdForUSDT({ side, fiat, amountFiat });
    if (!p2p || !p2p.fixed_price) {
      return NextResponse.json(
        {
          ok: false,
          error: "no_p2p_liquidity",
          message: "No matching fixed-price USDT P2P ad found for that fiat/amount.",
          quote: null,
        },
        { status: 200 },
      );
    }

    const p2pPrice = Number.parseFloat(p2p.fixed_price);
    if (!Number.isFinite(p2pPrice) || p2pPrice <= 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_p2p_price",
          message: "Best P2P ad has invalid price.",
          quote: null,
        },
        { status: 200 },
      );
    }

    // P2P leg is always fiat <-> USDT.
    // Price is fiat per 1 USDT.
    const usdtAmountForFiat = amountFiat / p2pPrice;

    // If asset is USDT, we're done.
    if (asset === "USDT") {
      const result =
        side === "BUY"
          ? { usdt_received: usdtAmountForFiat, usdt_required: null }
          : { usdt_received: null, usdt_required: usdtAmountForFiat };

      return NextResponse.json({
        ok: true,
        quote: {
          side,
          asset,
          fiat,
          amount_fiat: amountFiat,
          assumptions: { taker_fee_bps: takerFeeBps, slippage_bps: slippageBps },
          p2p: {
            best_ad: p2p,
            price_fiat_per_usdt: p2pPrice,
          },
          spot: null,
          result,
        },
      });
    }

    const { best: bestSpot, errors: spotErrors } = await getBestSpotLeg({
      side: side === "BUY" ? "BUY" : "SELL",
      asset,
      takerFeeBps,
      slippageBps,
    });

    if (!bestSpot) {
      return NextResponse.json(
        {
          ok: false,
          error: "no_spot_price",
          message: "Unable to fetch spot prices from configured exchanges.",
          details: { spotErrors },
          quote: null,
        },
        { status: 200 },
      );
    }

    if (side === "BUY") {
      // fiat -> USDT (P2P) -> asset (spot)
      const assetReceived = usdtAmountForFiat / bestSpot.effectiveAsk;
      const effectiveFiatPerAsset = assetReceived > 0 ? amountFiat / assetReceived : null;

      return NextResponse.json({
        ok: true,
        quote: {
          side,
          asset,
          fiat,
          amount_fiat: amountFiat,
          assumptions: { taker_fee_bps: takerFeeBps, slippage_bps: slippageBps },
          p2p: {
            best_ad: p2p,
            price_fiat_per_usdt: p2pPrice,
            usdt_received: usdtAmountForFiat,
          },
          spot: {
            best: bestSpot,
            errors: spotErrors,
          },
          result: {
            asset_received: assetReceived,
            effective_fiat_per_asset: effectiveFiatPerAsset,
          },
        },
      });
    }

    // SELL: asset -> USDT (spot) -> fiat (P2P)
    // User provided fiat target; compute required USDT, then required asset.
    const usdtRequired = usdtAmountForFiat;
    const assetRequired = usdtRequired / bestSpot.effectiveBid;

    return NextResponse.json({
      ok: true,
      quote: {
        side,
        asset,
        fiat,
        amount_fiat: amountFiat,
        assumptions: { taker_fee_bps: takerFeeBps, slippage_bps: slippageBps },
        p2p: {
          best_ad: p2p,
          price_fiat_per_usdt: p2pPrice,
          usdt_required: usdtRequired,
        },
        spot: {
          best: bestSpot,
          errors: spotErrors,
        },
        result: {
          asset_required: assetRequired,
          effective_fiat_per_asset: assetRequired > 0 ? amountFiat / assetRequired : null,
        },
      },
    });
  } catch (error: any) {
    return apiError(error?.message || "internal_error", { details: error });
  }
}
