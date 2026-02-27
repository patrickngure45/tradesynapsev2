import "dotenv/config";

import { getSql } from "../src/lib/db";
import type { Sql } from "postgres";

type BotProfile = {
  email: string;
  displayName: string;
  country: string;
  fiat: "USD" | "KES";
  basePrice: number;
};

type SeedOptions = {
  closeExistingBotAds?: boolean;
  adsPerSide?: number;
};

const BOT_PROFILES: BotProfile[] = [
  { email: "p2p.seller.01@market.local", displayName: "QuickTrade_01", country: "US", fiat: "USD", basePrice: 1.00 },
  { email: "p2p.seller.02@market.local", displayName: "CityDesk_02", country: "US", fiat: "USD", basePrice: 1.01 },
  { email: "p2p.seller.03@market.local", displayName: "BlueMarket_03", country: "US", fiat: "USD", basePrice: 0.99 },
  { email: "p2p.seller.04@market.local", displayName: "SwiftDesk_04", country: "KE", fiat: "KES", basePrice: 130.0 },
  { email: "p2p.seller.05@market.local", displayName: "NairobiOTC_05", country: "KE", fiat: "KES", basePrice: 131.2 },
  { email: "p2p.seller.06@market.local", displayName: "MetroP2P_06", country: "KE", fiat: "KES", basePrice: 129.7 },
  { email: "p2p.seller.07@market.local", displayName: "TrustDesk_07", country: "US", fiat: "USD", basePrice: 1.02 },
  { email: "p2p.seller.08@market.local", displayName: "ValueHub_08", country: "US", fiat: "USD", basePrice: 0.985 },
  { email: "p2p.seller.09@market.local", displayName: "P2PFlow_09", country: "KE", fiat: "KES", basePrice: 132.1 },
  { email: "p2p.seller.10@market.local", displayName: "DeskPrime_10", country: "KE", fiat: "KES", basePrice: 128.9 },
  { email: "p2p.seller.11@market.local", displayName: "FastSeller_11", country: "US", fiat: "USD", basePrice: 1.015 },
  { email: "p2p.seller.12@market.local", displayName: "MarketLane_12", country: "KE", fiat: "KES", basePrice: 130.8 },
];

const AMOUNTS = [120, 180, 250, 320, 450, 600, 850, 1100, 1500, 2200, 3000, 4200];
const PRICE_STEPS = [0, 0.003, -0.002, 0.006, -0.004, 0.009];

function pickAmount(index: number): number {
  return AMOUNTS[index % AMOUNTS.length]!;
}

function pickPaymentMethods(fiat: "USD" | "KES", index: number): string[] {
  if (fiat === "KES") {
    return index % 2 === 0 ? ["mpesa", "bank_transfer"] : ["mpesa", "airtel_money"];
  }
  return index % 2 === 0 ? ["bank_transfer", "chipper"] : ["bank_transfer", "equity_bank"];
}

function randomMultiplier(): number {
  const n = (Math.random() - 0.5) * 0.01;
  return 1 + n;
}

