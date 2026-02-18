import { z } from "zod";

import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { apiError, apiZodError } from "@/lib/api/errors";
import { amount3818PositiveSchema } from "@/lib/exchange/amount";
import { enqueueOutbox } from "@/lib/outbox";
import { responseForDbError } from "@/lib/dbTransient";
import { logRouteResponse } from "@/lib/routeLog";
import { writeAuditLog, auditContextFromRequest } from "@/lib/auditLog";
import { checkWithdrawalVelocity } from "@/lib/exchange/withdrawalVelocity";
import { enforceTotpIfEnabled } from "@/lib/auth/requireTotp";
import { chargeGasFeeFromQuote, quoteGasFee } from "@/lib/exchange/gas";
import { add3818, toBigInt3818 } from "@/lib/exchange/fixed3818";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bscAddress = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/i, "Invalid address")
  .transform((s) => s.toLowerCase());

const requestSchema = z.object({
  asset_id: z.string().uuid(),
  amount: amount3818PositiveSchema,
  destination_address: bscAddress,
  reference: z.string().min(1).max(200).optional(),
  totp_code: z.string().length(6).regex(/^\d{6}$/).optional(),
});

export async function POST(request: Request) {
  const startMs = Date.now();
  const sql = getSql();

  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return apiError(activeErr);

    const body = await request.json().catch(() => ({}));
    let input: z.infer<typeof requestSchema>;
    try {
      input = requestSchema.parse(body);
    } catch (e) {
      return apiZodError(e) ?? apiError("invalid_input");
    }

    // ── TOTP enforcement (if user has 2FA enabled) ────────────────
    const totpResp = await enforceTotpIfEnabled(sql, actingUserId, input.totp_code);
    if (totpResp) return totpResp;

    // ── Velocity check (hard limit, outside the transaction) ──────────
    const velocity = await checkWithdrawalVelocity(sql, actingUserId, input.amount);
    if (!velocity.ok) {
      return Response.json(
        { error: velocity.code, detail: velocity.detail },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    }

    const result = await sql.begin(async (tx) => {
      const txSql = tx as unknown as typeof sql;

    const assets = await txSql<{ id: string; chain: string; symbol: string }[]>`
      SELECT id, chain, symbol
      FROM ex_asset
      WHERE id = ${input.asset_id} AND is_enabled = true
      LIMIT 1
    `;
    if (assets.length === 0) {
      return { status: 404 as const, body: { error: "not_found" } };
    }

    const asset = assets[0]!;
    if (asset.chain !== "bsc") {
      return { status: 400 as const, body: { error: "invalid_input", details: "unsupported_chain" } };
    }

    const allowlisted = await txSql<{ id: string; status: string }[]>`
      SELECT id, status
      FROM ex_withdrawal_allowlist
      WHERE user_id = ${actingUserId} AND chain = ${asset.chain} AND address = ${input.destination_address}
      LIMIT 1
    `;

    if (allowlisted.length === 0 || allowlisted[0]!.status !== "active") {
      return { status: 403 as const, body: { error: "withdrawal_address_not_allowlisted" } };
    }

    const accounts = await txSql<{ id: string }[]>`
      INSERT INTO ex_ledger_account (user_id, asset_id)
      VALUES (${actingUserId}, ${asset.id})
      ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
      RETURNING id
    `;
    const accountId = accounts[0]!.id;

    const balRows = await txSql<
      { posted: string; held: string; available: string; ok: boolean }[]
    >`
      WITH posted AS (
        SELECT coalesce(sum(amount), 0)::numeric AS posted
        FROM ex_journal_line
        WHERE account_id = ${accountId}
      ),
      held AS (
          SELECT coalesce(sum(remaining_amount), 0)::numeric AS held
        FROM ex_hold
        WHERE account_id = ${accountId} AND status = 'active'
      )
      SELECT
        posted.posted::text AS posted,
        held.held::text AS held,
        (posted.posted - held.held)::text AS available,
        ((posted.posted - held.held) >= (${input.amount}::numeric)) AS ok
      FROM posted, held
    `;

    const bal = balRows[0];

    const gasQuote = await quoteGasFee(txSql, {
      action: "withdrawal_request",
      chain: asset.chain,
      assetSymbol: asset.symbol,
    });
    if ("code" in gasQuote) {
      return { status: 409 as const, body: { error: gasQuote.code, details: gasQuote.details } };
    }

    const feeChargeAmount = gasQuote.enabled ? (gasQuote.chargeAmount ?? "") : "0";
    if (gasQuote.enabled && (!feeChargeAmount || toBigInt3818(feeChargeAmount) < 0n)) {
      return {
        status: 409 as const,
        body: {
          error: "gas_fee_invalid",
          details: { message: "missing_fee_charge_amount", quote: gasQuote },
        },
      };
    }

    const requestedTotal = add3818(input.amount, feeChargeAmount || "0");
    const availableBig = toBigInt3818(bal?.available ?? "0");
    const okTotal = availableBig >= toBigInt3818(requestedTotal);
    if (!okTotal) {
      return {
        status: 409 as const,
        body: {
          error: "insufficient_balance",
          details: {
            posted: bal?.posted ?? "0",
            held: bal?.held ?? "0",
            available: bal?.available ?? "0",
            requested: input.amount,
            network_fee_display: gasQuote.enabled
              ? { amount: gasQuote.amount, symbol: gasQuote.gasSymbol }
              : { amount: "0", symbol: gasQuote.gasSymbol },
            fee_charged_in_asset: feeChargeAmount || "0",
            total_debit: requestedTotal,
          },
        },
      };
    }

    // Create request first to get an id, then create the hold referencing it.
    const reqRows = await txSql<
      {
        id: string;
        status: string;
        created_at: string;
      }[]
    >`
      INSERT INTO ex_withdrawal_request (
        user_id,
        asset_id,
        amount,
        destination_address,
        allowlist_id,
        status,
        reference
      )
      VALUES (
        ${actingUserId},
        ${asset.id},
        (${input.amount}::numeric),
        ${input.destination_address},
        ${allowlisted[0]!.id},
        'requested',
        ${input.reference ?? null}
      )
      RETURNING id, status, created_at
    `;

    const withdrawalId = reqRows[0]!.id;

    const holdRows = await txSql<
      { id: string; amount: string; status: string; created_at: string }[]
    >`
      INSERT INTO ex_hold (account_id, asset_id, amount, reason)
      VALUES (${accountId}, ${asset.id}, (${input.amount}::numeric), ${`withdrawal:${withdrawalId}`})
      RETURNING id, amount::text AS amount, status, created_at
    `;

    const holdId = holdRows[0]!.id;

    await txSql`
      UPDATE ex_withdrawal_request
      SET hold_id = ${holdId}, updated_at = now()
      WHERE id = ${withdrawalId}
    `;

    await enqueueOutbox(txSql, {
      topic: "ex.withdrawal.requested",
      aggregate_type: "withdrawal",
      aggregate_id: withdrawalId,
      payload: {
        withdrawal_id: withdrawalId,
        user_id: actingUserId,
        asset_id: asset.id,
        asset_symbol: asset.symbol,
        chain: asset.chain,
        amount: input.amount,
        destination_address: input.destination_address,
      },
    });

    if (gasQuote.enabled && toBigInt3818(feeChargeAmount || "0") > 0n) {
      const gasErr = await chargeGasFeeFromQuote(
        txSql,
        {
          userId: actingUserId,
          action: "withdrawal_request",
          reference: `withdrawal:${withdrawalId}`,
          chain: asset.chain,
          assetSymbol: asset.symbol,
        },
        gasQuote,
      );
      if (gasErr) {
        return { status: 409 as const, body: { error: gasErr.code, details: gasErr.details } };
      }
    }

      return {
        status: 201 as const,
        body: {
          withdrawal: {
            id: withdrawalId,
            asset_id: asset.id,
            chain: asset.chain,
            symbol: asset.symbol,
            amount: input.amount,
            destination_address: input.destination_address,
            status: "requested",
            hold_id: holdId,
            created_at: reqRows[0]!.created_at,
            fees: gasQuote.enabled
              ? {
                network_fee_display_amount: gasQuote.amount,
                network_fee_display_symbol: gasQuote.gasSymbol,
                fee_charged_in_asset_amount: feeChargeAmount || "0",
                fee_charged_in_asset_symbol: asset.symbol,
              }
              : {
                network_fee_display_amount: "0",
                network_fee_display_symbol: gasQuote.gasSymbol,
                fee_charged_in_asset_amount: "0",
                fee_charged_in_asset_symbol: asset.symbol,
              },
          },
        },
      };
    });

    const err = result.body as { error?: string; details?: unknown };
    if (typeof err.error === "string") {
      return apiError(err.error, { status: result.status, details: err.details });
    }

    const response = Response.json(result.body, { status: result.status });
    logRouteResponse(request, response, { startMs, userId: actingUserId, meta: { withdrawalId: (result.body as any)?.withdrawal?.id } });

    try {
      const w = (result.body as any)?.withdrawal;
      if (w?.id) {
        await writeAuditLog(sql, {
          actorId: actingUserId,
          actorType: "user",
          action: "withdrawal.requested",
          resourceType: "withdrawal",
          resourceId: w.id,
          ...auditContextFromRequest(request),
          detail: { amount: w.amount, asset_id: w.asset_id, destination: w.destination_address },
        });
      }
    } catch { /* audit log failure must not block the response */ }

    return response;
  } catch (e) {
    const resp = responseForDbError("exchange.withdrawals.request", e);
    if (resp) return resp;
    console.error("exchange.withdrawals.request failed:", e);
    return apiError("internal_error", {
      details: {
        message: e instanceof Error ? e.message : String(e),
      },
    });
  }
}
