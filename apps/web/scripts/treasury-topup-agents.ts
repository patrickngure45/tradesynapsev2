import "dotenv/config";

import { getSql } from "../src/lib/db";
import type { Sql } from "postgres";

const SYSTEM_TREASURY_USER_ID = "00000000-0000-0000-0000-000000000001";

type Agent = { id: string; email: string | null; display_name: string | null };

function parseCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseArgValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  return process.argv[i + 1] ?? null;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function toNum(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function asNumericString(n: number): string {
  const fixed = n.toFixed(18).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  return fixed.length ? fixed : "0";
}

async function getAssetId(sql: Sql, chain: string, symbol: string): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    SELECT id::text AS id
    FROM ex_asset
    WHERE chain = ${chain} AND symbol = ${symbol} AND is_enabled = true
    LIMIT 1
  `;
  if (rows.length === 0) throw new Error(`Asset not found: ${chain}:${symbol}`);
  return rows[0]!.id;
}

async function ensureLedgerAccount(sql: Sql, userId: string, assetId: string): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO ex_ledger_account (user_id, asset_id)
    VALUES (${userId}::uuid, ${assetId}::uuid)
    ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
    RETURNING id::text AS id
  `;
  return rows[0]!.id;
}

async function getAgents(sql: Sql, emails: string[]): Promise<Agent[]> {
  const rows = await sql<Agent[]>`
    SELECT id::text AS id, email, display_name
    FROM app_user
    WHERE email = ANY(${emails})
    ORDER BY email NULLS LAST, id
  `;
  return rows;
}

async function getUsdtPostedHeld(sql: Sql, userId: string, assetId: string): Promise<{ posted: number; held: number; available: number }> {
  const acct = await ensureLedgerAccount(sql, userId, assetId);
  const rows = await sql<{ posted: string; held: string; available: string }[]>`
    WITH posted AS (
      SELECT coalesce(sum(amount),0)::numeric AS posted
      FROM ex_journal_line
      WHERE account_id = ${acct}::uuid
    ),
    held AS (
      SELECT coalesce(sum(remaining_amount),0)::numeric AS held
      FROM ex_hold
      WHERE account_id = ${acct}::uuid AND status='active'
    )
    SELECT posted.posted::text AS posted, held.held::text AS held, (posted.posted - held.held)::text AS available
    FROM posted, held
  `;
  const posted = Number(rows[0]?.posted ?? "0");
  const held = Number(rows[0]?.held ?? "0");
  const available = Number(rows[0]?.available ?? "0");
  return {
    posted: Number.isFinite(posted) ? posted : 0,
    held: Number.isFinite(held) ? held : 0,
    available: Number.isFinite(available) ? available : 0,
  };
}

async function postTreasuryTransfer(
  sql: Sql,
  params: {
    assetId: string;
    agentId: string;
    agentEmail: string | null;
    amount: number;
  },
): Promise<void> {
  const agentAcct = await ensureLedgerAccount(sql, params.agentId, params.assetId);
  const treasuryAcct = await ensureLedgerAccount(sql, SYSTEM_TREASURY_USER_ID, params.assetId);

  const entry = await sql<{ id: string }[]>`
    INSERT INTO ex_journal_entry (type, reference, metadata_json)
    VALUES (
      'admin_treasury_topup',
      ${`treasury_topup:${params.agentId}`},
      ${{ agentId: params.agentId, email: params.agentEmail, amount: asNumericString(params.amount) }}::jsonb
    )
    RETURNING id::text AS id
  `;
  const entryId = entry[0]!.id;

  await sql`
    INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
    VALUES
      (${entryId}::uuid, ${agentAcct}::uuid, ${params.assetId}::uuid, (${asNumericString(params.amount)}::numeric)),
      (${entryId}::uuid, ${treasuryAcct}::uuid, ${params.assetId}::uuid, ((${asNumericString(params.amount)}::numeric) * -1))
  `;
}

async function main() {
  const apply = hasFlag("--apply") || String(process.env.APPLY ?? "") === "1";
  const chain = (parseArgValue("--chain") ?? process.env.CHAIN ?? "bsc").trim();
  const symbol = (parseArgValue("--symbol") ?? process.env.SYMBOL ?? "USDT").trim().toUpperCase();

  const floorUsdt = toNum(parseArgValue("--floor-usdt")) ?? toNum(process.env.FLOOR_USDT) ?? 5;
  const targetUsdt = toNum(parseArgValue("--target-usdt")) ?? toNum(process.env.TARGET_USDT) ?? 15;
  if (!(floorUsdt >= 0)) throw new Error(`Invalid floorUsdt: ${floorUsdt}`);
  if (!(targetUsdt > 0)) throw new Error(`Invalid targetUsdt: ${targetUsdt}`);
  if (targetUsdt < floorUsdt) throw new Error(`TARGET_USDT must be >= FLOOR_USDT`);

  const emailList =
    parseCsv(parseArgValue("--emails") ?? undefined).length > 0
      ? parseCsv(parseArgValue("--emails") ?? undefined)
      : parseCsv(process.env.AGENT_EMAILS);
  if (emailList.length === 0) {
    throw new Error(
      "No agent emails provided. Set AGENT_EMAILS=comma,separated or pass --emails agent1@x,agent2@y",
    );
  }

  const sql = getSql();
  const assetId = await getAssetId(sql, chain, symbol);

  const agents = await getAgents(sql, emailList);
  if (agents.length === 0) throw new Error("No matching agents found.");

  console.log(`[treasury-topup] agents=${agents.length} chain=${chain} symbol=${symbol} floor=${floorUsdt} target=${targetUsdt} apply=${apply}`);

  for (const agent of agents) {
    const bal = await getUsdtPostedHeld(sql, agent.id, assetId);
    const need = bal.available < floorUsdt ? Math.max(0, targetUsdt - bal.available) : 0;
    console.log(`[agent] ${agent.email ?? agent.id} available=${asNumericString(bal.available)} held=${asNumericString(bal.held)} posted=${asNumericString(bal.posted)} topupNeed=${asNumericString(need)}`);

    if (need <= 0 || !apply) continue;

    await sql.begin(async (tx) => {
      const txSql = tx as unknown as typeof sql;
      await postTreasuryTransfer(txSql, {
        assetId,
        agentId: agent.id,
        agentEmail: agent.email,
        amount: need,
      });
    });

    const after = await getUsdtPostedHeld(sql, agent.id, assetId);
    console.log(`[agent] ✅ after available=${asNumericString(after.available)} held=${asNumericString(after.held)} posted=${asNumericString(after.posted)}`);
  }

  await sql.end({ timeout: 5 }).catch(() => undefined);
}

main().catch((err) => {
  console.error("[treasury-topup] failed:", err);
  process.exit(1);
});
