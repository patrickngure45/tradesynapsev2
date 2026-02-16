import "dotenv/config";

import { getSql } from "../src/lib/db";
import { toBigInt3818 } from "../src/lib/exchange/fixed3818";

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

type CreditRow = {
  symbol: string;
  user_id: string;
  amount: string;
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
  const minAmount = String(args.get("min-amount") ?? "0");
  return { fromEmail, minAmount };
}

function pow10(n: bigint): bigint {
  if (n < 0n) throw new Error("pow10 negative");
  let out = 1n;
  for (let i = 0n; i < n; i++) out *= 10n;
  return out;
}

function quantizeDown3818(value3818: bigint, decimals: number): bigint {
  const d = Math.max(0, Math.min(18, Math.trunc(decimals)));
  const step = pow10(BigInt(18 - d));
  return (value3818 / step) * step;
}

async function main() {
  const { fromEmail, minAmount } = parseArgs(process.argv);
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

  let agents = await sql<AgentRow[]>`
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

  const uniqueAgents = new Map<string, AgentRow>();
  for (const a of agents) uniqueAgents.set(a.user_id, a);
  uniqueAgents.delete(from.id);

  const agentList = [...uniqueAgents.values()].filter((a) => (a.email ?? "").trim().length > 0);
  if (agentList.length === 0) {
    console.error(JSON.stringify({ ok: false, error: "no_agents_found" }, null, 2));
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

  const nAgents = BigInt(agentList.length);

  const stillDistributable = balances
    .map((r) => {
      const availableBig = toBigInt3818(r.available);
      const share = quantizeDown3818(availableBig / nAgents, r.decimals);
      return { ...r, availableBig, share };
    })
    .filter((r) => r.availableBig > 0n && r.availableBig >= minBig && r.share > 0n);

  const entryCountRows = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n
    FROM ex_journal_entry
    WHERE type = 'admin_redistribute'
      AND metadata_json->>'from_user_id' = ${from.id}
  `;

  const distinctAssetRows = await sql<{ n: number }[]>`
    SELECT count(DISTINCT (metadata_json->>'asset_symbol'))::int AS n
    FROM ex_journal_entry
    WHERE type = 'admin_redistribute'
      AND metadata_json->>'from_user_id' = ${from.id}
      AND (metadata_json->>'asset_symbol') IS NOT NULL
  `;

  const agentIds = agentList.map((a) => a.user_id);

  const credits = await sql<CreditRow[]>`
    SELECT
      (je.metadata_json->>'asset_symbol')::text AS symbol,
      la.user_id::text AS user_id,
      coalesce(sum(jl.amount), 0)::numeric(38,18)::text AS amount
    FROM ex_journal_entry je
    JOIN ex_journal_line jl ON jl.entry_id = je.id
    JOIN ex_ledger_account la ON la.id = jl.account_id
    WHERE je.type = 'admin_redistribute'
      AND je.metadata_json->>'from_user_id' = ${from.id}
      AND la.user_id::text = ANY(${agentIds})
      AND jl.amount > 0
    GROUP BY (je.metadata_json->>'asset_symbol'), la.user_id
    ORDER BY symbol ASC, user_id ASC
  `;

  const creditsBySymbol = new Map<string, Map<string, bigint>>();
  for (const r of credits) {
    if (!r.symbol) continue;
    let byUser = creditsBySymbol.get(r.symbol);
    if (!byUser) {
      byUser = new Map<string, bigint>();
      creditsBySymbol.set(r.symbol, byUser);
    }
    byUser.set(r.user_id, toBigInt3818(r.amount));
  }

  const unequal: Array<{ symbol: string; amounts: Record<string, string> }> = [];
  for (const [symbol, byUser] of creditsBySymbol.entries()) {
    const amounts: bigint[] = [];
    const amountByAgent: Record<string, string> = {};

    for (const a of agentList) {
      const v = byUser.get(a.user_id) ?? 0n;
      amounts.push(v);
      amountByAgent[a.email ?? a.user_id] = rtrimZeros(v);
    }

    const min = amounts.reduce((m, x) => (x < m ? x : m), amounts[0] ?? 0n);
    const max = amounts.reduce((m, x) => (x > m ? x : m), amounts[0] ?? 0n);
    if (min !== max) {
      unequal.push({ symbol, amounts: amountByAgent });
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: stillDistributable.length === 0 && unequal.length === 0,
        from: { id: from.id, email: from.email, status: from.status },
        agents: agentList.map((a) => ({ id: a.user_id, email: a.email })),
        adminRedistributeEntryCount: entryCountRows[0]?.n ?? 0,
        adminRedistributeDistinctAssets: distinctAssetRows[0]?.n ?? 0,
        sallyAssetsStillDistributable: stillDistributable.length,
        sallyDistributablePreview: stillDistributable.slice(0, 15).map((r) => ({
          symbol: r.symbol,
          available: r.available,
          decimals: r.decimals,
        })),
        unequalAgentCreditAssets: unequal.length,
        unequalAgentCreditPreview: unequal.slice(0, 15),
      },
      null,
      2,
    ),
  );

  process.exit(stillDistributable.length === 0 && unequal.length === 0 ? 0 : 2);
}

function rtrimZeros(value3818: bigint): string {
  // Human-friendly formatting only for debugging; avoids scientific notation.
  let s = value3818.toString().padStart(19, "0");
  const whole = s.slice(0, -18);
  let frac = s.slice(-18);
  frac = frac.replace(/0+$/, "");
  return frac.length ? `${whole}.${frac}` : whole;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
