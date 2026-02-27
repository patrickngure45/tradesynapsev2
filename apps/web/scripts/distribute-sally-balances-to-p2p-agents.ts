import "dotenv/config";

import { getSql } from "../src/lib/db";
import { fromBigInt3818, toBigInt3818 } from "../src/lib/exchange/fixed3818";

type UserRow = {
  id: string;
  email: string | null;
  status: string;
};

type AgentRow = {
  user_id: string;
  email: string | null;
  status: string;
};

type AssetBalRow = {
  asset_id: string;
  chain: string;
  symbol: string;
  decimals: number;
  posted: string;
  held: string;
  available: string;
};

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>();
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i] ?? "";
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next != null && !next.startsWith("--")) {
      args.set(key, next);
      i++;
    } else {
      args.set(key, true);
    }
  }
  const fromEmail = String(args.get("from-email") ?? "sallymellow03@gmail.com");
  const execute = Boolean(args.get("execute"));
  const minAmount = String(args.get("min-amount") ?? "0");

  const agentEmailsRaw = args.get("agent-emails");
  const excludeEmailsRaw = args.get("exclude-emails");

  const agentEmails = String(agentEmailsRaw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);

  const excludeEmails = String(excludeEmailsRaw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);

  return { fromEmail, execute, minAmount, agentEmails, excludeEmails };
}

function pow10(n: bigint): bigint {
  if (n < 0n) throw new Error("pow10 negative");
  let out = 1n;
  for (let i = 0n; i < n; i++) out *= 10n;
  return out;
}

function quantizeDown3818(value3818: bigint, decimals: number): bigint {
  // DB stores numeric(38,18); treat >18 as 18.
  const d = Math.max(0, Math.min(18, Math.trunc(decimals)));
  const step = pow10(BigInt(18 - d));
  return (value3818 / step) * step;
}

