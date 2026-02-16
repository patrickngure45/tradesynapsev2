/// <reference types="node" />

import "dotenv/config";

import { getSql } from "../src/lib/db";
import { requestUserTransfer } from "../src/lib/exchange/userTransfer";
import { getExternalIndexUsdt } from "../src/lib/market/indexPrice";

type AgentRow = {
  id: string;
  email: string;
  role: string | null;
};

type AgentBalanceSummaryRow = {
  user_id: string;
  email: string;
  positive_assets: number;
  total_available: string;
};

type AssetRow = {
  id: string;
  symbol: string;
  decimals: number;
};

type PriceRow = {
  price: string;
  base_symbol: string;
  quote_symbol: string;
};

const SYSTEM_IDS = [
  "00000000-0000-0000-0000-000000000001",
  "00000000-0000-0000-0000-000000000002",
  "00000000-0000-0000-0000-000000000003",
] as const;

const DEFAULT_ADMIN_EMAIL = "ngurengure10@gmail.com";

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
      "Usage: tsx scripts/fund-empty-agents-5000usdt-per-coin.ts",
      "  [--chain bsc] [--usdt 5000]",
      "  [--sender-email <email>] [--sender-user-id <uuid>]",
      "  [--target-emails email1,email2,...]",
      "  [--min-positive-assets 1]",
      "  [--execute]",
      "\nBehavior:",
      "- Agents = active app_user with email, role != admin, excluding system IDs.",
      "- Targets only agents with <min-positive-assets> assets having available > 0.",
      "- For each target agent, transfers each enabled asset on the chain for an amount worth <usdt> (priced in USDT).",
      "- Skips assets without a price.",
      "- Uses idempotent reference per (recipient, symbol) so it can be re-run safely.",
    ].join("\n"),
  );
  process.exit(2);
}

