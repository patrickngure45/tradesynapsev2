import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { enforceAccountSecurityRateLimit } from "@/lib/auth/securityRateLimit";
import { enforceTotpIfEnabled } from "@/lib/auth/requireTotp";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { recordInternalChainTx } from "@/lib/exchange/internalChain";
import { toBigInt3818 } from "@/lib/exchange/fixed3818";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_TREASURY_USER_ID = "00000000-0000-0000-0000-000000000001";
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

const bodySchema = z.object({
  totp_code: z.string().length(6).regex(/^\d{6}$/).optional(),
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

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const sql = getSql();

  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const rateLimitRes = await enforceAccountSecurityRateLimit({
    sql,
    request,
    limiterName: "earn.positions.claim",
    windowMs: 60_000,
    max: 20,
    userId: actingUserId,
  });
  if (rateLimitRes) return rateLimitRes;

  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return apiError("invalid_input");

  const body = await request.json().catch(() => ({}));
  let input: z.infer<typeof bodySchema>;
  try {
    input = bodySchema.parse(body);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  try {
    const activeErr = await retryOnceOnTransientDbError(() => requireActiveUser(sql, actingUserId));
    if (activeErr) return apiError(activeErr);

    const totpResp = await enforceTotpIfEnabled(sql, actingUserId, input.totp_code);
    if (totpResp) return totpResp;

    const result = await sql.begin(async (tx) => {
      const txSql = tx as unknown as typeof sql;

      const rows = await txSql<
        {
          id: string;
          user_id: string;
          status: string;
          principal_amount: string;
          apr_bps: number;
          started_at: string;
          last_claim_at: string | null;
          asset_id: string;
          asset_symbol: string;
        }[]
      >`
        SELECT
          pos.id::text AS id,
          pos.user_id::text AS user_id,
          pos.status,
          pos.principal_amount::text AS principal_amount,
          pos.apr_bps,
          pos.started_at::text AS started_at,
          pos.last_claim_at::text AS last_claim_at,
          a.id::text AS asset_id,
          a.symbol AS asset_symbol
        FROM earn_position pos
        JOIN earn_product p ON p.id = pos.product_id
        JOIN ex_asset a ON a.id = p.asset_id
        WHERE pos.id = ${id}::uuid
        LIMIT 1
        FOR UPDATE
      `;

      const pos = rows[0];
      if (!pos) return { status: 404 as const, body: { error: "not_found" } };
      if (pos.user_id !== actingUserId) return { status: 403 as const, body: { error: "actor_not_allowed" } };
      if (pos.status !== "active") return { status: 409 as const, body: { error: "not_active" } };

      const claimRows = await txSql<{ interest: string; now_ts: string }[]>`
        SELECT
          (
            (${pos.principal_amount}::numeric(38,18))
              * (${pos.apr_bps}::numeric / 10000)
              * (greatest(0, extract(epoch from (now() - coalesce(${pos.last_claim_at}::timestamptz, ${pos.started_at}::timestamptz))))::numeric / ${SECONDS_PER_YEAR}::numeric)
          )::numeric(38,18)::text AS interest,
          now()::text AS now_ts
      `;

      const interest = String(claimRows[0]?.interest ?? "0").trim();
      if (!interest || interest === "0" || interest === "0.0") {
        await txSql`
          UPDATE earn_position
          SET last_claim_at = now(), updated_at = now()
          WHERE id = ${id}::uuid
        `;
        return { status: 200 as const, body: { ok: true, credited: "0", asset: pos.asset_symbol } };
      }

      await ensureSystemUser(txSql, SYSTEM_TREASURY_USER_ID);

      const [userAcct, treasuryAcct] = await Promise.all([
        ensureLedgerAccount(txSql, actingUserId, pos.asset_id),
        ensureLedgerAccount(txSql, SYSTEM_TREASURY_USER_ID, pos.asset_id),
      ]);

      const treasuryAvailable = await availableForAccount(txSql, treasuryAcct);
      if (toBigInt3818(treasuryAvailable) < toBigInt3818(interest)) {
        return {
          status: 409 as const,
          body: {
            error: "insufficient_treasury",
            details: { available: treasuryAvailable, required: interest, asset: pos.asset_symbol },
          },
        };
      }

      const entryRows = await txSql<{ id: string; created_at: string }[]>`
        INSERT INTO ex_journal_entry (type, reference, metadata_json)
        VALUES (
          'earn_interest',
          ${`earn_interest:${id}:${Date.now()}`},
          ${(txSql as any).json({ user_id: actingUserId, position_id: id, asset: pos.asset_symbol, amount: interest })}::jsonb
        )
        RETURNING id::text AS id, created_at::text AS created_at
      `;

      const entryId = entryRows[0]!.id;

      await txSql`
        INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
        VALUES
          (${entryId}::uuid, ${userAcct}::uuid, ${pos.asset_id}::uuid, (${interest}::numeric)),
          (${entryId}::uuid, ${treasuryAcct}::uuid, ${pos.asset_id}::uuid, ((${interest}::numeric) * -1))
      `;

      const receipt = await recordInternalChainTx(txSql as any, {
        entryId,
        type: "earn_interest",
        userId: actingUserId,
        metadata: { position_id: id, asset: pos.asset_symbol, amount: interest },
      });

      await txSql`
        UPDATE earn_position
        SET last_claim_at = now(), updated_at = now()
        WHERE id = ${id}::uuid
      `;

      return {
        status: 201 as const,
        body: {
          ok: true,
          credited: interest,
          asset: pos.asset_symbol,
          entry_id: entryId,
          tx_hash: receipt.txHash,
          block_height: receipt.blockHeight,
          created_at: entryRows[0]!.created_at,
        },
      };
    });

    const err = result.body as any;
    if (err?.error) return apiError(err.error, { status: result.status, details: err.details });

    return Response.json(result.body, { status: result.status });
  } catch (e) {
    const resp = responseForDbError("earn.positions.claim", e);
    if (resp) return resp;
    throw e;
  }
}
