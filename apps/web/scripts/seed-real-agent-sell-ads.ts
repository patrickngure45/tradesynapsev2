import "dotenv/config";

import { getSql } from "../src/lib/db";
import { getOrComputeFxReferenceRate } from "../src/lib/fx/reference";
import { getExternalIndexUsdt } from "../src/lib/market/indexPrice";

type AgentRow = {
  user_id: string;
  email: string;
  country: string | null;
  mpesa_method_ids: string[];
};

type AssetRow = {
  id: string;
  symbol: string;
  chain: string;
  decimals: number;
};

type AvailRow = {
  available: string;
};

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function roundFiat(fiat: string, value: number): number {
  // Conservative: most fiat display uses 2 decimals; KES is often 2 in apps even if cash is 0.
  const f = fiat.toUpperCase();
  const decimals = f === "JPY" ? 0 : 2;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function floorToDecimals(value: number, decimals: number): number {
  const d = Math.max(0, Math.min(18, Math.trunc(decimals)));
  const factor = 10 ** d;
  return Math.floor(value * factor) / factor;
}

async function ensureLedgerAccount(sql: ReturnType<typeof getSql>, userId: string, assetId: string): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO ex_ledger_account (user_id, asset_id)
    VALUES (${userId}::uuid, ${assetId}::uuid)
    ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
    RETURNING id::text AS id
  `;
  return rows[0]!.id;
}

async function availableForAccount(sql: ReturnType<typeof getSql>, accountId: string): Promise<string> {
  const rows = await sql<AvailRow[]>`
    WITH posted AS (
      SELECT coalesce(sum(amount), 0)::numeric AS posted
      FROM ex_journal_line
      WHERE account_id = ${accountId}::uuid
    ),
    held AS (
      SELECT coalesce(sum(remaining_amount), 0)::numeric AS held
      FROM ex_hold
      WHERE account_id = ${accountId}::uuid AND status = 'active'
    )
    SELECT (posted.posted - held.held)::text AS available
    FROM posted, held
  `;
  return rows[0]?.available ?? "0";
}

async function main() {
  const sql = getSql();

  const fiat = (argValue("--fiat") ?? "KES").trim().toUpperCase();
  const execute = hasFlag("--execute");

  const minUsd = clamp(Number(process.env.P2P_MIN_TRADE_USD ?? argValue("--min-usd") ?? "5"), 0.5, 10_000);
  const maxUsd = clamp(Number(process.env.P2P_MAX_TRADE_USD ?? argValue("--max-usd") ?? "2000"), minUsd, 100_000);
  const adTotalUsd = clamp(Number(process.env.P2P_AGENT_AD_TOTAL_USD ?? argValue("--ad-total-usd") ?? "10000"), maxUsd, 500_000);

  const sellSpreadPct = clamp(Number(process.env.P2P_SELL_SPREAD_PCT ?? argValue("--sell-spread-pct") ?? "0.01"), 0, 0.25);

  // Optional override for environments without outbound FX access.
  const usdFiatMidOverride = argValue("--usd-fiat-mid");
  if (usdFiatMidOverride) {
    process.env[`FX_USD_FIAT_OVERRIDE_${fiat}`] = usdFiatMidOverride;
  }

  // Agents = active users with enabled M-Pesa method.
  const agents = await sql<AgentRow[]>`
    SELECT
      u.id::text AS user_id,
      lower(u.email) AS email,
      u.country,
      (
        SELECT coalesce(array_agg(pm.id::text ORDER BY pm.created_at DESC), ARRAY[]::text[])
        FROM p2p_payment_method pm
        WHERE pm.user_id = u.id
          AND pm.is_enabled = true
          AND lower(pm.identifier) = 'mpesa'
      ) AS mpesa_method_ids
    FROM app_user u
    WHERE u.status = 'active'
      AND u.email IS NOT NULL
      AND coalesce(u.role, 'user') <> 'admin'
    ORDER BY lower(u.email)
  `;

  const agentList = agents.filter((a) => a.mpesa_method_ids.length > 0);
  if (agentList.length === 0) {
    console.log(JSON.stringify({ ok: false, error: "no_agents_with_mpesa", fiat }, null, 2));
    return;
  }

  const assets = await sql<AssetRow[]>`
    SELECT id::text AS id, symbol, chain, decimals
    FROM ex_asset
    WHERE chain = 'bsc'
      AND is_enabled = true
    ORDER BY symbol ASC
  `;

  const usdtFiat = await getOrComputeFxReferenceRate(sql as any, "USDT", fiat);
  if (!usdtFiat?.mid) {
    console.log(JSON.stringify({ ok: false, error: "fx_unavailable", base: "USDT", quote: fiat }, null, 2));
    return;
  }

  const minFiat = Math.ceil(minUsd * usdtFiat.mid);
  const maxFiatGlobal = Math.floor(maxUsd * usdtFiat.mid);

  const plan: Array<Record<string, unknown>> = [];

  for (const agent of agentList) {
    const paymentMethodIds = agent.mpesa_method_ids.slice(0, 1);

    for (const asset of assets) {
      const sym = asset.symbol.toUpperCase();
      if (!sym) continue;

      const accountId = await ensureLedgerAccount(sql, agent.user_id, asset.id);
      const availableStr = await availableForAccount(sql, accountId);
      const available = Number(availableStr);
      if (!(Number.isFinite(available) && available > 0)) continue;

      // Price discovery: asset/fiat reference mid.
      const ref = await getOrComputeFxReferenceRate(sql as any, sym, fiat);
      if (!ref?.mid) continue;

      const sellPrice = roundFiat(fiat, ref.mid * (1 + sellSpreadPct));
      if (!(Number.isFinite(sellPrice) && sellPrice > 0)) continue;

      // Cap per-ad inventory to a USD amount (so we don't post unrealistic huge ads).
      const usdtPerAsset = sym === "USDT" ? 1 : (await getExternalIndexUsdt(sym))?.mid ?? null;
      const pxUsdt = typeof usdtPerAsset === "number" && Number.isFinite(usdtPerAsset) && usdtPerAsset > 0 ? usdtPerAsset : null;
      if (!pxUsdt) continue;

      const targetTotalAsset = adTotalUsd / pxUsdt;
      const totalAmount = floorToDecimals(Math.min(available, targetTotalAsset), Math.min(18, asset.decimals));
      if (!(Number.isFinite(totalAmount) && totalAmount > 0)) continue;

      const maxByLiquidity = Math.floor(totalAmount * sellPrice);
      const maxFiat = Math.min(maxFiatGlobal, maxByLiquidity);
      if (maxFiat < minFiat) continue;

      plan.push({
        agent_email: agent.email,
        agent_user_id: agent.user_id,
        asset: sym,
        fiat,
        side: "SELL",
        price: sellPrice,
        total_amount: totalAmount,
        min_limit: minFiat,
        max_limit: maxFiat,
        payment_method_ids: paymentMethodIds,
        available,
      });

      if (execute) {
        // Close old ads for this same agent/asset/fiat/side.
        await sql`
          UPDATE p2p_ad
          SET status = 'closed', remaining_amount = 0, updated_at = now()
          WHERE user_id = ${agent.user_id}::uuid
            AND asset_id = ${asset.id}::uuid
            AND fiat_currency = ${fiat}
            AND side = 'SELL'
            AND status IN ('online', 'offline')
        `;

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
            payment_method_ids,
            reference_mid,
            reference_sources,
            reference_computed_at,
            price_band_pct
          ) VALUES (
            ${agent.user_id}::uuid,
            'SELL',
            ${asset.id}::uuid,
            ${fiat},
            'fixed',
            ${sellPrice},
            ${totalAmount},
            ${totalAmount},
            ${minFiat},
            ${maxFiat},
            15,
            ${"Fast release. M-Pesa Send Money."},
            'online',
            ${JSON.stringify(paymentMethodIds)}::jsonb,
            ${ref.mid},
            ${JSON.stringify(ref.sources ?? {})}::jsonb,
            ${ref.computedAt.toISOString()}::timestamptz,
            ${ref.mid ? 0.02 : null}
          )
        `;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        execute,
        fiat,
        min_usd: minUsd,
        max_usd: maxUsd,
        usdt_fiat_mid: usdtFiat.mid,
        min_fiat: minFiat,
        max_fiat_global: maxFiatGlobal,
        agents: agentList.map((a) => a.email),
        planned_ads: plan.length,
        sample: plan.slice(0, 20),
      },
      null,
      2,
    ),
  );

  await sql.end({ timeout: 5 }).catch(() => undefined);
}

main().catch((err) => {
  console.error("seed-real-agent-sell-ads failed:", err);
  process.exit(1);
});
