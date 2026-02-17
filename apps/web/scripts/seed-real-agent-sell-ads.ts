import "dotenv/config";

import { createSql, getSql } from "../src/lib/db";
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

type AssetAvailRow = {
  asset_id: string;
  symbol: string;
  decimals: number;
  available: string;
};

type PriceCache = {
  sym: string;
  pxUsdt: number; // USDT per asset (1 for USDT)
  refMidFiat: number; // fiat per asset
  sources: Record<string, unknown>;
  computedAt: Date;
};

function fnv1a32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function agentJitterPct(agentKey: string): number {
  // Stable per-agent jitter so prices look human but don't change every refresh.
  // Range: ±0.8%.
  const maxAbs = 0.008;
  const h = fnv1a32(agentKey.trim().toLowerCase());
  const u = (h % 10_000) / 10_000; // [0,1)
  const centered = (u - 0.5) * 2; // [-1,1)
  return centered * maxAbs;
}

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

async function ensureAllLedgerAccounts(sql: ReturnType<typeof getSql>, userId: string): Promise<void> {
  await sql`
    INSERT INTO ex_ledger_account (user_id, asset_id)
    SELECT ${userId}::uuid, a.id
    FROM ex_asset a
    WHERE a.chain = 'bsc' AND a.is_enabled = true
    ON CONFLICT (user_id, asset_id) DO NOTHING
  `;
}

async function loadAvailableByAsset(sql: ReturnType<typeof getSql>, userId: string): Promise<AssetAvailRow[]> {
  return await sql<AssetAvailRow[]>`
    WITH accts AS (
      SELECT
        ela.id AS account_id,
        a.id::text AS asset_id,
        a.symbol,
        a.decimals
      FROM ex_ledger_account ela
      JOIN ex_asset a ON a.id = ela.asset_id
      WHERE ela.user_id = ${userId}::uuid
        AND a.chain = 'bsc'
        AND a.is_enabled = true
    ),
    posted AS (
      SELECT jl.account_id, coalesce(sum(jl.amount), 0)::numeric AS posted
      FROM ex_journal_line jl
      WHERE jl.account_id IN (SELECT account_id FROM accts)
      GROUP BY jl.account_id
    ),
    held AS (
      SELECT h.account_id, coalesce(sum(h.remaining_amount), 0)::numeric AS held
      FROM ex_hold h
      WHERE h.status = 'active'
        AND h.account_id IN (SELECT account_id FROM accts)
      GROUP BY h.account_id
    )
    SELECT
      accts.asset_id,
      accts.symbol,
      accts.decimals,
      (coalesce(posted.posted, 0) - coalesce(held.held, 0))::text AS available
    FROM accts
    LEFT JOIN posted ON posted.account_id = accts.account_id
    LEFT JOIN held ON held.account_id = accts.account_id
  `;
}

