import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { enforceAccountSecurityRateLimit } from "@/lib/auth/securityRateLimit";
import { enforceTotpIfEnabled } from "@/lib/auth/requireTotp";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { toBigInt3818 } from "@/lib/exchange/fixed3818";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const subscribeSchema = z.object({
  product_id: z.string().uuid(),
  amount: z.string().min(1).max(80),
  totp_code: z.string().length(6).regex(/^\d{6}$/).optional(),
});

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

  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const rateLimitRes = await enforceAccountSecurityRateLimit({
    sql,
    request,
    limiterName: "earn.positions.subscribe",
    windowMs: 60_000,
    max: 20,
    userId: actingUserId,
  });
  if (rateLimitRes) return rateLimitRes;

  const body = await request.json().catch(() => ({}));
  let input: z.infer<typeof subscribeSchema>;
  try {
    input = subscribeSchema.parse(body);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  // Validate amount format early (3818 scale helper throws on invalid).
  try {
    toBigInt3818(input.amount);
  } catch {
    return apiError("invalid_input");
  }

  try {
    const activeErr = await retryOnceOnTransientDbError(() => requireActiveUser(sql, actingUserId));
    if (activeErr) return apiError(activeErr);

    const totpResp = await enforceTotpIfEnabled(sql, actingUserId, input.totp_code);
    if (totpResp) return totpResp;

    const created = await sql.begin(async (tx) => {
      const txSql = tx as unknown as typeof sql;

      const prodRows = await txSql<
        {
          id: string;
          kind: "flexible" | "locked";
          lock_days: number | null;
          apr_bps: number;
          asset_id: string;
        }[]
      >`
        SELECT p.id::text AS id, p.kind, p.lock_days, p.apr_bps, p.asset_id::text AS asset_id
        FROM earn_product p
        WHERE p.id = ${input.product_id}::uuid AND p.status = 'enabled'
        LIMIT 1
        FOR UPDATE
      `;

      const prod = prodRows[0];
      if (!prod) return { status: 404 as const, body: { error: "not_found" } };

      const userAcct = await ensureLedgerAccount(txSql, actingUserId, prod.asset_id);
      const available = await availableForAccount(txSql, userAcct);

      if (toBigInt3818(available) < toBigInt3818(input.amount)) {
        return { status: 409 as const, body: { error: "insufficient_balance", details: { available, required: input.amount } } };
      }

      const endsAt = prod.kind === "locked" && prod.lock_days
        ? new Date(Date.now() + prod.lock_days * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const posRows = await txSql<{ id: string }[]>`
        INSERT INTO earn_position (
          user_id,
          product_id,
          status,
          principal_amount,
          apr_bps,
          kind,
          lock_days,
          ends_at
        )
        VALUES (
          ${actingUserId}::uuid,
          ${prod.id}::uuid,
          'active',
          ${input.amount}::numeric(38,18),
          ${prod.apr_bps},
          ${prod.kind},
          ${prod.lock_days},
          ${endsAt}::timestamptz
        )
        RETURNING id::text AS id
      `;

      const posId = posRows[0]!.id;

      const holdRows = await txSql<{ id: string }[]>`
        INSERT INTO ex_hold (account_id, asset_id, amount, reason, status)
        VALUES (
          ${userAcct}::uuid,
          ${prod.asset_id}::uuid,
          ${input.amount}::numeric(38,18),
          ${`earn_position:${posId}`},
          'active'
        )
        RETURNING id::text AS id
      `;

      await txSql`
        UPDATE earn_position
        SET hold_id = ${holdRows[0]!.id}::uuid,
            updated_at = now()
        WHERE id = ${posId}::uuid
      `;

      return { status: 201 as const, body: { ok: true, position_id: posId } };
    });

    const err = created.body as any;
    if (err?.error) return apiError(err.error, { status: created.status, details: err.details });

    return Response.json(created.body, { status: created.status });
  } catch (e) {
    const resp = responseForDbError("earn.positions.subscribe", e);
    if (resp) return resp;
    throw e;
  }
}
