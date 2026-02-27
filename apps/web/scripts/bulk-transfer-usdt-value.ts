import "dotenv/config";

import { getSql } from "../src/lib/db";
import { requestUserTransfer } from "../src/lib/exchange/userTransfer";

type AssetRow = {
  id: string;
  symbol: string;
  chain: string;
};

type PriceRow = {
  price: string;
  base_symbol: string;
  quote_symbol: string;
};

type UserRow = {
  id: string;
  email: string | null;
};

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function usage(): never {
  console.error(
    [
      "Usage: tsx scripts/bulk-transfer-usdt-value.ts ",
      "  --recipient <email> ",
      "  [--acting-email <email>] [--acting-user-id <uuid>] ",
      "  [--usdt 5000] [--chain bsc] [--limit N] [--dry-run]",
      "\n\nNotes:",
      "- Transfers each enabled asset on the chain for an amount worth <usdt> using latest ex_execution price vs USDT.",
      "- Skips assets that do not have a recent USDT price.",
    ].join("\n"),
  );
  process.exit(2);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function formatAmount3818(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  const fixed = value
    .toFixed(18)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1");
  return fixed.length ? fixed : "0";
}

async function getLatestPairPrice(
  sql: ReturnType<typeof getSql>,
  chain: string,
  baseSymbol: string,
  quoteSymbol: string,
): Promise<number | null> {
  const rows = await sql<PriceRow[]>`
    SELECT
      e.price::text AS price,
      b.symbol AS base_symbol,
      q.symbol AS quote_symbol
    FROM ex_execution e
    JOIN ex_market m ON m.id = e.market_id
    JOIN ex_asset b ON b.id = m.base_asset_id
    JOIN ex_asset q ON q.id = m.quote_asset_id
    WHERE m.chain = ${chain}
      AND m.status = 'enabled'
      AND (
        (b.symbol = ${baseSymbol} AND q.symbol = ${quoteSymbol})
        OR
        (b.symbol = ${quoteSymbol} AND q.symbol = ${baseSymbol})
      )
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) return null;
  const px = Number(row.price);
  if (!Number.isFinite(px) || px <= 0) return null;

  if (row.base_symbol === baseSymbol && row.quote_symbol === quoteSymbol) return px;
  if (row.base_symbol === quoteSymbol && row.quote_symbol === baseSymbol) return 1 / px;
  return null;
}

async function resolveActingUserId(sql: ReturnType<typeof getSql>): Promise<string> {
  const fromArg = argValue("--acting-user-id")?.trim();
  if (fromArg) {
    if (!isUuid(fromArg)) throw new Error(`Invalid --acting-user-id: ${fromArg}`);
    return fromArg;
  }

  const actingEmail = (argValue("--acting-email") ?? process.env.ACTING_USER_EMAIL ?? "ngurengure10@gmail.com")
    .trim()
    .toLowerCase();

  const rows = await sql<UserRow[]>`
    SELECT id::text AS id, email
    FROM app_user
    WHERE lower(email) = ${actingEmail}
    LIMIT 1
  `;
  const user = rows[0];
  if (!user) throw new Error(`Acting user not found by email: ${actingEmail}`);
  return user.id;
}

async function main() {
  const recipient = (argValue("--recipient") ?? "").trim();
  if (!recipient) usage();

  const chain = (argValue("--chain") ?? "bsc").trim().toLowerCase();
  const usdtValue = Number(argValue("--usdt") ?? "5000");
  const limit = Math.max(0, Math.min(10_000, Number(argValue("--limit") ?? "0") || 0));
  const dryRun = hasFlag("--dry-run");

  if (!Number.isFinite(usdtValue) || usdtValue <= 0) {
    throw new Error(`Invalid --usdt value: ${String(argValue("--usdt"))}`);
  }

  const sql = getSql();
  const actingUserId = await resolveActingUserId(sql);

  const assets = await sql<AssetRow[]>`
    SELECT id::text AS id, symbol, chain
    FROM ex_asset
    WHERE chain = ${chain}
      AND is_enabled = true
    ORDER BY symbol ASC
  `;

  const startedAt = new Date().toISOString();
  console.log(
    JSON.stringify(
      {
        startedAt,
        chain,
        recipient,
        actingUserId,
        usdtValue,
        enabledAssets: assets.length,
        dryRun,
      },
      null,
      2,
    ),
  );

  let processed = 0;
  let skippedNoPrice = 0;
  let ok = 0;
  let failed = 0;

  const results: Array<
    | {
        symbol: string;
        assetId: string;
        status: "ok";
        transferId: string;
        amount: string;
        usdtPrice: number;
        fee: string;
      }
    | {
        symbol: string;
        assetId: string;
        status: "skipped_no_price";
      }
    | {
        symbol: string;
        assetId: string;
        status: "error";
        error: unknown;
      }
  > = [];

  for (const asset of assets) {
    if (limit > 0 && processed >= limit) break;
    processed++;

    const symbol = asset.symbol.trim().toUpperCase();

    // Determine price in USDT
    let usdtPrice = 1;
    if (symbol !== "USDT") {
      const px = await getLatestPairPrice(sql, chain, symbol, "USDT");
      if (!Number.isFinite(px as number) || (px as number) <= 0) {
        skippedNoPrice++;
        results.push({ symbol, assetId: asset.id, status: "skipped_no_price" });
        continue;
      }
      usdtPrice = px as number;
    }

    const amountNum = symbol === "USDT" ? usdtValue : usdtValue / usdtPrice;
    const amount = formatAmount3818(amountNum);
    if (amount === "0") {
      results.push({ symbol, assetId: asset.id, status: "error", error: "computed_amount_zero" });
      failed++;
      continue;
    }

    const reference = `bulk:${symbol}:${usdtValue}usdt:${startedAt}`;

    if (dryRun) {
      console.log(`[dry-run] ${symbol}: price=${usdtPrice} amount=${amount}`);
      continue;
    }

    try {
      const resp = await requestUserTransfer(sql, {
        actingUserId,
        assetId: asset.id,
        amount,
        recipientEmail: recipient,
        reference,
      });

      if (resp.status !== 201) {
        results.push({ symbol, assetId: asset.id, status: "error", error: resp.body });
        failed++;
        continue;
      }

      const t = resp.body.transfer;
      results.push({
        symbol,
        assetId: asset.id,
        status: "ok",
        transferId: t.id,
        amount,
        usdtPrice,
        fee: t.fees.total_debit_asset_amount,
      });
      ok++;

      if (ok % 10 === 0) {
        console.log(`[progress] ok=${ok} failed=${failed} skipped_no_price=${skippedNoPrice} processed=${processed}`);
      }
    } catch (e) {
      results.push({ symbol, assetId: asset.id, status: "error", error: e instanceof Error ? e.message : e });
      failed++;
    }
  }

  console.log(
    JSON.stringify(
      {
        finishedAt: new Date().toISOString(),
        processed,
        ok,
        failed,
        skippedNoPrice,
      },
      null,
      2,
    ),
  );

  // Emit a compact error summary
  const errorSymbols = results.filter((r) => r.status === "error").slice(0, 25);
  if (errorSymbols.length) {
    console.log("\nFirst errors (up to 25):");
    for (const r of errorSymbols) {
      console.log(`- ${r.symbol}:`, (r as any).error);
    }
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
