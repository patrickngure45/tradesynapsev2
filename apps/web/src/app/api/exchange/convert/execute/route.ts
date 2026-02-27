import { z } from "zod";

import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { enforceTotpIfEnabled } from "@/lib/auth/requireTotp";
import { apiError, apiZodError } from "@/lib/api/errors";
import { amount3818PositiveSchema } from "@/lib/exchange/amount";
import { responseForDbError } from "@/lib/dbTransient";
import { buildConvertJournalLines, convertFeeBps, quoteConvert } from "@/lib/exchange/convert";
import { toBigInt3818 } from "@/lib/exchange/fixed3818";
import { recordInternalChainTx } from "@/lib/exchange/internalChain";
import { logArcadeConsumption } from "@/lib/arcade/consumption";
import { enforceAccountSecurityRateLimit } from "@/lib/auth/securityRateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// System users for strict accounting:
// - Liquidity pool: holds inventory used to fulfill conversions.
// - Treasury: collects conversion fees.
const SYSTEM_LIQUIDITY_USER_ID = "00000000-0000-0000-0000-000000000002";
const SYSTEM_TREASURY_USER_ID = "00000000-0000-0000-0000-000000000001";

const requestSchema = z.object({
  from: z.string().min(1).max(12),
  to: z.string().min(1).max(12),
  amount_in: amount3818PositiveSchema,
  reference: z.string().min(1).max(200).optional(),
  totp_code: z.string().length(6).regex(/^\d{6}$/).optional(),
  use_fee_boost: z.boolean().optional().default(false),
  client_quote: z
    .object({
      amount_out: amount3818PositiveSchema,
      rate_to_per_from: amount3818PositiveSchema,
    })
    .optional(),
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

async function ensureSystemUser(sql: ReturnType<typeof getSql>, userId: string): Promise<void> {
  await sql`
    INSERT INTO app_user (id, status, kyc_level, country)
    VALUES (${userId}::uuid, 'active', 'none', NULL)
    ON CONFLICT (id) DO NOTHING
  `;
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

  const rl = await enforceAccountSecurityRateLimit({
    sql: sql as any,
    request,
    limiterName: "exchange.convert.execute",
    windowMs: 60_000,
    max: 20,
    userId: actingUserId,
  });
  if (rl) return rl;

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

    const totpResp = await enforceTotpIfEnabled(sql, actingUserId, input.totp_code);
    if (totpResp) return totpResp;

    const result = await sql.begin(async (tx) => {
      const txSql = tx as unknown as typeof sql;

      const fromSym = input.from.trim().toUpperCase();
      const toSym = input.to.trim().toUpperCase();
      if (fromSym === toSym) {
        return { status: 409 as const, body: { error: "same_asset" } };
      }

      const assets = await txSql<{ id: string; symbol: string }[]>`
        SELECT id::text AS id, symbol
        FROM ex_asset
        WHERE chain = 'bsc'
          AND is_enabled = true
          AND symbol = ANY(${[fromSym, toSym]})
      `;

      const fromAsset = assets.find((a) => a.symbol.toUpperCase() === fromSym) ?? null;
      const toAsset = assets.find((a) => a.symbol.toUpperCase() === toSym) ?? null;
      if (!fromAsset || !toAsset) {
        return { status: 404 as const, body: { error: "asset_not_found" } };
      }

      const baseFeeBps = convertFeeBps();
      let effectiveFeeBps = baseFeeBps;
      let feeBoost: null | { inventory_id: string; code: string; quantity: number; bps: number } = null;

      if (input.use_fee_boost) {
        const invRows = await txSql<
          { id: string; quantity: number; code: string }[]
        >`
          SELECT id::text AS id, quantity, code
          FROM arcade_inventory
          WHERE user_id = ${actingUserId}::uuid
            AND kind = 'boost'
            AND code = ANY(ARRAY['fee_25bps_7d','fee_15bps_72h','fee_10bps_48h','fee_5bps_24h']::text[])
          ORDER BY
            CASE code
              WHEN 'fee_25bps_7d' THEN 1
              WHEN 'fee_15bps_72h' THEN 2
              WHEN 'fee_10bps_48h' THEN 3
              WHEN 'fee_5bps_24h' THEN 4
              ELSE 99
            END,
            updated_at DESC
          LIMIT 1
          FOR UPDATE
        `;

        if (!invRows.length || Number(invRows[0]!.quantity ?? 0) <= 0) {
          return { status: 409 as const, body: { error: "insufficient_balance", details: { message: "No fee discount boost available." } } };
        }

        const inv = invRows[0]!;
        const m = String(inv.code ?? "").match(/fee_(\d+)bps/i);
        const bps = m ? Number(m[1]) : 0;
        if (!Number.isFinite(bps) || bps <= 0 || bps > 2500) {
          return { status: 409 as const, body: { error: "internal_error", details: { message: "invalid_fee_boost" } } };
        }

        feeBoost = { inventory_id: inv.id, code: inv.code, quantity: Number(inv.quantity ?? 0), bps };
        effectiveFeeBps = Math.max(0, baseFeeBps - bps);
      }

      const quote = await quoteConvert(txSql as any, {
        fromSymbol: fromSym,
        toSymbol: toSym,
        amountIn: input.amount_in,
        feeBps: effectiveFeeBps,
      });
      if (!quote) {
        return { status: 409 as const, body: { error: "quote_unavailable" } };
      }

      // Professional UX guard: ensure we execute against the locked client quote.
      // If price moved between quote and execute, force user to review the new quote.
      if (input.client_quote) {
        const clientAmountOut = toBigInt3818(input.client_quote.amount_out);
        const serverAmountOut = toBigInt3818(quote.amountOut);
        const clientRate = toBigInt3818(input.client_quote.rate_to_per_from);
        const serverRate = toBigInt3818(quote.rateToPerFrom);

        if (clientAmountOut !== serverAmountOut || clientRate !== serverRate) {
          return {
            status: 409 as const,
            body: {
              error: "price_changed",
              details: {
                client_quote: input.client_quote,
                server_quote: quote,
              },
            },
          };
        }
      }

      // Available check in FROM asset.
      const userFromAcct = await ensureLedgerAccount(txSql, actingUserId, fromAsset.id);

      const available = await availableForAccount(txSql, userFromAcct);
      if (toBigInt3818(available) < toBigInt3818(quote.amountIn)) {
        return {
          status: 409 as const,
          body: {
            error: "insufficient_balance",
            details: { available, required: quote.amountIn },
          },
        };
      }

      await Promise.all([
        ensureSystemUser(txSql, SYSTEM_LIQUIDITY_USER_ID),
        ensureSystemUser(txSql, SYSTEM_TREASURY_USER_ID),
      ]);

      const [userToAcct, systemFromAcct, systemToAcct, treasuryFromAcct] = await Promise.all([
        ensureLedgerAccount(txSql, actingUserId, toAsset.id),
        ensureLedgerAccount(txSql, SYSTEM_LIQUIDITY_USER_ID, fromAsset.id),
        ensureLedgerAccount(txSql, SYSTEM_LIQUIDITY_USER_ID, toAsset.id),
        ensureLedgerAccount(txSql, SYSTEM_TREASURY_USER_ID, fromAsset.id),
      ]);

      // Liquidity check (strict accounting): the pool must have enough TO asset to deliver.
      const systemToAvailable = await availableForAccount(txSql, systemToAcct);
      if (toBigInt3818(systemToAvailable) < toBigInt3818(quote.amountOut)) {
        return {
          status: 409 as const,
          body: {
            error: "liquidity_unavailable",
            details: {
              available: systemToAvailable,
              required: quote.amountOut,
              asset: toSym,
            },
          },
        };
      }

      const entryRows = await txSql<{ id: string; created_at: string }[]>`
        INSERT INTO ex_journal_entry (type, reference, metadata_json)
        VALUES (
          'convert',
          ${input.reference ?? `convert:${fromSym}->${toSym}:${Date.now()}`},
          ${txSql.json({
            user_id: actingUserId,
            from: fromSym,
            to: toSym,
            amount_in: quote.amountIn,
            fee_in: quote.feeIn,
            net_in: quote.netIn,
            amount_out: quote.amountOut,
            rate_to_per_from: quote.rateToPerFrom,
            fee_bps: effectiveFeeBps,
            fee_bps_base: baseFeeBps,
            fee_boost: feeBoost ? { code: feeBoost.code, bps: feeBoost.bps } : null,
            price_source: quote.priceSource,
          })}::jsonb
        )
        RETURNING id::text AS id, created_at::text AS created_at
      `;
      const entryId = entryRows[0]!.id;

      const lines = buildConvertJournalLines({
        userFromAcct,
        userToAcct,
        systemFromAcct,
        systemToAcct,
        treasuryFromAcct,
        fromAssetId: fromAsset.id,
        toAssetId: toAsset.id,
        quote,
      });

      // Insert lines one-by-one (small N) to avoid dynamic VALUES hazards.
      for (const l of lines) {
        await txSql`
          INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
          VALUES (${entryId}::uuid, ${l.accountId}::uuid, ${l.assetId}::uuid, (${l.amount}::numeric))
        `;
      }

      const receipt = await recordInternalChainTx(txSql as any, {
        entryId,
        type: "convert",
        userId: actingUserId,
        metadata: {
          from: fromSym,
          to: toSym,
          amount_in: quote.amountIn,
          amount_out: quote.amountOut,
          fee_bps: effectiveFeeBps,
          fee_bps_base: baseFeeBps,
          fee_boost: feeBoost ? { code: feeBoost.code, bps: feeBoost.bps } : null,
          price_source: quote.priceSource,
        },
      });

      if (feeBoost) {
        const invQty = Number(feeBoost.quantity ?? 0);
        if (invQty <= 0) {
          return { status: 409 as const, body: { error: "insufficient_balance", details: { message: "No fee discount boost available." } } };
        }

        if (invQty === 1) {
          await txSql`
            DELETE FROM arcade_inventory
            WHERE id = ${feeBoost.inventory_id}::uuid
          `;
        } else {
          await txSql`
            UPDATE arcade_inventory
            SET quantity = ${invQty - 1}, updated_at = now()
            WHERE id = ${feeBoost.inventory_id}::uuid
          `;
        }

        await logArcadeConsumption(txSql, {
          user_id: actingUserId,
          kind: "boost",
          code: feeBoost.code,
          rarity: null,
          quantity: 1,
          context_type: "convert",
          context_id: entryId,
          module: "convert_fee",
          metadata: {
            fee_bps_base: baseFeeBps,
            fee_bps: effectiveFeeBps,
            discount_bps: feeBoost.bps,
          },
        });
      }

      return {
        status: 201 as const,
        body: {
          ok: true,
          convert: {
            id: entryId,
            created_at: entryRows[0]!.created_at,
            quote,
            tx_hash: receipt.txHash,
            block_height: receipt.blockHeight,
          },
        },
      };
    });

    const err = result.body as { error?: string; details?: unknown };
    if (typeof err.error === "string") {
      return apiError(err.error, { status: result.status, details: err.details });
    }

    return Response.json(result.body, { status: result.status });
  } catch (e) {
    const resp = responseForDbError("exchange.convert.execute", e);
    if (resp) return resp;
    console.error("exchange.convert.execute failed:", e);
    return apiError("internal_error", {
      details: { message: e instanceof Error ? e.message : String(e) },
    });
  }
}
