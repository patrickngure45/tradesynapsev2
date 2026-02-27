import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { responseForDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Must match the ids used by convert/recurring-buys.
const SYSTEM_LIQUIDITY_USER_ID = "00000000-0000-0000-0000-000000000002";
const SYSTEM_TREASURY_USER_ID = "00000000-0000-0000-0000-000000000001";

const inputSchema = z
  .object({
    chain: z.literal("bsc").optional().default("bsc"),
    // If set, tops up *every* enabled asset to at least this amount.
    // Otherwise uses per-symbol defaults.
    default_target: z.string().optional(),
  })
  .optional();

function defaultTargetForSymbol(symbol: string): string {
  const sym = String(symbol ?? "").trim().toUpperCase();
  if (sym === "USDT" || sym === "USDC") return "100000";
  if (sym === "BTC") return "10";
  if (sym === "ETH") return "250";
  if (sym === "BNB") return "25000";
  return "1000";
}

async function ensureSystemUser(sql: ReturnType<typeof getSql>, userId: string): Promise<void> {
  await sql`
    INSERT INTO app_user (id, status, kyc_level, country)
    VALUES (${userId}::uuid, 'active', 'none', NULL)
    ON CONFLICT (id) DO NOTHING
  `;
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

async function topUpNeededForAccount(
  sql: ReturnType<typeof getSql>,
  accountId: string,
  target: string,
): Promise<{ posted: string; add: string }> {
  const rows = await sql<{ posted: string; add: string }[]>`
    WITH posted AS (
      SELECT coalesce(sum(amount), 0)::numeric AS posted
      FROM ex_journal_line
      WHERE account_id = ${accountId}::uuid
    )
    SELECT
      posted.posted::text AS posted,
      greatest(0, (${target}::numeric - posted.posted))::text AS add
    FROM posted
  `;
  return rows[0] ?? { posted: "0", add: "0" };
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return apiError("not_found");
  }

  const body = await request.json().catch(() => ({}));
  let input: z.infer<NonNullable<typeof inputSchema>> | undefined;
  try {
    input = inputSchema.parse(body);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const sql = getSql();

  try {
    const chain = input?.chain ?? "bsc";
    const defaultTarget = String(input?.default_target ?? "").trim() || null;

    const result = await sql.begin(async (tx) => {
      const txSql = tx as unknown as typeof sql;

      await Promise.all([
        ensureSystemUser(txSql, SYSTEM_LIQUIDITY_USER_ID),
        ensureSystemUser(txSql, SYSTEM_TREASURY_USER_ID),
      ]);

      const assets = await txSql<{ id: string; symbol: string }[]>`
        SELECT id::text AS id, symbol
        FROM ex_asset
        WHERE chain = ${chain} AND is_enabled = true
        ORDER BY symbol ASC
      `;

      const toppedUp: Array<{ symbol: string; target: string; added: string }> = [];

      for (const a of assets) {
        const target = defaultTarget ?? defaultTargetForSymbol(a.symbol);

        const [liqAcct, treAcct] = await Promise.all([
          ensureLedgerAccount(txSql, SYSTEM_LIQUIDITY_USER_ID, a.id),
          ensureLedgerAccount(txSql, SYSTEM_TREASURY_USER_ID, a.id),
        ]);

        // If already funded enough, skip.
        const { posted, add } = await topUpNeededForAccount(txSql, liqAcct, target);
        const addTrim = String(add ?? "0").trim();
        if (!addTrim || addTrim === "0" || addTrim === "0.0") continue;

        const entryRows = await txSql<{ id: string }[]>`
          INSERT INTO ex_journal_entry (type, reference, metadata_json)
          VALUES (
            'dev_seed_liquidity',
            ${`dev_seed_liquidity:${chain}:${a.symbol}`},
            ${txSql.json({ chain, symbol: a.symbol, target })}::jsonb
          )
          RETURNING id::text AS id
        `;
        const entryId = entryRows[0]!.id;

        await txSql`
          INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
          VALUES
            (${entryId}::uuid, ${liqAcct}::uuid, ${a.id}::uuid, (${addTrim}::numeric)),
            (${entryId}::uuid, ${treAcct}::uuid, ${a.id}::uuid, ((${addTrim}::numeric) * -1))
        `;

        toppedUp.push({ symbol: a.symbol, target, added: addTrim });
      }

      return { status: 201 as const, body: { ok: true, chain, topped_up: toppedUp } };
    });

    const err = result.body as { error?: string; details?: unknown };
    if (typeof err.error === "string") {
      return apiError(err.error, { status: result.status, details: err.details });
    }

    return Response.json(result.body, { status: result.status });
  } catch (e) {
    const resp = responseForDbError("exchange.dev.seed_liquidity", e);
    if (resp) return resp;
    throw e;
  }
}
