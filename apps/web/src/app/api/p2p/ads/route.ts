
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { apiError, apiZodError } from "@/lib/api/errors";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { TST_CONFIG } from "@/lib/tst_utility";

export const dynamic = "force-dynamic";

// Schema for query parameters
const searchSchema = z.object({
  side: z.enum(["BUY", "SELL"]).default("BUY"), 
  asset: z.string().default("TST"),
  fiat: z.string().default("USD"),
  amount: z.coerce.number().optional(),
});

// Schema for creating an ad
const createAdSchema = z.object({
  side: z.enum(["BUY", "SELL"]),
  asset: z.enum(["TST", "USDT", "BNB"]).default("TST"),
  fiat: z.string().min(2).max(5),
  price_type: z.enum(["fixed", "floating"]).default("fixed"),
  fixed_price: z.number().positive(),
  total_amount: z.number().positive(),
  min_limit: z.number().positive(),
  max_limit: z.number().positive(),
  terms: z.string().optional(),
  payment_window_minutes: z.number().min(15).max(180).default(15),
  payment_methods: z.array(z.string()).min(1).default(["bank_transfer"]),
});

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const query = searchSchema.safeParse(Object.fromEntries(url.searchParams));
    
    if (!query.success) {
      return apiZodError(query.error) ?? apiError("invalid_input");
    }
    
    const { side, asset, fiat, amount } = query.data;
    const sql = getSql();

    // Note: If user wants to BUY, we look for ads with side='SELL'
    const targetSide = side === "BUY" ? "SELL" : "BUY";

    // 1. Get Asset ID
    const [assetRow] = await sql`
      SELECT id FROM ex_asset WHERE symbol = ${asset} AND chain = 'bsc' LIMIT 1
    `;
    
    if (!assetRow) {
      return NextResponse.json({ ads: [] });
    }

    // 2. Fetch Ads
    const ads = await sql`
      SELECT 
        ad.id,
        ad.side,
        ad.fiat_currency,
        ad.price_type,
        ad.fixed_price,
        ad.margin_percent,
        ad.remaining_amount,
        ad.min_limit,
        ad.max_limit,
        ad.payment_window_minutes,
        ad.payment_method_ids,
        u.email,
        u.display_name,
        ad.terms
      FROM p2p_ad ad
      JOIN app_user u ON ad.user_id = u.id
      WHERE ad.status = 'online'
        AND ad.side = ${targetSide}
        AND ad.asset_id = ${assetRow.id}
        AND ad.fiat_currency = ${fiat}
        ${amount ? sql`AND ad.min_limit <= ${amount} AND ad.max_limit >= ${amount}` : sql``}
        AND ad.remaining_amount > 0
      ORDER BY 
        CASE WHEN ad.price_type = 'fixed' THEN ad.fixed_price ELSE 0 END ASC,
        ad.created_at DESC
      LIMIT 50
    `;

    return NextResponse.json({ ads });
  } catch (error: any) {
    return apiError(error.message || "internal_error", { details: error });
  }
}

export async function POST(req: NextRequest) {
  const sql = getSql();
  const actingUserId = getActingUserId(req);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("unauthorized", { status: 401 });

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return apiError(activeErr);

    const body = await req.json();
    const payload = createAdSchema.safeParse(body);
    if (!payload.success) return apiZodError(payload.error) ?? apiError("invalid_input");
    const data = payload.data;

    // 1. Merchant Shield Check (TST Balance)
    // Find TST asset ID first
    const [tstAsset] = await sql`SELECT id FROM ex_asset WHERE symbol = 'TST' AND chain = 'bsc' LIMIT 1`;
    if (!tstAsset) return apiError("configuration_error: TST not found in assets");

    const [balanceRow] = await sql`
      SELECT balance FROM ex_ledger_account 
      WHERE user_id = ${actingUserId} AND asset_id = ${tstAsset.id}
    `;

    // Note: Balance is stored as Human Readable Decimal in the DB (numeric column)
    // TST_CONFIG.P2P_MAKER_MIN_STAKE is "500.00"
    const userBalance = balanceRow ? parseFloat(balanceRow.balance) : 0;
    const requiredStake = parseFloat(TST_CONFIG.P2P_MAKER_MIN_STAKE);

    if (userBalance < requiredStake) {
      return apiError("merchant_shield_error", {
        details: { message: `You must hold at least ${TST_CONFIG.P2P_MAKER_MIN_STAKE} TST to post ads. Your balance is insufficient.` }
      });
    }

    // 2. Identify the asset being traded
    const [targetAsset] = await sql`SELECT id FROM ex_asset WHERE symbol = ${data.asset} AND chain = 'bsc' LIMIT 1`;
    if (!targetAsset) return apiError("invalid_asset");

    // 3. For SELL ads, verify balance (Human Readable)
    if (data.side === "SELL") {
      const [sellAssetBalance] = await sql`
        SELECT balance FROM ex_ledger_account 
        WHERE user_id = ${actingUserId} AND asset_id = ${targetAsset.id}
      `;
      const avail = sellAssetBalance ? parseFloat(sellAssetBalance.balance) : 0;
      
      // Check total amount they want to sell
      if (avail < data.total_amount) {
         return apiError("insufficient_funds", {
            details: { message: `You want to sell ${data.total_amount} ${data.asset}, but only have ${avail} available.` }
         });
      }
    }

    // 4. Create the Ad
    const [newAd] = await sql`
      INSERT INTO p2p_ad (
        user_id, side, asset_id, fiat_currency,
        price_type, fixed_price, total_amount, remaining_amount,
        min_limit, max_limit, payment_window_minutes, terms,
        status, payment_method_ids
      ) VALUES (
        ${actingUserId}, ${data.side}, ${targetAsset.id}, ${data.fiat},
        ${data.price_type}, ${data.fixed_price}, ${data.total_amount}, ${data.total_amount},
        ${data.min_limit}, ${data.max_limit}, ${data.payment_window_minutes}, ${data.terms || ""},
        'online', ${JSON.stringify(data.payment_methods)}::jsonb
      )
      RETURNING id
    `;

    return NextResponse.json({ success: true, id: newAd.id });

  } catch (err: any) {
    console.error("POST /api/p2p/ads error:", err);
    return apiError(err.message || "internal_error", { details: err.toString() });
  }
}