function roundDownToDecimals(value: number, decimals: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  const d = Math.max(0, Math.min(18, Math.trunc(decimals)));
  const factor = 10 ** d;
  const floored = Math.floor(value * factor) / factor;
  const s = floored.toFixed(d);
  return s.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
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

async function usdtPerAsset(sql: ReturnType<typeof getSql>, chain: string, symbol: string): Promise<number | null> {
  const sym = symbol.trim().toUpperCase();
  if (sym === "USDT" || sym === "USDC") return 1;

  const direct = await getLatestPairPrice(sql, chain, sym, "USDT");
  if (Number.isFinite(direct) && (direct as number) > 0) return direct as number;

  const idx = await getExternalIndexUsdt(sym);
  if (idx?.mid && Number.isFinite(idx.mid) && idx.mid > 0) return idx.mid;

  return null;
}

async function ensureUserExists(sql: ReturnType<typeof getSql>, userId: string) {
  await sql`
    INSERT INTO app_user (id, status, kyc_level, country)
    VALUES (${userId}::uuid, 'active', 'none', NULL)
    ON CONFLICT (id) DO NOTHING
  `;
}

async function resolveSenderUserId(sql: ReturnType<typeof getSql>, args: { senderUserId?: string; senderEmail?: string }): Promise<string> {
  const fromId = (args.senderUserId ?? "").trim();
  if (fromId) return fromId;

  const email = (args.senderEmail ?? DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
  const rows = await sql<{ id: string }[]>`
    SELECT id::text AS id
    FROM app_user
    WHERE lower(email) = ${email}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new Error(`Sender not found by email: ${email}`);
  return row.id;
}

async function main() {
  const chain = (argValue("--chain") ?? "bsc").trim().toLowerCase();
  const usdtValue = Number(argValue("--usdt") ?? "5000");
  const senderEmail = (argValue("--sender-email") ?? DEFAULT_ADMIN_EMAIL).trim();
  const senderUserIdArg = (argValue("--sender-user-id") ?? "").trim();
  const targetEmails = (argValue("--target-emails") ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const minPositiveAssets = Math.max(0, Math.trunc(Number(argValue("--min-positive-assets") ?? "1") || 0));
  const execute = hasFlag("--execute");

  if (!Number.isFinite(usdtValue) || usdtValue <= 0) usage();

  const sql = getSql();

  const senderUserId = await resolveSenderUserId(sql, { senderUserId: senderUserIdArg, senderEmail });

  // Agents = all active non-admin users with an email.
  const agents = await sql<AgentRow[]>`
    SELECT id::text AS id, lower(email) AS email, role
    FROM app_user
    WHERE status = 'active'
      AND email IS NOT NULL
      AND coalesce(role, 'user') <> 'admin'
      AND id::text <> ALL(${[...SYSTEM_IDS]})
    ORDER BY lower(email)
  `;

  if (agents.length === 0) {
    console.log(JSON.stringify({ ok: true, chain, agents: 0, targets: 0, note: "no_agents_found" }, null, 2));
    return;
  }

  const summaries = await sql<AgentBalanceSummaryRow[]>`
    WITH agents AS (
      SELECT id, lower(email) AS email
      FROM app_user
      WHERE status = 'active'
        AND email IS NOT NULL
        AND coalesce(role, 'user') <> 'admin'
        AND id::text <> ALL(${[...SYSTEM_IDS]})
    ),
    accounts AS (
      SELECT la.id AS account_id, la.user_id, a.id AS asset_id
      FROM ex_ledger_account la
      JOIN ex_asset a ON a.id = la.asset_id
      JOIN agents ag ON ag.id = la.user_id
      WHERE la.status = 'active'
        AND a.chain = ${chain}
        AND a.is_enabled = true
    ),
    posted AS (
      SELECT jl.account_id, coalesce(sum(jl.amount), 0)::numeric(38,18) AS posted
      FROM ex_journal_line jl
      JOIN accounts ac ON ac.account_id = jl.account_id
      GROUP BY jl.account_id
    ),
    held AS (
      SELECT h.account_id, coalesce(sum(h.remaining_amount), 0)::numeric(38,18) AS held
      FROM ex_hold h
      JOIN accounts ac ON ac.account_id = h.account_id
      WHERE h.status = 'active'
      GROUP BY h.account_id
    ),
    avail AS (
      SELECT
        ac.user_id,
        (coalesce(p.posted, 0) - coalesce(h.held, 0))::numeric(38,18) AS available
      FROM accounts ac
      LEFT JOIN posted p ON p.account_id = ac.account_id
      LEFT JOIN held h ON h.account_id = ac.account_id
    )
    SELECT
      ag.id::text AS user_id,
      ag.email AS email,
      coalesce(count(*) FILTER (WHERE a.available > 0), 0)::int AS positive_assets,
      coalesce(sum(a.available), 0)::numeric(38,18)::text AS total_available
    FROM agents ag
    LEFT JOIN avail a ON a.user_id = ag.id
    GROUP BY ag.id, ag.email
    ORDER BY ag.email
  `;

  let targets = summaries.filter((s) => s.positive_assets < minPositiveAssets);
  if (targetEmails.length > 0) {
    const allow = new Set(targetEmails);
    targets = targets.filter((t) => allow.has((t.email ?? "").trim().toLowerCase()));
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        chain,
        usdtValue,
        senderUserId,
        senderEmail: senderUserIdArg ? null : senderEmail,
        targetEmails: targetEmails.length > 0 ? targetEmails : null,
        minPositiveAssets,
        execute,
        agentCount: agents.length,
        targetCount: targets.length,
        targets,
      },
      null,
      2,
    ),
  );

  if (!execute) {
    console.log("\nDry run only. Re-run with --execute to perform transfers.");
    return;
  }

  if (targets.length === 0) {
    console.log("No target agents (all have coins already). Nothing to do.");
    return;
  }

  // Ensure sender exists if a raw UUID was passed (e.g., system user). For normal email users it already exists.
  if (senderUserIdArg) {
    await ensureUserExists(sql, senderUserId);
  }

  const assets = await sql<AssetRow[]>`
    SELECT id::text AS id, symbol, decimals
    FROM ex_asset
    WHERE chain = ${chain} AND is_enabled = true
    ORDER BY symbol ASC
  `;

  for (const t of targets) {
    const recipientEmail = t.email;
    console.log(`\n[fund] recipient=${recipientEmail} ...`);

    let ok = 0;
    let skippedNoPrice = 0;
    let skippedAlready = 0;
    let failed = 0;

    for (const asset of assets) {
      const symbol = asset.symbol.trim().toUpperCase();
      const reference = `airdrop_5000usdt:${recipientEmail}:${chain}:${symbol}`;

      const existing = await sql<{ id: string }[]>`
        SELECT id::text AS id
        FROM ex_journal_entry
        WHERE type = 'user_transfer'
          AND reference = ${reference}
        LIMIT 1
      `;
      if (existing.length) {
        skippedAlready++;
        continue;
      }

      const px = await usdtPerAsset(sql, chain, symbol);
      if (!Number.isFinite(px as number) || (px as number) <= 0) {
        skippedNoPrice++;
        continue;
      }

      const amountNum = symbol === "USDT" ? usdtValue : usdtValue / (px as number);
      const amount = roundDownToDecimals(amountNum, asset.decimals);
      if (amount === "0") {
        failed++;
        continue;
      }

      const resp = await requestUserTransfer(sql, {
        actingUserId: senderUserId,
        assetId: asset.id,
        amount,
        recipientEmail,
        reference,
      });

      if (resp.status === 201) {
        ok++;
        continue;
      }

      failed++;
      if (failed <= 5) {
        console.log(`[error] ${symbol}:`, resp.body);
      }
    }

    console.log(JSON.stringify({ recipientEmail, ok, skippedAlready, skippedNoPrice, failed }, null, 2));
  }
}

main().catch((err) => {
  console.error("[fund-empty-agents-5000usdt-per-coin] failed:", err);
  process.exit(1);
});
