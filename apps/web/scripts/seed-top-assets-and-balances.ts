/// <reference types="node" />

import "dotenv/config";

import { getSql } from "../src/lib/db";

const CHAIN = "bsc" as const;

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

type SeedAsset = {
  symbol: string;
  name: string;
  decimals: number;
};

// NOTE: This list is derived from the user-provided tickers in-chat.
// It is not meant to be authoritative market-cap data, only a convenient seed list.
const TOP_ASSETS: SeedAsset[] = [
  { symbol: "BTC", name: "Bitcoin", decimals: 18 },
  { symbol: "ETH", name: "Ethereum", decimals: 18 },
  { symbol: "USDT", name: "Tether", decimals: 18 },
  { symbol: "BNB", name: "BNB", decimals: 18 },
  { symbol: "XRP", name: "XRP", decimals: 18 },
  { symbol: "USDC", name: "USD Coin", decimals: 18 },
  { symbol: "SOL", name: "Solana", decimals: 18 },
  { symbol: "ADA", name: "Cardano", decimals: 18 },
  { symbol: "DOGE", name: "Dogecoin", decimals: 18 },
  { symbol: "TRX", name: "TRON", decimals: 18 },
  { symbol: "AVAX", name: "Avalanche", decimals: 18 },
  { symbol: "MATIC", name: "Polygon", decimals: 18 },
  { symbol: "DOT", name: "Polkadot", decimals: 18 },
  { symbol: "SHIB", name: "Shiba Inu", decimals: 18 },
  { symbol: "WBTC", name: "Wrapped Bitcoin", decimals: 18 },
  { symbol: "LINK", name: "Chainlink", decimals: 18 },
  { symbol: "LTC", name: "Litecoin", decimals: 18 },
  { symbol: "UNI", name: "Uniswap", decimals: 18 },
  { symbol: "ICP", name: "Internet Computer", decimals: 18 },
  { symbol: "ALGO", name: "Algorand", decimals: 18 },
  { symbol: "FTM", name: "Fantom", decimals: 18 },
  { symbol: "TON", name: "Toncoin", decimals: 18 },
  { symbol: "ATOM", name: "Cosmos", decimals: 18 },
  { symbol: "HBAR", name: "Hedera", decimals: 18 },
  { symbol: "NEAR", name: "NEAR Protocol", decimals: 18 },
  { symbol: "XLM", name: "Stellar", decimals: 18 },
  { symbol: "SUI", name: "Sui", decimals: 18 },
  { symbol: "APE", name: "ApeCoin", decimals: 18 },
  { symbol: "AAVE", name: "Aave", decimals: 18 },
  { symbol: "CRV", name: "Curve DAO Token", decimals: 18 },
  { symbol: "GRT", name: "The Graph", decimals: 18 },
  { symbol: "SAND", name: "The Sandbox", decimals: 18 },
  { symbol: "MANA", name: "Decentraland", decimals: 18 },
  { symbol: "LDO", name: "Lido DAO", decimals: 18 },
  { symbol: "EOS", name: "EOS", decimals: 18 },
  { symbol: "ZEC", name: "Zcash", decimals: 18 },
  { symbol: "KSM", name: "Kusama", decimals: 18 },
  { symbol: "CHZ", name: "Chiliz", decimals: 18 },
  { symbol: "MKR", name: "Maker", decimals: 18 },
  { symbol: "FTT", name: "FTX Token", decimals: 18 },
  { symbol: "BCH", name: "Bitcoin Cash", decimals: 18 },
  { symbol: "DASH", name: "Dash", decimals: 18 },
  { symbol: "ENJ", name: "Enjin Coin", decimals: 18 },
  { symbol: "CEL", name: "Celsius", decimals: 18 },
  { symbol: "RUNE", name: "THORChain", decimals: 18 },
  { symbol: "AXS", name: "Axie Infinity", decimals: 18 },
  { symbol: "USTC", name: "TerraClassicUSD", decimals: 18 },
  { symbol: "OKB", name: "OKB", decimals: 18 },
  { symbol: "BSV", name: "Bitcoin SV", decimals: 18 },
  { symbol: "MINA", name: "Mina", decimals: 18 },
  { symbol: "QNT", name: "Quant", decimals: 18 },
  { symbol: "KLAY", name: "Klaytn", decimals: 18 },
  { symbol: "OSMO", name: "Osmosis", decimals: 18 },
  { symbol: "BAT", name: "Basic Attention Token", decimals: 18 },
  { symbol: "IOST", name: "IOST", decimals: 18 },
  { symbol: "ANKR", name: "Ankr Network", decimals: 18 },
  { symbol: "PEPE", name: "Pepe", decimals: 18 },
  { symbol: "SPELL", name: "Spell Token", decimals: 18 },
  { symbol: "GMX", name: "GMX", decimals: 18 },
  { symbol: "WAVES", name: "Waves", decimals: 18 },
  { symbol: "FLOW", name: "Flow", decimals: 18 },
  { symbol: "SXP", name: "Swipe", decimals: 18 },
  { symbol: "CELR", name: "Celer Network", decimals: 18 },
  { symbol: "REV", name: "Revain", decimals: 18 },
  { symbol: "ZIL", name: "Zilliqa", decimals: 18 },
  { symbol: "NEXO", name: "Nexo", decimals: 18 },
  { symbol: "KAVA", name: "Kava", decimals: 18 },
  { symbol: "GALA", name: "Gala", decimals: 18 },
  { symbol: "BORA", name: "BORA", decimals: 18 },
  { symbol: "RAY", name: "Raydium", decimals: 18 },
  { symbol: "ILLU", name: "Illuvium", decimals: 18 },
  { symbol: "STX", name: "Stacks", decimals: 18 },
  { symbol: "GLM", name: "Golem", decimals: 18 },
  { symbol: "CVX", name: "Convex Finance", decimals: 18 },
  { symbol: "RAD", name: "Radical", decimals: 18 },
  { symbol: "LRC", name: "Loopring", decimals: 18 },
  { symbol: "DCR", name: "Decred", decimals: 18 },
  { symbol: "WOO", name: "WOO Network", decimals: 18 },
  { symbol: "OCEAN", name: "Ocean Protocol", decimals: 18 },
  { symbol: "RSR", name: "Reserve Rights", decimals: 18 },
  { symbol: "BAL", name: "Balancer", decimals: 18 },
  { symbol: "TRB", name: "Tellor", decimals: 18 },
  { symbol: "API3", name: "API3", decimals: 18 },
  { symbol: "NANO", name: "Nano", decimals: 18 },
  { symbol: "LPT", name: "Livepeer", decimals: 18 },
  { symbol: "FXS", name: "Frax Share", decimals: 18 },
  { symbol: "VEA", name: "Vea", decimals: 18 },
  { symbol: "COMP", name: "Compound", decimals: 18 },
  { symbol: "UMA", name: "UMA", decimals: 18 },
  { symbol: "YFI", name: "Yearn Finance", decimals: 18 },
  { symbol: "1INCH", name: "1inch", decimals: 18 },
  { symbol: "TOMO", name: "TomoChain", decimals: 18 },
  { symbol: "STRAX", name: "Stratis", decimals: 18 },
  { symbol: "AKT", name: "Akash Network", decimals: 18 },
  { symbol: "FET", name: "Fetch.ai", decimals: 18 },
  { symbol: "MDX", name: "Mdex", decimals: 18 },
  { symbol: "COTI", name: "COTI", decimals: 18 },
  { symbol: "NMR", name: "Numeraire", decimals: 18 },
  { symbol: "BAND", name: "Band Protocol", decimals: 18 }
];