function isTransientDbError(err: unknown): boolean {
  const e = err as any;
  const code = typeof e?.code === "string" ? e.code : "";
  const msg = typeof e?.message === "string" ? e.message : "";

  // Common transient cases for hosted DBs / local networks.
  if (
    code === "ENOTFOUND" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "EAI_AGAIN" ||
    code === "CONNECT_TIMEOUT"
  ) {
    return true;
  }
  if (msg.includes("getaddrinfo ENOTFOUND")) return true;
  if (msg.includes("Connection terminated unexpectedly")) return true;
  if (msg.includes("CONNECT_TIMEOUT")) return true;
  return false;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function runOnce() {
  const sql = createSql();

  const fiat = (argValue("--fiat") ?? "KES").trim().toUpperCase();
  const execute = hasFlag("--execute");
  const allowP2pFx = hasFlag("--allow-p2p-fx");

  const minUsd = clamp(Number(process.env.P2P_MIN_TRADE_USD ?? argValue("--min-usd") ?? "5"), 0.5, 10_000);
  const maxUsd = clamp(Number(process.env.P2P_MAX_TRADE_USD ?? argValue("--max-usd") ?? "2000"), minUsd, 100_000);
  const adTotalUsd = clamp(Number(process.env.P2P_AGENT_AD_TOTAL_USD ?? argValue("--ad-total-usd") ?? "10000"), maxUsd, 500_000);

  const sellSpreadPct = clamp(Number(process.env.P2P_SELL_SPREAD_PCT ?? argValue("--sell-spread-pct") ?? "0.01"), 0, 0.25);

  // Optional override for environments without outbound FX access.
  const usdFiatMidOverride = argValue("--usd-fiat-mid");
  if (usdFiatMidOverride) {
    process.env[`FX_USD_FIAT_OVERRIDE_${fiat}`] = usdFiatMidOverride;
  }

  // For real market pricing, this script relies on external crypto indexes.
  // Default to a single high-liquidity exchange for speed unless configured.
  if (!process.env.MARKETS_INDEX_EXCHANGES) {
    process.env.MARKETS_INDEX_EXCHANGES = "binance";
  }

  try {
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

    const usdtFiatQuote = usdtFiat;

    const usdtFxKind = String((usdtFiatQuote.sources as any)?.kind ?? "");
    if (execute && !allowP2pFx && usdtFxKind === "p2p_fixed_top") {
    console.log(
      JSON.stringify(
        {
          ok: false,
          error: "fx_not_market_based",
          base: "USDT",
          quote: fiat,
          kind: usdtFxKind,
          computed_at: usdtFiatQuote.computedAt.toISOString(),
          hint: "Refusing to create real ads using an internal P2P-derived USDT/fiat rate. Fix outbound FX access or rerun with --allow-p2p-fx if you explicitly accept that source.",
        },
        null,
        2,
      ),
    );
      process.exitCode = 2;
      return;
    }

    const minFiat = Math.ceil(minUsd * usdtFiatQuote.mid);
    const maxFiatGlobal = Math.floor(maxUsd * usdtFiatQuote.mid);

    const plan: Array<Record<string, unknown>> = [];

    let created = 0;
    let priced = 0;
    let skippedNoPrice = 0;
    let skippedTooSmall = 0;
    let skippedBadBalance = 0;

    const priceCache = new Map<string, PriceCache>();

    async function getPrice(symRaw: string): Promise<PriceCache | null> {
    const sym = symRaw.toUpperCase();
    const cached = priceCache.get(sym);
    if (cached) return cached;

    if (sym === "USDT") {
      const out: PriceCache = {
        sym,
        pxUsdt: 1,
        refMidFiat: usdtFiatQuote.mid,
        sources: { kind: "seed_usdt_fiat", usdt_fiat_sources: usdtFiatQuote.sources },
        computedAt: new Date(),
      };
      priceCache.set(sym, out);
      priced++;
      return out;
    }

    const q = await getExternalIndexUsdt(sym);
    const baseUsdtMid = q?.mid;
    if (!(typeof baseUsdtMid === "number" && Number.isFinite(baseUsdtMid) && baseUsdtMid > 0)) return null;

    const refMid = baseUsdtMid * usdtFiatQuote.mid;
    if (!(Number.isFinite(refMid) && refMid > 0)) return null;

    const out: PriceCache = {
      sym,
      pxUsdt: baseUsdtMid,
      refMidFiat: refMid,
      sources: {
        kind: "seed_chained_external_index_usdt",
        base: sym,
        quote: fiat,
        base_usdt_mid: baseUsdtMid,
        base_usdt_sources_used: q?.sourcesUsed ?? null,
        base_usdt_dispersion_bps: q?.dispersionBps ?? null,
        usdt_fiat_mid: usdtFiatQuote.mid,
        usdt_fiat_sources: usdtFiatQuote.sources,
      },
      computedAt: new Date(),
    };

    priceCache.set(sym, out);
    priced++;
    return out;
  }

    const startedAt = Date.now();
    let createdOrPlanned = 0;
    console.error(
      `Seeding real-agent SELL ads: agents=${agentList.length}, assets=${assets.length}, fiat=${fiat}, execute=${execute}, usdt_${fiat}_mid=${usdtFiat.mid} (${usdtFxKind})` +
        (usdFiatMidOverride ? ` [override=${usdFiatMidOverride}]` : ""),
    );

    for (const agent of agentList) {
    const paymentMethodIds = agent.mpesa_method_ids.slice(0, 1);

    console.error(`Agent ${agent.email}: start`);

    await ensureAllLedgerAccounts(sql, agent.user_id);
    const avails = await loadAvailableByAsset(sql, agent.user_id);
    const positive = avails
      .map((r) => ({ ...r, availableNum: Number(r.available) }))
      .filter((r) => Number.isFinite(r.availableNum) && r.availableNum > 0);

    console.error(`Agent ${agent.email}: balances=${positive.length} assets (of ${avails.length})`);

    const jitter = agentJitterPct(agent.email);
    const spreadTotal = sellSpreadPct + jitter;

    for (const row of positive) {
      const sym = row.symbol.toUpperCase();
      if (!sym) continue;

      const available = row.availableNum;
      if (!(Number.isFinite(available) && available > 0)) {
        skippedBadBalance++;
        continue;
      }

      const px = await getPrice(sym);
      if (!px) {
        skippedNoPrice++;
        continue;
      }

      const sellPrice = roundFiat(fiat, px.refMidFiat * (1 + spreadTotal));
      if (!(Number.isFinite(sellPrice) && sellPrice > 0)) {
        skippedNoPrice++;
        continue;
      }

      const targetTotalAsset = adTotalUsd / px.pxUsdt;
      const totalAmount = floorToDecimals(Math.min(available, targetTotalAsset), Math.min(18, row.decimals));
      if (!(Number.isFinite(totalAmount) && totalAmount > 0)) continue;

      const maxByLiquidity = Math.floor(totalAmount * sellPrice);
      const maxFiat = Math.min(maxFiatGlobal, maxByLiquidity);
      if (maxFiat < minFiat) {
        skippedTooSmall++;
        continue;
      }

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

      createdOrPlanned++;
      if (createdOrPlanned % 50 === 0) {
        const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
        console.error(`Progress: ${createdOrPlanned} ads processed (${elapsedSec}s)`);
      }

      if (execute) {
        // Close old ads for this same agent/asset/fiat/side.
        await sql`
          UPDATE p2p_ad
          SET status = 'closed', remaining_amount = 0, updated_at = now()
          WHERE user_id = ${agent.user_id}::uuid
            AND asset_id = ${row.asset_id}::uuid
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
            ${row.asset_id}::uuid,
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
            ${sql.json(paymentMethodIds)}::jsonb,
            ${px.refMidFiat},
            ${JSON.stringify({
              ...(px.sources ?? {}),
              seed_sell_spread_pct: sellSpreadPct,
              agent_jitter_pct: jitter,
              applied_sell_spread_pct: spreadTotal,
            })}::jsonb,
            ${px.computedAt.toISOString()}::timestamptz,
            ${px.refMidFiat ? 0.02 : null}
          )
        `;

        created++;
        if (created % 25 === 0) {
          const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
          console.error(`Created: ${created} ads (${elapsedSec}s)`);
        }
      }
    }

    console.error(`Agent ${agent.email}: done`);
  }

    console.log(
      JSON.stringify(
        {
          ok: true,
          execute,
          fiat,
          min_usd: minUsd,
          max_usd: maxUsd,
          usdt_fiat_mid: usdtFiatQuote.mid,
          usdt_fiat_computed_at: usdtFiatQuote.computedAt.toISOString(),
          usdt_fiat_sources: usdtFiatQuote.sources,
          index_exchanges: process.env.MARKETS_INDEX_EXCHANGES,
          min_fiat: minFiat,
          max_fiat_global: maxFiatGlobal,
          agents: agentList.map((a) => a.email),
          planned_ads: plan.length,
          created_ads: created,
          priced_assets: priced,
          skipped_no_price: skippedNoPrice,
          skipped_too_small: skippedTooSmall,
          skipped_bad_balance: skippedBadBalance,
          sample: plan.slice(0, 20),
        },
        null,
        2,
      ),
    );
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }
}

async function main() {
  const maxAttempts = clamp(Number(argValue("--attempts") ?? process.env.P2P_SEED_ATTEMPTS ?? "4"), 1, 10);
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await runOnce();
      return;
    } catch (err) {
      lastErr = err;
      if (!isTransientDbError(err) || attempt === maxAttempts) throw err;

      const backoffMs = 750 * attempt;
      console.error(
        `seed-real-agent-sell-ads transient failure (attempt ${attempt}/${maxAttempts}); retrying in ${backoffMs}ms...`,
      );
      await sleep(backoffMs);
    }
  }

  if (lastErr) throw lastErr;
}

main().catch((err) => {
  console.error("seed-real-agent-sell-ads failed:", err);
  process.exit(1);
});
