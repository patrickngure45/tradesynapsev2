import { z } from "zod";
import { NextResponse } from "next/server";

import { apiError, apiZodError } from "@/lib/api/errors";
import { requireAdminForApi } from "@/lib/auth/admin";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { toBigInt3818 } from "@/lib/exchange/fixed3818";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_TREASURY_USER_ID = "00000000-0000-0000-0000-000000000001";

const postSchema = z.object({
  chain: z.enum(["bsc"]).default("bsc"),
  asset_symbol: z.string().trim().min(1).max(32),
  amount: z.string().min(1).max(80),
});

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

async function availableForAccount(sql: ReturnType<typeof getSql>, accountId: string): Promise<string> {
  const rows = await sql<{ available: string }[]>`
    WITH posted AS (
      SELECT coalesce(sum(amount), 0)::numeric AS posted
      FROM ex_journal_line
      WHERE account_id = ${accountId}::uuid
    ),
    held AS (
      SELECT coalesce(sum(remaining_amount), 0)::numeric AS held
      FROM ex_hold
      WHERE account_id = ${accountId}::uuid AND status = 'active'
    )
    SELECT (posted.posted - held.held)::text AS available
    FROM posted, held
  `;
  return rows[0]?.available ?? "0";
}

export async function POST(request: Request) {
  const sql = getSql();
  const admin = await requireAdminForApi(sql, request);
  if (!admin.ok) return admin.response;

  const json = await request.json().catch(() => ({}));
  let input: z.infer<typeof postSchema>;
  try {
    input = postSchema.parse(json);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  try {
    toBigInt3818(input.amount);
  } catch {
    return apiError("invalid_input");
  }

  try {
    const result = await retryOnceOnTransientDbError(async () => {
      return await sql.begin(async (tx) => {
        const txSql = tx as unknown as typeof sql;

        const rows = await txSql<{ id: string; symbol: string }[]>`
          SELECT id::text AS id, symbol
          FROM ex_asset
          WHERE chain = ${input.chain}
            AND is_enabled = true
            AND upper(symbol) = upper(${input.asset_symbol})
          LIMIT 1
          FOR UPDATE
        `;

        const asset = rows[0];
        if (!asset) return { status: 404 as const, body: { error: "asset_not_found" } };

        await ensureSystemUser(txSql, SYSTEM_TREASURY_USER_ID);

        const [fromAcct, toAcct] = await Promise.all([
          ensureLedgerAccount(txSql, admin.userId, asset.id),
          ensureLedgerAccount(txSql, SYSTEM_TREASURY_USER_ID, asset.id),
        ]);

        const available = await availableForAccount(txSql, fromAcct);
        if (toBigInt3818(available) < toBigInt3818(input.amount)) {
          return {
            status: 409 as const,
            body: { error: "insufficient_balance", details: { available, required: input.amount } },
          };
        }

        const entryRows = await txSql<{ id: string; created_at: string }[]>`
          INSERT INTO ex_journal_entry (type, reference, metadata_json)
          VALUES (
            'earn_treasury_fund',
            ${`earn_treasury_fund:${Date.now()}`},
            ${(txSql as any).json({
              actor_admin_user_id: admin.userId,
              asset_symbol: asset.symbol,
              amount: input.amount,
            })}::jsonb
          )
          RETURNING id::text AS id, created_at::text AS created_at
        `;

        const entryId = entryRows[0]!.id;

        await txSql`
          INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
          VALUES
            (${entryId}::uuid, ${toAcct}::uuid, ${asset.id}::uuid, (${input.amount}::numeric)),
            (${entryId}::uuid, ${fromAcct}::uuid, ${asset.id}::uuid, ((${input.amount}::numeric) * -1))
        `;

        return {
          status: 201 as const,
          body: { ok: true, entry_id: entryId, created_at: entryRows[0]!.created_at },
        };
      });
    });

    const err = result.body as any;
    if (err?.error) return apiError(err.error, { status: result.status, details: err.details });
    return NextResponse.json(result.body, { status: result.status });
  } catch (e) {
    const resp = responseForDbError("exchange.admin.earn.treasury.fund", e);
    if (resp) return resp;
    return apiError("internal_error");
  }
}
