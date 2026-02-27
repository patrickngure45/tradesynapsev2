/// <reference types="node" />

import "dotenv/config";

import { getSql } from "../src/lib/db";

const SYSTEM_IDS = [
  "00000000-0000-0000-0000-000000000001",
  "00000000-0000-0000-0000-000000000002",
  "00000000-0000-0000-0000-000000000003",
] as const;

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const chain = (argValue("--chain") ?? "bsc").trim().toLowerCase();
  const showEmail = (argValue("--show") ?? "").trim().toLowerCase();
  const includeAdmin = process.argv.includes("--include-admin");
  const limit = Math.max(1, Math.trunc(Number(argValue("--limit") ?? "25") || 25));

  const sql = getSql();

  const agents = await sql<{ id: string; email: string }[]>`
    SELECT id::text AS id, lower(email) AS email
    FROM app_user
    WHERE status = 'active'
      AND email IS NOT NULL
      AND (${includeAdmin} OR coalesce(role, 'user') <> 'admin')
      AND id::text <> ALL(${[...SYSTEM_IDS]})
    ORDER BY lower(email)
  `;

  const summaries = await sql<
    {
      user_id: string;
      email: string;
      positive_assets: number;
      total_available: string;
    }[]
  >`
    WITH agents AS (
      SELECT id, lower(email) AS email
      FROM app_user
      WHERE status = 'active'
        AND email IS NOT NULL
        AND (${includeAdmin} OR coalesce(role, 'user') <> 'admin')
        AND id::text <> ALL(${[...SYSTEM_IDS]})
    ),
    accounts AS (
      SELECT la.id AS account_id, la.user_id, a.id AS asset_id, a.symbol, a.decimals
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
        ac.symbol,
        (coalesce(p.posted, 0) - coalesce(h.held, 0))::numeric(38,18) AS available
      FROM accounts ac
      LEFT JOIN posted p ON p.account_id = ac.account_id
      LEFT JOIN held h ON h.account_id = ac.account_id
    )
    SELECT
      ag.id::text AS user_id,
      ag.email,
      count(*) FILTER (WHERE v.available > 0) AS positive_assets,
      coalesce(sum(v.available) FILTER (WHERE v.available > 0), 0)::text AS total_available
    FROM agents ag
    LEFT JOIN avail v ON v.user_id = ag.id
    GROUP BY ag.id, ag.email
    ORDER BY ag.email
  `;

  console.log(
    JSON.stringify(
      {
        ok: true,
        chain,
        agentCount: agents.length,
        summaries,
      },
      null,
      2,
    ),
  );

  if (showEmail) {
    const row = summaries.find((s) => s.email === showEmail);
    if (!row) {
      console.log(JSON.stringify({ ok: false, error: "email_not_found", email: showEmail }, null, 2));
      return;
    }

    const assets = await sql<{ symbol: string; available: string }[]>`
      WITH accounts AS (
        SELECT la.id AS account_id, la.user_id, a.symbol
        FROM ex_ledger_account la
        JOIN ex_asset a ON a.id = la.asset_id
        WHERE la.status = 'active'
          AND a.chain = ${chain}
          AND a.is_enabled = true
          AND la.user_id = ${row.user_id}::uuid
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
      )
      SELECT ac.symbol, (coalesce(p.posted,0) - coalesce(h.held,0))::text AS available
      FROM accounts ac
      LEFT JOIN posted p ON p.account_id = ac.account_id
      LEFT JOIN held h ON h.account_id = ac.account_id
      WHERE (coalesce(p.posted,0) - coalesce(h.held,0)) > 0
      ORDER BY ac.symbol
      LIMIT ${limit}
    `;

    console.log(JSON.stringify({ ok: true, email: showEmail, positiveAssetsPreview: assets }, null, 2));
  }
}

main().catch((e) => {
  console.error("[check-agent-assets-summary] failed:", e);
  process.exit(1);
});
