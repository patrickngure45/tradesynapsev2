import "dotenv/config";

import { getSql } from "../src/lib/db";
import type { Sql } from "postgres";
import { fromBigInt3818, toBigInt3818, toBigInt3818Signed } from "../src/lib/exchange/fixed3818";

const SYSTEM_TREASURY_USER_ID = "00000000-0000-0000-0000-000000000001";

function parseArgValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  return process.argv[i + 1] ?? null;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function parseAmountOrThrow(label: string, raw: string): string {
  const s = raw.trim();
  if (!s) throw new Error(`Empty amount for ${label}`);
  // validate format
  toBigInt3818(s);
  return s;
}

function fromBigInt3818Signed(value: bigint): string {
  if (value === 0n) return "0";
  if (value < 0n) return `-${fromBigInt3818(-value)}`;
  return fromBigInt3818(value);
}

function absBigInt(v: bigint): bigint {
  return v < 0n ? -v : v;
}

async function ensureSystemUser(sql: Sql): Promise<void> {
  await sql`
    INSERT INTO app_user (id, status, kyc_level, country, display_name)
    VALUES (${SYSTEM_TREASURY_USER_ID}::uuid, 'active', 'none', NULL, 'System Treasury')
    ON CONFLICT (id) DO UPDATE SET status = 'active'
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

async function postDelta(
  sql: Sql,
  params: {
    entryType: string;
    reference: string;
    metadata: Record<string, unknown>;
    assetId: string;
    userAccountId: string;
    systemAccountId: string;
    delta: bigint;
  },
): Promise<void> {
  const entry = await sql<{ id: string }[]>`
    INSERT INTO ex_journal_entry (type, reference, metadata_json)
    VALUES (${params.entryType}, ${params.reference}, ${params.metadata}::jsonb)
    RETURNING id::text AS id
  `;
  const entryId = entry[0]!.id;
  const d = fromBigInt3818Signed(params.delta);
  const neg = fromBigInt3818Signed(-params.delta);

  await sql`
    INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
    VALUES
      (${entryId}::uuid, ${params.userAccountId}::uuid, ${params.assetId}::uuid, (${d}::numeric)),
      (${entryId}::uuid, ${params.systemAccountId}::uuid, ${params.assetId}::uuid, (${neg}::numeric))
  `;
}

type UserRow = { id: string; email: string | null; display_name: string | null; role: string };

async function getAdmins(sql: Sql): Promise<UserRow[]> {
  return await sql<UserRow[]>`
    SELECT id::text AS id, email, display_name, role
    FROM app_user
    WHERE role = 'admin'
    ORDER BY email NULLS LAST, id
  `;
}

async function getAgentsFromAds(sql: Sql): Promise<UserRow[]> {
  // Treat any non-admin user who has at least one P2P ad as an "agent" for this maintenance task.
  // This matches your current setup where agents own ads and regular users typically don't.
  return await sql<UserRow[]>`
    SELECT u.id::text AS id, u.email, u.display_name, u.role
    FROM app_user u
    WHERE u.role <> 'admin'
      AND EXISTS (SELECT 1 FROM p2p_ad ad WHERE ad.user_id = u.id)
    ORDER BY u.email NULLS LAST, u.id
  `;
}

async function normalizeUser(
  sql: Sql,
  input: {
    user: UserRow;
    chain: string;
    usdtAssetId: string;
    targetUsdt: string;
    zeroNonUsdt: boolean;
    apply: boolean;
  },
): Promise<void> {
  const balancesBefore = await getBalances(sql, input.user.id);
  const usdtRow = balancesBefore.find((b) => b.symbol === "USDT");
  const usdtPostedBi = toBigInt3818Signed(usdtRow?.posted ?? "0");
  const usdtHeldBi = toBigInt3818Signed(usdtRow?.held ?? "0");
  const usdtTargetBi = toBigInt3818(input.targetUsdt);

  console.log("\n────────────────────────────────────────────────────────────");
  console.log(`[${input.user.role}] ${input.user.email ?? input.user.id} ${input.user.display_name ? `(${input.user.display_name})` : ""}`);

  const nonZero = balancesBefore
    .map((b) => ({
      symbol: b.symbol,
      postedBi: toBigInt3818Signed(b.posted),
      heldBi: toBigInt3818Signed(b.held),
      posted: b.posted,
      held: b.held,
      available: b.available,
      asset_id: b.asset_id,
    }))
    .filter((b) => b.postedBi !== 0n || b.heldBi !== 0n);

  const topPosted = [...nonZero]
    .sort((a, b) => {
      const da = absBigInt(a.postedBi);
      const db = absBigInt(b.postedBi);
      if (da === db) return a.symbol.localeCompare(b.symbol);
      return da > db ? -1 : 1;
    })
    .slice(0, 8)
    .map((b) => ({ symbol: b.symbol, posted: b.posted, held: b.held, available: b.available }));

  console.log(
    `[before] nonZeroAssets=${nonZero.length} USDT posted=${usdtRow?.posted ?? "0"} held=${usdtRow?.held ?? "0"} available=${usdtRow?.available ?? "0"}`,
  );
  if (topPosted.length > 0) {
    console.table(topPosted);
  }

  const nonUsdtHeld = balancesBefore.filter((b) => b.symbol !== "USDT" && toBigInt3818Signed(b.held) > 0n);
  if (nonUsdtHeld.length > 0) {
    console.log("[skip] user has active non-USDT holds; not changing non-USDT balances");
    console.table(nonUsdtHeld.map((b) => ({ symbol: b.symbol, held: b.held, posted: b.posted })));
  }

  const desiredUsdtPostedBi = usdtHeldBi > usdtTargetBi ? usdtHeldBi : usdtTargetBi;
  const usdtDeltaBi = desiredUsdtPostedBi - usdtPostedBi;

  if (!input.apply) {
    console.log(`[dry-run] desired USDT posted=${fromBigInt3818Signed(desiredUsdtPostedBi)} delta=${fromBigInt3818Signed(usdtDeltaBi)}`);
    return;
  }

  await sql.begin(async (tx) => {
    const txSql = tx as unknown as typeof sql;

    const treasuryAcct = await ensureLedgerAccount(txSql, SYSTEM_TREASURY_USER_ID, input.usdtAssetId);
    const userUsdtAcct = await ensureLedgerAccount(txSql, input.user.id, input.usdtAssetId);

    if (usdtDeltaBi !== 0n) {
      await postDelta(txSql, {
        entryType: "admin_set_initial_balance",
        reference: `init_balance:${input.user.id}:USDT`,
        metadata: {
          userId: input.user.id,
          email: input.user.email,
          role: input.user.role,
          symbol: "USDT",
          target: input.targetUsdt,
          held: fromBigInt3818Signed(usdtHeldBi),
          desiredPosted: fromBigInt3818Signed(desiredUsdtPostedBi),
          delta: fromBigInt3818Signed(usdtDeltaBi),
        },
        assetId: input.usdtAssetId,
        userAccountId: userUsdtAcct,
        systemAccountId: treasuryAcct,
        delta: usdtDeltaBi,
      });
      console.log(`[apply] USDT: posted ${fromBigInt3818Signed(usdtPostedBi)} -> ${fromBigInt3818Signed(desiredUsdtPostedBi)}`);
    } else {
      console.log("[apply] USDT already at target");
    }

    if (!input.zeroNonUsdt) return;

    let zeroed = 0;
    const zeroedSample: string[] = [];
    for (const row of balancesBefore) {
      if (row.symbol === "USDT") continue;
      const heldBi = toBigInt3818Signed(row.held);
      if (heldBi > 0n) continue; // don't touch assets with active holds
      const postedBi = toBigInt3818Signed(row.posted);
      if (postedBi === 0n) continue;
      const deltaBi = -postedBi;

      const assetId = row.asset_id;
      const userAcct = await ensureLedgerAccount(txSql, input.user.id, assetId);
      const treasuryAcctAny = await ensureLedgerAccount(txSql, SYSTEM_TREASURY_USER_ID, assetId);

      await postDelta(txSql, {
        entryType: "admin_set_initial_balance",
        reference: `init_balance:${input.user.id}:${row.symbol}`,
        metadata: {
          userId: input.user.id,
          email: input.user.email,
          role: input.user.role,
          symbol: row.symbol,
          desiredPosted: "0",
          delta: fromBigInt3818Signed(deltaBi),
        },
        assetId,
        userAccountId: userAcct,
        systemAccountId: treasuryAcctAny,
        delta: deltaBi,
      });
      zeroed += 1;
      if (zeroedSample.length < 8) zeroedSample.push(row.symbol);
    }

    if (zeroed > 0) {
      console.log(`[apply] non-USDT zeroed assets=${zeroed} sample=${zeroedSample.join(",")}`);
    }
  });

  const after = await getBalances(sql, input.user.id);
  const afterUsdt = after.find((b) => b.symbol === "USDT");
  const afterNonZero = after.filter((b) => toBigInt3818Signed(b.posted) !== 0n || toBigInt3818Signed(b.held) !== 0n);
  console.log(
    `[after] nonZeroAssets=${afterNonZero.length} USDT posted=${afterUsdt?.posted ?? "0"} held=${afterUsdt?.held ?? "0"} available=${afterUsdt?.available ?? "0"}`,
  );
}

async function main() {
  const apply = hasFlag("--apply") || String(process.env.APPLY ?? "") === "1";
  const chain = (parseArgValue("--chain") ?? process.env.CHAIN ?? "bsc").trim();
  const agentTarget = parseAmountOrThrow(
    "agent-usdt",
    parseArgValue("--agent-usdt") ?? process.env.AGENT_USDT ?? "20",
  );
  const adminTarget = parseAmountOrThrow(
    "admin-usdt",
    parseArgValue("--admin-usdt") ?? process.env.ADMIN_USDT ?? "3000",
  );
  const zeroNonUsdt = (parseArgValue("--zero-non-usdt") ?? process.env.ZERO_NON_USDT ?? "1").trim() !== "0";

  const sql = getSql();
  await ensureSystemUser(sql);
  const usdtAssetId = await getAssetId(sql, chain, "USDT");

  const agents = await getAgentsFromAds(sql);
  const admins = await getAdmins(sql);

  console.log(`[normalize-initial-balances] apply=${apply} chain=${chain} zeroNonUsdt=${zeroNonUsdt}`);
  console.log(`[normalize-initial-balances] agents(from ads)=${agents.length} target=${agentTarget} USDT`);
  console.log(`[normalize-initial-balances] admins=${admins.length} target=${adminTarget} USDT`);

  // Agents first
  for (const user of agents) {
    await normalizeUser(sql, {
      user,
      chain,
      usdtAssetId,
      targetUsdt: agentTarget,
      zeroNonUsdt,
      apply,
    });
  }

  // Admins
  for (const user of admins) {
    await normalizeUser(sql, {
      user,
      chain,
      usdtAssetId,
      targetUsdt: adminTarget,
      zeroNonUsdt,
      apply,
    });
  }

  await sql.end({ timeout: 5 }).catch(() => undefined);
}

main().catch((err) => {
  console.error("[normalize-initial-balances] failed:", err);
  process.exit(1);
});
