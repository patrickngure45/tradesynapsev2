import { z } from "zod";

import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { apiError, apiZodError } from "@/lib/api/errors";
import { amount3818PositiveSchema } from "@/lib/exchange/amount";
import { responseForDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_USER_ID = "00000000-0000-4000-8000-000000000001";

const creditSchema = z.object({
  chain: z.literal("bsc").optional().default("bsc"),
  user_id: z.string().uuid().optional(),
  asset_symbol: z.string().min(2).max(16),
  amount: amount3818PositiveSchema,
  reference: z.string().min(1).max(200).optional(),
});

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return apiError("not_found");
  }

  const sql = getSql();

  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);

  const body = await request.json().catch(() => ({}));
  let input: z.infer<typeof creditSchema>;
  try {
    input = creditSchema.parse(body);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const userId = input.user_id ?? actingUserId;
  if (!userId) return apiError("missing_x_user_id");

  try {
    const activeErr = await requireActiveUser(sql, userId);
    if (activeErr) return apiError(activeErr);

    const result = await sql.begin(async (tx) => {
      const txSql = tx as unknown as typeof sql;

    // Ensure a stable system user exists for balancing entries.
    await txSql`
      INSERT INTO app_user (id, status, kyc_level, country)
      VALUES (${SYSTEM_USER_ID}::uuid, 'active', 'full', 'ZZ')
      ON CONFLICT (id) DO NOTHING
    `;

    const assets = await txSql<{ id: string; decimals: number }[]>`
      SELECT id, decimals
      FROM ex_asset
      WHERE chain = ${input.chain} AND symbol = ${input.asset_symbol} AND is_enabled = true
      LIMIT 1
    `;

    if (assets.length === 0) {
      return { status: 404 as const, body: { error: "not_found" } };
    }

    const assetId = assets[0]!.id;

    const userAccountRows = await txSql<{ id: string }[]>`
      INSERT INTO ex_ledger_account (user_id, asset_id)
      VALUES (${userId}, ${assetId})
      ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
      RETURNING id
    `;

    const systemAccountRows = await txSql<{ id: string }[]>`
      INSERT INTO ex_ledger_account (user_id, asset_id)
      VALUES (${SYSTEM_USER_ID}::uuid, ${assetId})
      ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
      RETURNING id
    `;

    const userAccountId = userAccountRows[0]!.id;
    const systemAccountId = systemAccountRows[0]!.id;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entryRows = await (txSql as any)<{ id: string }[]>`
      INSERT INTO ex_journal_entry (type, reference, metadata_json)
      VALUES (
        'dev_credit',
        ${input.reference ?? null},
        ${{ chain: input.chain, asset_symbol: input.asset_symbol }}::jsonb
      )
      RETURNING id
    `;

    const entryId = entryRows[0]!.id;

    // Credit user, debit system (per-asset sum must be 0).
    await txSql`
      INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
      VALUES
        (${entryId}, ${userAccountId}, ${assetId}, (${input.amount}::numeric)),
        (${entryId}, ${systemAccountId}, ${assetId}, ((${input.amount}::numeric) * -1))
    `;

    return {
      status: 201 as const,
      body: {
        ok: true,
        entry_id: entryId,
        user_id: userId,
        asset_id: assetId,
        amount: input.amount,
      },
    };
    });

    const err = result.body as { error?: string; details?: unknown };
    if (typeof err.error === "string") {
      return apiError(err.error, { status: result.status, details: err.details });
    }

    return Response.json(result.body, { status: result.status });
  } catch (e) {
    const resp = responseForDbError("exchange.dev.credit", e);
    if (resp) return resp;
    throw e;
  }
}