async function main() {
  const { fromEmail, execute, minAmount, agentEmails, excludeEmails } = parseArgs(process.argv);
  const minBig = toBigInt3818(minAmount);

  const sql = getSql();

  const fromRows = await sql<UserRow[]>`
    SELECT id::text AS id, email, status
    FROM app_user
    WHERE lower(email) = lower(${fromEmail})
    LIMIT 1
  `;
  const from = fromRows[0];
  if (!from) {
    console.error(JSON.stringify({ ok: false, error: "from_user_not_found", fromEmail }, null, 2));
    process.exit(1);
  }

  // Safety: in execute mode we REQUIRE an explicit agent list.
  // This avoids making assumptions about who counts as an “agent” when moving funds.
  let agents: AgentRow[] = [];
  if (execute) {
    if (agentEmails.length === 0) {
      console.error(
        JSON.stringify(
          {
            ok: false,
            error: "agent_emails_required_for_execute",
            hint: "Pass --agent-emails email1,email2,... to run --execute safely.",
          },
          null,
          2,
        ),
      );
      process.exit(1);
    }

    agents = await sql<AgentRow[]>`
      SELECT
        u.id::text AS user_id,
        u.email,
        u.status
      FROM app_user u
      WHERE u.status = 'active'
        AND u.email IS NOT NULL
        AND lower(u.email) = ANY(${agentEmails})
      ORDER BY lower(u.email)
    `;
  } else {
    // Dry-run defaults: keep discovery logic for exploration only.
    agents = await sql<AgentRow[]>`
      SELECT
        u.id::text AS user_id,
        u.email,
        u.status
      FROM p2p_payment_method pm
      JOIN app_user u ON u.id = pm.user_id
      WHERE pm.is_enabled = true
        AND lower(pm.identifier) = 'mpesa'
        AND (pm.details->>'verifiedAgent')::text = 'true'
        AND u.status = 'active'
      ORDER BY pm.created_at DESC
    `;

    if (agents.length === 0) {
      agents = await sql<AgentRow[]>`
        SELECT DISTINCT
          u.id::text AS user_id,
          u.email,
          u.status
        FROM p2p_ad ad
        JOIN app_user u ON u.id = ad.user_id
        WHERE u.status = 'active'
        ORDER BY u.email NULLS LAST
      `;
    }

    if (agents.length === 0) {
      agents = await sql<AgentRow[]>`
        SELECT
          u.id::text AS user_id,
          u.email,
          u.status
        FROM app_user u
        WHERE u.status = 'active'
          AND u.email IS NOT NULL
          AND lower(u.email) <> lower(${fromEmail})
          AND u.id NOT IN (
            '00000000-0000-0000-0000-000000000001'::uuid,
            '00000000-0000-0000-0000-000000000002'::uuid,
            '00000000-0000-0000-0000-000000000003'::uuid
          )
        ORDER BY u.email
      `;
    }
  }

  const uniqueAgents = new Map<string, AgentRow>();
  for (const a of agents) uniqueAgents.set(a.user_id, a);

  // Exclude sender if they happen to be a verified agent.
  uniqueAgents.delete(from.id);

  // Exclude any explicitly excluded emails (e.g. admin) when provided.
  if (excludeEmails.length > 0) {
    for (const a of [...uniqueAgents.values()]) {
      const e = (a.email ?? "").trim().toLowerCase();
      if (e && excludeEmails.includes(e)) uniqueAgents.delete(a.user_id);
    }
  }

  const agentList = [...uniqueAgents.values()].filter((a) => (a.email ?? "").trim().length > 0);

  if (execute) {
    const found = new Set(agentList.map((a) => (a.email ?? "").toLowerCase()));
    const missing = agentEmails.filter((e) => !found.has(e));
    if (missing.length > 0) {
      console.error(JSON.stringify({ ok: false, error: "some_agent_emails_not_found", missing }, null, 2));
      process.exit(1);
    }
  }
  if (agentList.length === 0) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: "no_agents_found",
          hint: "No verified P2P agents found and no P2P ad owners found. Seed P2P sellers or mark verifiedAgent on payment methods.",
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const balances = await sql<AssetBalRow[]>`
    WITH accounts AS (
      SELECT la.id AS account_id, a.id AS asset_id, a.chain, a.symbol, a.decimals
      FROM ex_ledger_account la
      JOIN ex_asset a ON a.id = la.asset_id
      WHERE la.user_id = ${from.id}::uuid
        AND la.status = 'active'
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
    )
    SELECT
      ac.asset_id::text AS asset_id,
      ac.chain,
      ac.symbol,
      ac.decimals,
      coalesce(p.posted, 0)::text AS posted,
      coalesce(h.held, 0)::text AS held,
      (coalesce(p.posted, 0) - coalesce(h.held, 0))::text AS available
    FROM accounts ac
    LEFT JOIN posted p ON p.account_id = ac.account_id
    LEFT JOIN held h ON h.account_id = ac.account_id
    ORDER BY ac.symbol ASC
  `;

  const positive = balances
    .map((r) => ({ ...r, availableBig: toBigInt3818(r.available) }))
    .filter((r) => r.availableBig > 0n && r.availableBig >= minBig);

  const n = BigInt(agentList.length);

  const plan = positive.map((r) => {
    const shareRaw = r.availableBig / n;
    const share = quantizeDown3818(shareRaw, r.decimals);
    const totalSent = share * n;
    const remainder = r.availableBig - totalSent;
    return {
      symbol: r.symbol,
      chain: r.chain,
      decimals: r.decimals,
      available: r.available,
      perAgent: fromBigInt3818(share),
      totalSent: fromBigInt3818(totalSent),
      remainder: fromBigInt3818(remainder),
      willTransfer: share > 0n,
    };
  });

  const willTransfer = plan.filter((p) => p.willTransfer);
  const skipped = plan.filter((p) => !p.willTransfer);

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: execute ? "execute" : "dry_run",
        from: { id: from.id, email: from.email, status: from.status },
        agents: agentList.map((a) => ({ id: a.user_id, email: a.email })),
        assetsConsidered: positive.length,
        willTransferCount: willTransfer.length,
        skippedCount: skipped.length,
        ...(execute ? {} : { plan: willTransfer, skipped }),
      },
      null,
      2,
    ),
  );

  if (!execute) {
    console.log(
      `\nDry run only. To execute: npx tsx scripts/distribute-sally-balances-to-p2p-agents.ts --execute --from-email ${fromEmail}`,
    );
    process.exit(0);
  }

  const failures: Array<{ symbol: string; message: string }> = [];

  for (const asset of positive) {
    const share = quantizeDown3818(asset.availableBig / n, asset.decimals);
    if (share <= 0n) continue;

    const totalSent = share * n;
    const shareStr = fromBigInt3818(share);
    const totalSentStr = fromBigInt3818(totalSent);

    try {
      await sql.begin(async (tx) => {
        // Ensure all ledger accounts exist (sender + agents) for this asset.
        await tx`
          INSERT INTO ex_ledger_account (user_id, asset_id)
          VALUES (${from.id}::uuid, ${asset.asset_id}::uuid)
          ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
        `;

        for (const a of agentList) {
          await tx`
            INSERT INTO ex_ledger_account (user_id, asset_id)
            VALUES (${a.user_id}::uuid, ${asset.asset_id}::uuid)
            ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
          `;
        }

        const userIds = [from.id, ...agentList.map((a) => a.user_id)];

        const acctRows = await tx<{ id: string; user_id: string }[]>`
          SELECT la.id::text AS id, la.user_id::text AS user_id
          FROM ex_ledger_account la
          WHERE la.asset_id = ${asset.asset_id}::uuid
            AND la.user_id::text = ANY(${userIds})
        `;

        const accountByUser = new Map<string, string>();
        for (const r of acctRows) accountByUser.set(r.user_id, r.id);

        const fromAcct = accountByUser.get(from.id);
        if (!fromAcct) throw new Error(`missing_sender_account:${asset.symbol}`);

        const entryRows = await tx<{ id: string }[]>`
          INSERT INTO ex_journal_entry (type, reference, metadata_json)
          VALUES (
            'admin_redistribute',
            ${`redistribute:${asset.symbol}:${Date.now()}`},
            ${tx.json({
              from_user_id: from.id,
              from_email: from.email,
              agent_count: agentList.length,
              per_agent: shareStr,
              total_sent: totalSentStr,
              asset_symbol: asset.symbol,
            })}::jsonb
          )
          RETURNING id::text AS id
        `;
        const entryId = entryRows[0]!.id;

        // 1) Sender debit line
        await tx`
          INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
          VALUES (
            ${entryId}::uuid,
            ${fromAcct}::uuid,
            ${asset.asset_id}::uuid,
            ${`-${totalSentStr}`}::numeric
          )
        `;

        // 2) Agent credit lines
        for (const a of agentList) {
          const acct = accountByUser.get(a.user_id);
          if (!acct) throw new Error(`missing_agent_account:${a.user_id}:${asset.symbol}`);
          await tx`
            INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
            VALUES (
              ${entryId}::uuid,
              ${acct}::uuid,
              ${asset.asset_id}::uuid,
              ${shareStr}::numeric
            )
          `;
        }
      });

      console.log(
        JSON.stringify(
          {
            ok: true,
            asset: asset.symbol,
            perAgent: shareStr,
            agentCount: agentList.length,
            totalSent: totalSentStr,
          },
          null,
          2,
        ),
      );
    } catch (e) {
      failures.push({
        symbol: asset.symbol,
        message: e instanceof Error ? e.message : String(e),
      });
      console.error(JSON.stringify({ ok: false, asset: asset.symbol, error: failures[failures.length - 1] }, null, 2));
    }
  }

  if (failures.length > 0) {
    console.error(JSON.stringify({ ok: false, failureCount: failures.length, failures: failures.slice(0, 50) }, null, 2));
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