export async function seedP2PMarket(
  sql: Sql,
  opts: SeedOptions = {},
): Promise<{ totalAds: number; totalSellers: number; byFiat: Array<{ fiat_currency: string; ads: number; sellers: number }> }> {
  const closeExistingBotAds = opts.closeExistingBotAds ?? true;
  const adsPerSide = Math.max(1, opts.adsPerSide ?? 2);

  const usdtRows = await sql<{ id: string }[]>`
      SELECT id::text AS id
      FROM ex_asset
      WHERE chain = 'bsc' AND symbol = 'USDT'
      LIMIT 1
    `;
  if (usdtRows.length === 0) throw new Error("USDT asset not found on bsc");
  const usdtAssetId = usdtRows[0]!.id;

  const botEmails = BOT_PROFILES.map((b) => b.email);

  for (const [index, bot] of BOT_PROFILES.entries()) {
    await sql`
        INSERT INTO app_user (email, status, kyc_level, role, display_name, country)
        VALUES (${bot.email}, 'active', 'full', 'user', ${bot.displayName}, ${bot.country})
        ON CONFLICT (email) DO UPDATE
          SET status = 'active',
              kyc_level = 'full',
              display_name = EXCLUDED.display_name,
              country = EXCLUDED.country
      `;

    const users = await sql<{ id: string }[]>`
        SELECT id::text AS id FROM app_user WHERE email = ${bot.email} LIMIT 1
      `;
    const userId = users[0]!.id;

    await sql`
        INSERT INTO ex_ledger_account (user_id, asset_id, balance, locked, status)
      VALUES (${userId}::uuid, ${usdtAssetId}::uuid, 25000, 0, 'active')
        ON CONFLICT (user_id, asset_id) DO UPDATE
          SET balance = GREATEST(ex_ledger_account.balance, 25000),
              status = 'active'
      `;

    if (closeExistingBotAds) {
      await sql`
        UPDATE p2p_ad
        SET status = 'closed', remaining_amount = 0, updated_at = now()
        WHERE user_id = ${userId}::uuid
          AND asset_id = ${usdtAssetId}::uuid
          AND status IN ('online', 'offline')
      `;
    }

    for (let adOffset = 0; adOffset < adsPerSide; adOffset++) {
      const slot = (index * adsPerSide) + adOffset;
      const jitter = randomMultiplier();
      const amount = pickAmount(slot);
      const step = PRICE_STEPS[slot % PRICE_STEPS.length] ?? 0;
      const fixedPrice = Number((bot.basePrice * (1 + step) * jitter).toFixed(bot.fiat === "USD" ? 4 : 2));
      const minLimit = Number((Math.max(10, amount * fixedPrice * 0.1)).toFixed(2));
      const maxLimit = Number((amount * fixedPrice).toFixed(2));
      const paymentWindow = adOffset % 2 === 0 ? 15 : 30;
      const paymentMethods = pickPaymentMethods(bot.fiat, slot);

      await sql`
        INSERT INTO p2p_ad (
          user_id,
          side,
          asset_id,
          fiat_currency,
          price_type,
          fixed_price,
          total_amount,
          remaining_amount,
          min_limit,
          max_limit,
          payment_window_minutes,
          terms,
          status,
          payment_method_ids
        ) VALUES (
          ${userId}::uuid,
          'SELL',
          ${usdtAssetId}::uuid,
          ${bot.fiat},
          'fixed',
          ${fixedPrice},
          ${amount},
          ${amount},
          ${minLimit},
          ${maxLimit},
          ${paymentWindow},
          ${`Fast release. ${bot.displayName} desk.`},
          'online',
          ${JSON.stringify(paymentMethods)}::jsonb
        )
      `;

      const buyAmount = Number((amount * (0.6 + (Math.random() * 0.4))).toFixed(2));
      const buyPrice = Number((fixedPrice * (bot.fiat === "USD" ? 0.992 : 0.996)).toFixed(bot.fiat === "USD" ? 4 : 2));
      const buyMinLimit = Number((Math.max(10, buyAmount * buyPrice * 0.1)).toFixed(2));
      const buyMaxLimit = Number((buyAmount * buyPrice).toFixed(2));

      await sql`
        INSERT INTO p2p_ad (
          user_id,
          side,
          asset_id,
          fiat_currency,
          price_type,
          fixed_price,
          total_amount,
          remaining_amount,
          min_limit,
          max_limit,
          payment_window_minutes,
          terms,
          status,
          payment_method_ids
        ) VALUES (
          ${userId}::uuid,
          'BUY',
          ${usdtAssetId}::uuid,
          ${bot.fiat},
          'fixed',
          ${buyPrice},
          ${buyAmount},
          ${buyAmount},
          ${buyMinLimit},
          ${buyMaxLimit},
          ${paymentWindow},
          ${`Buying USDT quickly. ${bot.displayName} desk.`},
          'online',
          ${JSON.stringify(paymentMethods)}::jsonb
        )
      `;
    }
  }

  const byFiat = await sql<{ fiat_currency: string; ads: number; sellers: number }[]>`
    SELECT
      fiat_currency,
      count(*)::int AS ads,
      count(DISTINCT user_id)::int AS sellers
    FROM p2p_ad
    WHERE status = 'online'
      AND asset_id = ${usdtAssetId}::uuid
      AND user_id IN (SELECT id FROM app_user WHERE email = ANY(${botEmails}))
    GROUP BY fiat_currency
    ORDER BY fiat_currency
  `;

  const totals = await sql<{ total_ads: number; total_sellers: number }[]>`
    SELECT
      count(*)::int AS total_ads,
      count(DISTINCT user_id)::int AS total_sellers
    FROM p2p_ad
    WHERE status = 'online'
      AND asset_id = ${usdtAssetId}::uuid
      AND user_id IN (SELECT id FROM app_user WHERE email = ANY(${botEmails}))
  `;

  return {
    totalAds: totals[0]?.total_ads ?? 0,
    totalSellers: totals[0]?.total_sellers ?? 0,
    byFiat,
  };
}

async function main() {
  const sql = getSql();

  try {
    const adsPerSide = Math.max(1, Number(process.env.P2P_SEED_ADS_PER_SIDE ?? 2));
    const closeExistingBotAds = String(process.env.P2P_SEED_CLOSE_EXISTING ?? "1") !== "0";
    const result = await seedP2PMarket(sql, { closeExistingBotAds, adsPerSide });

    const sample = await sql<{ display_name: string | null; side: string; fiat_currency: string; fixed_price: string; remaining_amount: string }[]>`
      SELECT
        u.display_name,
        a.side,
        a.fiat_currency,
        a.fixed_price::text,
        a.remaining_amount::text
      FROM p2p_ad a
      JOIN app_user u ON u.id = a.user_id
      WHERE a.status = 'online'
        AND a.asset_id = (SELECT id FROM ex_asset WHERE chain='bsc' AND symbol='USDT' LIMIT 1)
        AND u.email = ANY(${BOT_PROFILES.map((b) => b.email)})
      ORDER BY a.fiat_currency, a.side, a.fixed_price ASC
      LIMIT 16
    `;

    console.log(`✅ P2P market seed complete (SELL + BUY) adsPerSide=${adsPerSide} closeExisting=${closeExistingBotAds}`);
    console.table(result.byFiat);
    console.log(`Total online bot ads: ${result.totalAds} across ${result.totalSellers} sellers`);
    console.table(sample);
  } catch (error) {
    console.error("❌ Failed to seed P2P market:", error);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }
}

const isDirectRun = (process.argv[1] ?? "").replace(/\\/g, "/").endsWith("/seed-p2p-sellers.ts");

if (isDirectRun) {
  main();
}
