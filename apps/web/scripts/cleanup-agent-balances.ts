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

async function ensureSystemUser(sql: Sql): Promise<void> {
  await sql`
    INSERT INTO app_user (id, status, kyc_level, country)
    VALUES (${SYSTEM_TREASURY_USER_ID}::uuid, 'active', 'none', NULL)
    ON CONFLICT (id) DO NOTHING
  `;
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

type BalanceRow = {
  asset_id: string;
  symbol: string;
  posted: string;
  held: string;
  available: string;
};

async function getBalances(sql: Sql, userId: string): Promise<BalanceRow[]> {
  const rows = await sql<BalanceRow[]>`
    SELECT
      a.asset_id::text AS asset_id,
      asset.symbol AS symbol,
      coalesce(sum(jl.amount), 0)::text AS posted,
      coalesce(h.held, 0)::text AS held,
      (coalesce(sum(jl.amount), 0) - coalesce(h.held, 0))::text AS available
    FROM ex_ledger_account a
    JOIN ex_asset asset ON asset.id = a.asset_id
    LEFT JOIN ex_journal_line jl ON jl.account_id = a.id
    LEFT JOIN LATERAL (
      SELECT coalesce(sum(remaining_amount), 0) AS held
      FROM ex_hold
      WHERE account_id = a.id AND status = 'active'
    ) h ON true
    WHERE a.user_id = ${userId}::uuid
    GROUP BY a.asset_id, asset.symbol, h.held
    ORDER BY asset.symbol
  `;
  return rows;
}

async function getActiveP2PCounts(sql: Sql, userId: string): Promise<{ openOrders: number; openAds: number; byAsset: Array<{ symbol: string; ads: number }> }> {
  const openOrders = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n
    FROM p2p_order
    WHERE maker_id = ${userId}::uuid
      AND status IN ('created', 'paid_confirmed', 'disputed')
  `;

  const openAds = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n
    FROM p2p_ad
    WHERE user_id = ${userId}::uuid
      AND status IN ('online', 'offline')
  `;

  const byAsset = await sql<{ symbol: string; ads: number }[]>`
    SELECT a.symbol AS symbol, count(*)::int AS ads
    FROM p2p_ad ad
    JOIN ex_asset a ON a.id = ad.asset_id
    WHERE ad.user_id = ${userId}::uuid
      AND ad.status IN ('online', 'offline')
    GROUP BY a.symbol
    ORDER BY a.symbol
  `;

  return {
    openOrders: openOrders[0]?.n ?? 0,
    openAds: openAds[0]?.n ?? 0,
    byAsset,
  };
}

async function offlineNonUsdtAds(sql: Sql, userId: string, usdtAssetId: string, mode: "offline" | "closed"): Promise<number> {
  if (mode === "offline") {
    const rows = await sql<{ n: number }[]>`
      WITH upd AS (
        UPDATE p2p_ad
        SET status = 'offline', updated_at = now()
        WHERE user_id = ${userId}::uuid
          AND asset_id <> ${usdtAssetId}::uuid
          AND status = 'online'
        RETURNING 1
      )
      SELECT count(*)::int AS n FROM upd
    `;
    return rows[0]?.n ?? 0;
  }

  const rows = await sql<{ n: number }[]>`
    WITH upd AS (
      UPDATE p2p_ad
      SET status = 'closed', remaining_amount = 0, updated_at = now()
      WHERE user_id = ${userId}::uuid
        AND asset_id <> ${usdtAssetId}::uuid
        AND status IN ('online', 'offline')
      RETURNING 1
    )
    SELECT count(*)::int AS n FROM upd
  `;
  return rows[0]?.n ?? 0;
}

async function postDelta(
  sql: Sql,
  params: {
    entryType: string;
    reference: string;
    metadata: Record<string, unknown>;
    assetId: string;
    userAccountId: string;
    systemAccountId: string;
    delta: string;
  },
): Promise<void> {
  const entry = await sql<{ id: string }[]>`
    INSERT INTO ex_journal_entry (type, reference, metadata_json)
    VALUES (${params.entryType}, ${params.reference}, ${params.metadata}::jsonb)
    RETURNING id::text AS id
  `;
  const entryId = entry[0]!.id;

  await sql`
    INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
    VALUES
      (${entryId}::uuid, ${params.userAccountId}::uuid, ${params.assetId}::uuid, (${params.delta}::numeric)),
      (${entryId}::uuid, ${params.systemAccountId}::uuid, ${params.assetId}::uuid, ((${params.delta}::numeric) * -1))
  `;
}

function asNumericString(n: number): string {
  // Keep 18dp max like the rest of the codebase; strip trailing zeros.
  const fixed = n.toFixed(18).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  return fixed.length ? fixed : "0";
}

async function main() {
  const apply = hasFlag("--apply") || String(process.env.APPLY ?? "") === "1";
  const chain = (parseArgValue("--chain") ?? process.env.CHAIN ?? "bsc").trim();

  const targetUsdt =
    toNum(parseArgValue("--target-usdt")) ??
    toNum(process.env.TARGET_USDT) ??
    5_000;
  if (!(targetUsdt > 0)) {
    throw new Error(`Invalid TARGET_USDT: ${targetUsdt}`);
  }

  const emailList =
    parseCsv(parseArgValue("--emails") ?? undefined).length > 0
      ? parseCsv(parseArgValue("--emails") ?? undefined)
      : parseCsv(process.env.AGENT_EMAILS);
  if (emailList.length === 0) {
    throw new Error(
      "No agent emails provided. Set AGENT_EMAILS=comma,separated or pass --emails agent1@x,agent2@y",
    );
  }

  const adsModeRaw = (parseArgValue("--non-usdt-ads") ?? process.env.NON_USDT_ADS ?? "offline").trim();
  const nonUsdtAdsMode: "offline" | "closed" = adsModeRaw === "closed" ? "closed" : "offline";
  const handleAds = (parseArgValue("--handle-ads") ?? process.env.HANDLE_ADS ?? (apply ? "1" : "0")).trim() !== "0";

  const sql = getSql();
  await ensureSystemUser(sql);
  const usdtAssetId = await getAssetId(sql, chain, "USDT");

  const agents = await getAgents(sql, emailList);
  const missing = emailList.filter((e) => !agents.some((a) => (a.email ?? "").toLowerCase() === e.toLowerCase()));
  if (missing.length > 0) {
    console.warn("[cleanup-agent-balances] ⚠️ some emails not found:", missing);
  }
  if (agents.length === 0) throw new Error("No matching agents found.");

  console.log(`[cleanup-agent-balances] agents=${agents.length} chain=${chain} apply=${apply}`);
  console.log(`[cleanup-agent-balances] target USDT=${targetUsdt} handleAds=${handleAds} nonUsdtAdsMode=${nonUsdtAdsMode}`);

  for (const agent of agents) {
    const counts = await getActiveP2PCounts(sql, agent.id);
    const balances = await getBalances(sql, agent.id);

    console.log("\n────────────────────────────────────────────────────────────");
    console.log(`[agent] ${agent.email ?? agent.id} (${agent.display_name ?? ""})`);
    console.log(`[p2p] ads=${counts.openAds} openOrders=${counts.openOrders} byAsset=${counts.byAsset.map((x) => `${x.symbol}:${x.ads}`).join(" ") || "-"}`);
    console.table(
      balances.map((b) => ({
        symbol: b.symbol,
        posted: b.posted,
        held: b.held,
        available: b.available,
      })),
    );

    const nonUsdtHeld = balances.filter((b) => b.symbol !== "USDT" && Number(b.held) > 0);
    if (nonUsdtHeld.length > 0) {
      console.error("[cleanup-agent-balances] ❌ agent has active holds in non-USDT assets. Resolve/cancel those orders first:");
      console.table(nonUsdtHeld.map((b) => ({ symbol: b.symbol, held: b.held, posted: b.posted, available: b.available })));
      continue;
    }

    if (!apply) continue;

    await sql.begin(async (tx) => {
      const txSql = tx as unknown as typeof sql;

      if (handleAds) {
        const n = await offlineNonUsdtAds(txSql, agent.id, usdtAssetId, nonUsdtAdsMode);
        if (n > 0) console.log(`[cleanup-agent-balances] set ${n} non-USDT ads => ${nonUsdtAdsMode}`);
      }

      const referenceBase = `agent_cleanup:${agent.id}`;

      // Ensure we have ledger accounts for all touched assets.
      // Balances list already represents assets where a ledger account exists.
      for (const row of balances) {
        const assetIdRow = await txSql<{ id: string }[]>`
          SELECT id::text AS id FROM ex_asset WHERE symbol = ${row.symbol} AND chain = ${chain} LIMIT 1
        `;
        const assetId = assetIdRow[0]?.id;
        if (!assetId) continue;

        const userAcct = await ensureLedgerAccount(txSql, agent.id, assetId);
        const systemAcct = await ensureLedgerAccount(txSql, SYSTEM_TREASURY_USER_ID, assetId);

        const posted = Number(row.posted);
        const held = Number(row.held);
        if (!Number.isFinite(posted) || !Number.isFinite(held)) continue;

        if (row.symbol === "USDT") {
          const desired = Math.max(targetUsdt, held);
          const delta = desired - posted;
          if (Math.abs(delta) < 1e-12) continue;
          await postDelta(txSql, {
            entryType: "admin_cleanup_agent_balance",
            reference: `${referenceBase}:USDT`,
            metadata: {
              userId: agent.id,
              email: agent.email,
              symbol: row.symbol,
              postedBefore: row.posted,
              held,
              desired: asNumericString(desired),
              delta: asNumericString(delta),
            },
            assetId,
            userAccountId: userAcct,
            systemAccountId: systemAcct,
            delta: asNumericString(delta),
          });
          continue;
        }

        // Non-USDT: zero posted balance.
        // Holds should already be 0 (checked earlier).
        const desired = 0;
        const delta = desired - posted;
        if (Math.abs(delta) < 1e-12) continue;

        await postDelta(txSql, {
          entryType: "admin_cleanup_agent_balance",
          reference: `${referenceBase}:${row.symbol}`,
          metadata: {
            userId: agent.id,
            email: agent.email,
            symbol: row.symbol,
            postedBefore: row.posted,
            held,
            desired: "0",
            delta: asNumericString(delta),
          },
          assetId,
          userAccountId: userAcct,
          systemAccountId: systemAcct,
          delta: asNumericString(delta),
        });
      }
    });

    const after = await getBalances(sql, agent.id);
    console.log("[cleanup-agent-balances] ✅ after:");
    console.table(after.map((b) => ({ symbol: b.symbol, posted: b.posted, held: b.held, available: b.available })));
  }

  await sql.end({ timeout: 5 }).catch(() => undefined);
}

main().catch((err) => {
  console.error("[cleanup-agent-balances] failed:", err);
  process.exit(1);
});