function parseFixedBalancesFromEnv(): Record<string, number> {
  // Prefer JSON: {"BTC":0.01,"ETH":0.2,"USDT":1000}
  const json = process.env.DEMO_FIXED_BALANCES_JSON?.trim();
  if (json) {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const symbol = String(k).trim().toUpperCase();
      const n = Number(v);
      if (!symbol) continue;
      if (!Number.isFinite(n) || n < 0) continue;
      out[symbol] = n;
    }
    return out;
  }

  // CSV: BTC=0.01,ETH=0.2,USDT=1000
  const csv = process.env.DEMO_FIXED_BALANCES?.trim();
  if (!csv) return {};
  const out: Record<string, number> = {};
  for (const part of csv.split(",")) {
    const [rawKey, rawVal] = part.split("=");
    const symbol = String(rawKey ?? "").trim().toUpperCase();
    const n = Number(String(rawVal ?? "").trim());
    if (!symbol) continue;
    if (!Number.isFinite(n) || n < 0) continue;
    out[symbol] = n;
  }
  return out;
}

async function ensureSystemUser(sql: ReturnType<typeof getSql>): Promise<void> {
  await sql`
    INSERT INTO app_user (id, status, kyc_level, country)
    VALUES (${SYSTEM_USER_ID}::uuid, 'active', 'full', 'ZZ')
    ON CONFLICT (id) DO NOTHING
  `;
}

async function getOrCreateAsset(sql: ReturnType<typeof getSql>, asset: SeedAsset): Promise<string> {
  const symbol = asset.symbol.trim().toUpperCase();
  if (!symbol) throw new Error("asset.symbol is empty");

  const rows = await sql<{ id: string }[]>`
    INSERT INTO ex_asset (chain, symbol, name, contract_address, decimals, is_enabled)
    VALUES (${CHAIN}, ${symbol}, ${asset.name}, NULL, ${asset.decimals}, true)
    ON CONFLICT (chain, symbol) DO UPDATE
      SET is_enabled = true,
          name = COALESCE(ex_asset.name, EXCLUDED.name)
    RETURNING id
  `;

  return rows[0]!.id;
}

async function ensureLedgerAccount(sql: ReturnType<typeof getSql>, userId: string, assetId: string): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO ex_ledger_account (user_id, asset_id)
    VALUES (${userId}::uuid, ${assetId}::uuid)
    ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
    RETURNING id
  `;
  return rows[0]!.id;
}

async function getPosted(sql: ReturnType<typeof getSql>, accountId: string): Promise<number> {
  const rows = await sql<{ posted: string }[]>`
    SELECT coalesce(sum(amount), 0)::text AS posted
    FROM ex_journal_line
    WHERE account_id = ${accountId}::uuid
  `;
  const n = Number(rows[0]?.posted ?? "0");
  return Number.isFinite(n) ? n : 0;
}

async function resolveTargetUserId(sql: ReturnType<typeof getSql>): Promise<string> {
  const explicitId = process.env.DEMO_FIXED_BALANCE_USER_ID?.trim();
  if (explicitId) return explicitId;

  const email = (process.env.DEMO_FIXED_BALANCE_EMAIL?.trim() || "ngurengure10@gmail.com").trim();
  const rows = await sql<{ id: string }[]>`
    SELECT id
    FROM app_user
    WHERE email = ${email}
    LIMIT 1
  `;
  if (rows.length === 0) {
    throw new Error(
      `Could not find user by email=${email}. Set DEMO_FIXED_BALANCE_USER_ID or DEMO_FIXED_BALANCE_EMAIL.`
    );
  }
  return rows[0]!.id;
}

async function main() {
  const sql = getSql();

  const fixedBalances = parseFixedBalancesFromEnv();
  const defaultAmountRaw = process.env.DEMO_FIXED_BALANCE_DEFAULT?.trim();
  const defaultAmount = defaultAmountRaw ? Number(defaultAmountRaw) : 0;
  const shouldCredit = process.env.DEMO_FIXED_BALANCE_CREDIT !== "0";

  if (!Number.isFinite(defaultAmount) || defaultAmount < 0) {
    throw new Error("DEMO_FIXED_BALANCE_DEFAULT must be a non-negative number");
  }

  await ensureSystemUser(sql);
  const targetUserId = await resolveTargetUserId(sql);

  const seen = new Set<string>();
  const assetsDeduped = TOP_ASSETS.filter((a) => {
    const sym = a.symbol.trim().toUpperCase();
    if (!sym) return false;
    if (seen.has(sym)) return false;
    seen.add(sym);
    return true;
  });

  console.log(`[seed] Upserting ${assetsDeduped.length} assets into ex_asset (chain=${CHAIN})...`);
  const assetIdsBySymbol = new Map<string, string>();
  for (const asset of assetsDeduped) {
    const id = await getOrCreateAsset(sql, asset);
    assetIdsBySymbol.set(asset.symbol.toUpperCase(), id);
  }

  if (!shouldCredit) {
    console.log("[seed] DEMO_FIXED_BALANCE_CREDIT=0, skipping balance crediting.");
    return;
  }

  const symbolsToCredit = Array.from(assetIdsBySymbol.keys());
  const targets: Array<{ symbol: string; target: number; assetId: string }> = [];
  for (const symbol of symbolsToCredit) {
    const explicit = fixedBalances[symbol];
    const target = Number.isFinite(explicit) ? explicit : defaultAmount;
    if (!Number.isFinite(target) || target <= 0) continue;
    targets.push({ symbol, target, assetId: assetIdsBySymbol.get(symbol)! });
  }

  if (targets.length === 0) {
    console.log("[seed] No positive targets to set.");
    console.log("  Set DEMO_FIXED_BALANCES (CSV) or DEMO_FIXED_BALANCES_JSON (JSON),");
    console.log("  or set DEMO_FIXED_BALANCE_DEFAULT to a positive number.");
    return;
  }

  console.log(`[seed] Setting fixed demo balances for user=${targetUserId}... (${targets.length} assets)`);

  for (const { symbol, target, assetId } of targets) {
    const userAcct = await ensureLedgerAccount(sql, targetUserId, assetId);
    const sysAcct = await ensureLedgerAccount(sql, SYSTEM_USER_ID, assetId);

    const before = await getPosted(sql, userAcct);
    const delta = target - before;

    if (Math.abs(delta) < 1e-12) continue;

    await sql.begin(async (tx) => {
      const txSql = tx as unknown as typeof sql;

      const entryRows = await txSql<{ id: string }[]>`
        INSERT INTO ex_journal_entry (type, reference, metadata_json)
        VALUES (
          'demo_set_balance',
          ${`demo_set_balance:${symbol}`},
          ${{ chain: CHAIN, symbol, target }}::jsonb
        )
        RETURNING id
      `;
      const entryId = entryRows[0]!.id;

      // Apply delta to user; keep the system as counterparty so per-asset sum remains 0.
      await txSql`
        INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
        VALUES
          (${entryId}::uuid, ${userAcct}::uuid, ${assetId}::uuid, (${delta}::numeric)),
          (${entryId}::uuid, ${sysAcct}::uuid, ${assetId}::uuid, ((${delta}::numeric) * -1))
      `;
    });

    const after = await getPosted(sql, userAcct);
    console.log(`[seed] ${symbol}: ${before} -> ${after} (target=${target})`);
  }

  console.log("[seed] Done.");
  console.log("  Wallet/Portfolio will now show these balances per asset.");
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
