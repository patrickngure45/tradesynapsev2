import { getSql } from "../db";
import { quoteGasFee } from "./gas";
import { recordInternalChainTx } from "./internalChain";
import {
  add3818,
  bpsFeeCeil3818,
  sub3818NonNegative,
  toBigInt3818,
  toBigInt3818Signed,
} from "./fixed3818";

const SYSTEM_TREASURY_USER_ID = "00000000-0000-0000-0000-000000000001";
const SYSTEM_BURN_USER_ID = "00000000-0000-0000-0000-000000000003";

type TransferRequestInput = {
  actingUserId: string;
  assetId: string;
  amount: string;
  recipientEmail: string;
  reference?: string;
};

export type TransferRequestResult =
  | {
      status: 201;
      body: {
        transfer: {
          id: string;
          asset_id: string;
          symbol: string;
          chain: string;
          amount: string;
          recipient_email: string;
          created_at: string;
          tx_hash: string;
          block_height: number;
          fees: {
            transfer_fee_asset_amount: string;
            gas_fallback_asset_amount: string;
            gas_charged_in_asset_amount?: string;
            gas_sponsored?: boolean;
            network_fee_display?: { amount: string; symbol: string };
            total_debit_asset_amount: string;
          };
        };
      };
    }
  | {
      status: 404;
      body: { error: "not_found" | "recipient_not_found" };
    }
  | {
      status: 409;
      body: { error: string; details?: unknown };
    };

export type TransferReverseResult =
  | {
      status: 200;
      body: {
        reversal: {
          id: string;
          original_transfer_id: string;
          asset_id: string;
          symbol: string;
          chain: string;
          amount: string;
          created_at: string;
          tx_hash: string;
          block_height: number;
        };
      };
    }
  | {
      status: 404;
      body: { error: "transfer_not_found" };
    }
  | {
      status: 409;
      body: { error: "transfer_not_reversible" | "transfer_already_reversed" | "recipient_insufficient_balance_for_reversal"; details?: unknown };
    };

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function envAmount(name: string, fallback: string): string {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  toBigInt3818(raw);
  return raw;
}

function normalizeAmount3818(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  const fixed = value
    .toFixed(18)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1");
  return fixed.length === 0 ? "0" : fixed;
}

async function ensureSystemUser(sql: ReturnType<typeof getSql>, userId: string): Promise<void> {
  await sql`
    INSERT INTO app_user (id, status, kyc_level, country)
    VALUES (${userId}::uuid, 'active', 'none', NULL)
    ON CONFLICT (id) DO NOTHING
  `;
}

async function ensureLedgerAccount(
  sql: ReturnType<typeof getSql>,
  userId: string,
  assetId: string,
): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO ex_ledger_account (user_id, asset_id)
    VALUES (${userId}::uuid, ${assetId}::uuid)
    ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
    RETURNING id::text AS id
  `;
  return rows[0]!.id;
}

async function getLatestPairPrice(
  sql: ReturnType<typeof getSql>,
  baseSymbol: string,
  quoteSymbol: string,
): Promise<number | null> {
  const rows = await sql<
    { price: string; base_symbol: string; quote_symbol: string }[]
  >`
    SELECT
      e.price::text AS price,
      b.symbol AS base_symbol,
      q.symbol AS quote_symbol
    FROM ex_execution e
    JOIN ex_market m ON m.id = e.market_id
    JOIN ex_asset b ON b.id = m.base_asset_id
    JOIN ex_asset q ON q.id = m.quote_asset_id
    WHERE m.chain = 'bsc'
      AND m.status = 'enabled'
      AND (
        (b.symbol = ${baseSymbol} AND q.symbol = ${quoteSymbol})
        OR
        (b.symbol = ${quoteSymbol} AND q.symbol = ${baseSymbol})
      )
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) return null;
  const px = Number(row.price);
  if (!Number.isFinite(px) || px <= 0) return null;

  if (row.base_symbol === baseSymbol && row.quote_symbol === quoteSymbol) return px;
  if (row.base_symbol === quoteSymbol && row.quote_symbol === baseSymbol) return 1 / px;
  return null;
}

export async function requestUserTransfer(
  sql: ReturnType<typeof getSql>,
  input: TransferRequestInput,
): Promise<TransferRequestResult> {
  return await sql.begin(async (tx) => {
    const txSql = tx as unknown as typeof sql;

    // Legacy fee-discount preference (previously tied to platform token) has been removed.
    const feeDiscountPct = 0;

    const assets = await txSql<{ id: string; chain: string; symbol: string }[]>`
      SELECT id, chain, symbol
      FROM ex_asset
      WHERE id = ${input.assetId}::uuid AND is_enabled = true
      LIMIT 1
    `;
    if (assets.length === 0) {
      return { status: 404 as const, body: { error: "not_found" } };
    }
    const asset = assets[0]!;

    const recipients = await txSql<{ id: string; email: string; status: string }[]>`
      SELECT id::text AS id, email, status
      FROM app_user
      WHERE lower(email) = lower(${input.recipientEmail.trim()})
      LIMIT 1
    `;
    if (recipients.length === 0) {
      return { status: 404 as const, body: { error: "recipient_not_found" } };
    }

    const recipient = recipients[0]!;
    if (recipient.id === input.actingUserId) {
      return { status: 409 as const, body: { error: "recipient_same_as_sender" } };
    }
    if (recipient.status !== "active") {
      return { status: 409 as const, body: { error: "recipient_inactive" } };
    }

    const [senderAccountId, recipientAccountId] = await Promise.all([
      ensureLedgerAccount(txSql, input.actingUserId, asset.id),
      ensureLedgerAccount(txSql, recipient.id, asset.id),
    ]);

    const baseTransferFeeBps = Math.max(0, Math.min(10_000, envInt("TRANSFER_USER_FEE_BPS", 10)));
    const transferFeeBps = feeDiscountPct > 0
      ? Math.max(0, Math.min(10_000, Math.floor(baseTransferFeeBps * (1 - feeDiscountPct))))
      : baseTransferFeeBps;
    const transferFeeMin = envAmount("TRANSFER_USER_FEE_MIN", "0");
    const transferFeeMax = envAmount("TRANSFER_USER_FEE_MAX", "0");
    let transferFeeAmount =
      transferFeeBps > 0 ? bpsFeeCeil3818(input.amount, transferFeeBps) : "0";
    if (
      toBigInt3818(transferFeeAmount) > 0n &&
      toBigInt3818(transferFeeAmount) < toBigInt3818(transferFeeMin)
    ) {
      transferFeeAmount = transferFeeMin;
    }
    if (
      toBigInt3818(transferFeeMax) > 0n &&
      toBigInt3818(transferFeeAmount) > toBigInt3818(transferFeeMax)
    ) {
      transferFeeAmount = transferFeeMax;
    }

    const transferFeeBurnBps = Math.max(0, Math.min(10_000, envInt("TRANSFER_FEE_BURN_BPS", 0)));

    // Network fee (gas) is displayed in native token (BNB) but charged in the sent asset when possible.
    // This mirrors withdrawal fee behavior (Option B) while keeping the transfer atomic (no separate gas_fee entry).
    let gasFallbackInAsset = "0";
    let gasFallbackSource: string | null = null;
    let gasDisplaySymbol: string | null = null;
    let gasDisplayAmount: string | null = null;
    let gasQuoteMode: string | null = null;

    const balRows = await txSql<{ posted: string; held: string; available: string; ok: boolean }[]>`
      WITH posted AS (
        SELECT coalesce(sum(amount), 0)::numeric AS posted
        FROM ex_journal_line
        WHERE account_id = ${senderAccountId}::uuid
      ),
      held AS (
        SELECT coalesce(sum(remaining_amount), 0)::numeric AS held
        FROM ex_hold
        WHERE account_id = ${senderAccountId}::uuid AND status = 'active'
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
      action: "user_transfer",
      chain: asset.chain,
      assetSymbol: asset.symbol,
    });
    if ("code" in gasQuote) {
      // Configuration error; surface to caller.
      return { status: 409 as const, body: { error: gasQuote.code, details: gasQuote.details } };
    }

    gasDisplaySymbol = (gasQuote.gasSymbol ?? "").trim() || null;
    gasDisplayAmount = (gasQuote.amount ?? "").trim() || null;
    gasQuoteMode = gasQuote.mode;

    if (gasQuote.enabled && toBigInt3818(gasQuote.amount) > 0n) {
      // Prefer charging gas in the sent asset (Option B); if conversion is unavailable, sponsor it.
      if ((gasQuote.chargeSymbol ?? "").trim().toUpperCase() === asset.symbol.toUpperCase() && gasQuote.chargeAmount) {
        gasFallbackInAsset = gasQuote.chargeAmount;
        gasFallbackSource = "quote_charge_in_asset";
      } else {
        gasFallbackInAsset = "0";
        gasFallbackSource = "sponsored_unavailable";
      }
    }

    const totalDebit = add3818(add3818(input.amount, transferFeeAmount), gasFallbackInAsset);
    if (!bal || toBigInt3818Signed(bal.available) < toBigInt3818(totalDebit)) {
      return {
        status: 409 as const,
        body: {
          error: "insufficient_balance",
          details: {
            posted: bal?.posted ?? "0",
            held: bal?.held ?? "0",
            available: bal?.available ?? "0",
            requested: input.amount,
            transfer_fee: transferFeeAmount,
            gas_fallback_fee: gasFallbackInAsset,
            total_debit: totalDebit,
            gas_display: gasDisplaySymbol && gasDisplayAmount ? { symbol: gasDisplaySymbol, amount: gasDisplayAmount, mode: gasQuoteMode } : null,
          },
        },
      };
    }

    const entryRows = await txSql<{ id: string; created_at: string }[]>`
      INSERT INTO ex_journal_entry (type, reference, metadata_json)
      VALUES (
        'user_transfer',
        ${input.reference ?? `transfer:${asset.symbol}:${Date.now()}`},
        ${txSql.json({
          sender_user_id: input.actingUserId,
          recipient_user_id: recipient.id,
          recipient_email: recipient.email,
          asset_symbol: asset.symbol,
          amount: input.amount,
          transfer_fee_amount: transferFeeAmount,
          gas_fallback_in_asset: gasFallbackInAsset,
          gas_display_symbol: gasDisplaySymbol,
          gas_display_amount: gasDisplayAmount,
          gas_quote_mode: gasQuoteMode,
          total_debit: totalDebit,
        })}::jsonb
      )
      RETURNING id::text AS id, created_at::text AS created_at
    `;

    const entryId = entryRows[0]!.id;

    const receipt = await recordInternalChainTx(txSql as any, {
      entryId,
      type: "user_transfer",
      userId: input.actingUserId,
      metadata: {
        asset_symbol: asset.symbol,
        amount: input.amount,
        recipient_user_id: recipient.id,
        recipient_email: recipient.email,
        transfer_fee_bps: transferFeeBps,
        discount_pct: feeDiscountPct,
        gas_display_symbol: gasDisplaySymbol,
        gas_display_amount: gasDisplayAmount,
        gas_quote_mode: gasQuoteMode,
      },
    });

    await txSql`
      INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
      VALUES
        (${entryId}::uuid, ${senderAccountId}::uuid, ${asset.id}::uuid, ((${input.amount}::numeric) * -1)),
        (${entryId}::uuid, ${recipientAccountId}::uuid, ${asset.id}::uuid, (${input.amount}::numeric))
    `;

    const totalFeeInAsset = add3818(transferFeeAmount, gasFallbackInAsset);
    if (toBigInt3818(totalFeeInAsset) > 0n) {
      await ensureSystemUser(txSql, SYSTEM_TREASURY_USER_ID);
      await ensureSystemUser(txSql, SYSTEM_BURN_USER_ID);

      const [treasuryAcct, burnAcct] = await Promise.all([
        ensureLedgerAccount(txSql, SYSTEM_TREASURY_USER_ID, asset.id),
        ensureLedgerAccount(txSql, SYSTEM_BURN_USER_ID, asset.id),
      ]);

      const burnCandidate =
        transferFeeBurnBps > 0 ? bpsFeeCeil3818(totalFeeInAsset, transferFeeBurnBps) : "0";
      const burnAmount =
        toBigInt3818(burnCandidate) > toBigInt3818(totalFeeInAsset)
          ? totalFeeInAsset
          : burnCandidate;
      const treasuryAmount = sub3818NonNegative(totalFeeInAsset, burnAmount);

      const feeEntryRows = await txSql<{ id: string }[]>`
        INSERT INTO ex_journal_entry (type, reference, metadata_json)
        VALUES (
          'user_transfer_fee',
          ${`fee:${entryId}`},
          ${txSql.json({
            transfer_entry_id: entryId,
            user_id: input.actingUserId,
            asset_symbol: asset.symbol,
            transfer_fee_amount: transferFeeAmount,
            gas_fallback_in_asset: gasFallbackInAsset,
            total_fee_in_asset: totalFeeInAsset,
            transfer_fee_bps: transferFeeBps,
            burn_bps: transferFeeBurnBps,
            gas_fallback_source: gasFallbackSource,
            gas_display_symbol: gasDisplaySymbol,
            gas_display_amount: gasDisplayAmount,
            gas_quote_mode: gasQuoteMode,
          })}::jsonb
        )
        RETURNING id::text AS id
      `;
      const feeEntryId = feeEntryRows[0]!.id;

      if (toBigInt3818(treasuryAmount) > 0n && toBigInt3818(burnAmount) > 0n) {
        await txSql`
          INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
          VALUES
            (${feeEntryId}::uuid, ${senderAccountId}::uuid, ${asset.id}::uuid, ((${totalFeeInAsset}::numeric) * -1)),
            (${feeEntryId}::uuid, ${treasuryAcct}::uuid, ${asset.id}::uuid, (${treasuryAmount}::numeric)),
            (${feeEntryId}::uuid, ${burnAcct}::uuid, ${asset.id}::uuid, (${burnAmount}::numeric))
        `;
      } else if (toBigInt3818(treasuryAmount) > 0n) {
        await txSql`
          INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
          VALUES
            (${feeEntryId}::uuid, ${senderAccountId}::uuid, ${asset.id}::uuid, ((${totalFeeInAsset}::numeric) * -1)),
            (${feeEntryId}::uuid, ${treasuryAcct}::uuid, ${asset.id}::uuid, (${treasuryAmount}::numeric))
        `;
      } else if (toBigInt3818(burnAmount) > 0n) {
        await txSql`
          INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
          VALUES
            (${feeEntryId}::uuid, ${senderAccountId}::uuid, ${asset.id}::uuid, ((${totalFeeInAsset}::numeric) * -1)),
            (${feeEntryId}::uuid, ${burnAcct}::uuid, ${asset.id}::uuid, (${burnAmount}::numeric))
        `;
      }
    }

    return {
      status: 201 as const,
      body: {
        transfer: {
          id: entryId,
          asset_id: asset.id,
          symbol: asset.symbol,
          chain: asset.chain,
          amount: input.amount,
          recipient_email: recipient.email,
          created_at: entryRows[0]!.created_at,
          tx_hash: receipt.txHash,
          block_height: receipt.blockHeight,
          fees: {
            transfer_fee_asset_amount: transferFeeAmount,
            gas_fallback_asset_amount: gasFallbackInAsset,
            gas_charged_in_asset_amount: gasFallbackInAsset,
            gas_sponsored: gasFallbackSource === "sponsored_unavailable",
            network_fee_display: {
              amount: gasQuote.enabled ? (gasDisplayAmount ?? "0") : "0",
              symbol: (gasDisplaySymbol ?? "BNB").trim() || "BNB",
            },
            total_debit_asset_amount: totalDebit,
          },
        },
      },
    };
  });
}

export async function reverseUserTransfer(
  sql: ReturnType<typeof getSql>,
  input: {
    adminUserId: string;
    originalTransferEntryId: string;
    reason?: string;
  },
): Promise<TransferReverseResult> {
  const originalId = input.originalTransferEntryId.trim();
  const reference = `reverse:${originalId}`;

  return await sql.begin(async (tx) => {
    const txSql = tx as unknown as typeof sql;

    const existing = await txSql<{ id: string; created_at: string; asset_id: string; symbol: string; chain: string }[]>`
      SELECT
        e.id::text AS id,
        e.created_at::text AS created_at,
        a.id::text AS asset_id,
        a.symbol AS symbol,
        a.chain AS chain
      FROM ex_journal_entry e
      JOIN ex_journal_line l ON l.entry_id = e.id
      JOIN ex_asset a ON a.id = l.asset_id
      WHERE e.type = 'user_transfer_reversal'
        AND e.reference = ${reference}
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT 1
    `;

    if (existing.length > 0) {
      const row = existing[0]!;
      const receipt = await recordInternalChainTx(txSql as any, {
        entryId: row.id,
        type: "user_transfer_reversal",
        userId: input.adminUserId,
        metadata: { original_transfer_entry_id: originalId, idempotent: true },
      });

      return {
        status: 200 as const,
        body: {
          reversal: {
            id: row.id,
            original_transfer_id: originalId,
            asset_id: row.asset_id,
            symbol: row.symbol,
            chain: row.chain,
            amount: "0",
            created_at: row.created_at,
            tx_hash: receipt.txHash,
            block_height: receipt.blockHeight,
          },
        },
      };
    }

    const transferRows = await txSql<
      {
        id: string;
        type: string;
        created_at: string;
        amount: string | null;
        sender_user_id: string | null;
        recipient_user_id: string | null;
        asset_id: string;
        symbol: string;
        chain: string;
        sender_account_id: string | null;
        recipient_account_id: string | null;
      }[]
    >`
      SELECT
        e.id::text AS id,
        e.type AS type,
        e.created_at::text AS created_at,
        (e.metadata_json->>'amount') AS amount,
        (e.metadata_json->>'sender_user_id') AS sender_user_id,
        (e.metadata_json->>'recipient_user_id') AS recipient_user_id,
        a.id::text AS asset_id,
        a.symbol AS symbol,
        a.chain AS chain,
        max(CASE WHEN l.amount < 0 THEN l.account_id::text END) AS sender_account_id,
        max(CASE WHEN l.amount > 0 THEN l.account_id::text END) AS recipient_account_id
      FROM ex_journal_entry e
      JOIN ex_journal_line l ON l.entry_id = e.id
      JOIN ex_asset a ON a.id = l.asset_id
      WHERE e.id = ${originalId}::uuid
        AND e.type = 'user_transfer'
      GROUP BY e.id, e.type, e.created_at, e.metadata_json, a.id, a.symbol, a.chain
    `;

    if (transferRows.length === 0) {
      return { status: 404 as const, body: { error: "transfer_not_found" } };
    }
    if (transferRows.length !== 1) {
      return {
        status: 409 as const,
        body: {
          error: "transfer_not_reversible",
          details: { reason: "transfer_multi_asset" },
        },
      };
    }

    const t = transferRows[0]!;
    if (!t.amount || toBigInt3818(t.amount) <= 0n) {
      return {
        status: 409 as const,
        body: {
          error: "transfer_not_reversible",
          details: { reason: "missing_amount" },
        },
      };
    }
    if (!t.sender_account_id || !t.recipient_account_id) {
      return {
        status: 409 as const,
        body: {
          error: "transfer_not_reversible",
          details: { reason: "missing_accounts" },
        },
      };
    }

    // Ensure we haven't already reversed this transfer.
    const alreadyRows = await txSql<{ id: string }[]>`
      SELECT id::text AS id
      FROM ex_journal_entry
      WHERE type = 'user_transfer_reversal'
        AND reference = ${reference}
      LIMIT 1
    `;
    if (alreadyRows.length > 0) {
      return { status: 409 as const, body: { error: "transfer_already_reversed" } };
    }

    // Recipient must still have sufficient AVAILABLE balance to debit.
    const balRows = await txSql<{ posted: string; held: string; available: string; ok: boolean }[]>`
      WITH posted AS (
        SELECT coalesce(sum(amount), 0)::numeric AS posted
        FROM ex_journal_line
        WHERE account_id = ${t.recipient_account_id}::uuid
      ),
      held AS (
        SELECT coalesce(sum(remaining_amount), 0)::numeric AS held
        FROM ex_hold
        WHERE account_id = ${t.recipient_account_id}::uuid AND status = 'active'
      )
      SELECT
        posted.posted::text AS posted,
        held.held::text AS held,
        (posted.posted - held.held)::text AS available,
        ((posted.posted - held.held) >= (${t.amount}::numeric)) AS ok
      FROM posted, held
    `;
    const bal = balRows[0];
    if (!bal || toBigInt3818Signed(bal.available) < toBigInt3818(t.amount)) {
      return {
        status: 409 as const,
        body: {
          error: "recipient_insufficient_balance_for_reversal",
          details: {
            available: bal?.available ?? "0",
            requested: t.amount,
            posted: bal?.posted ?? "0",
            held: bal?.held ?? "0",
          },
        },
      };
    }

    const reversalEntryRows = await txSql<{ id: string; created_at: string }[]>`
      INSERT INTO ex_journal_entry (type, reference, metadata_json)
      VALUES (
        'user_transfer_reversal',
        ${reference},
        ${txSql.json({
          original_transfer_entry_id: originalId,
          reversed_by_admin_user_id: input.adminUserId,
          reason: (input.reason ?? "").trim() || null,
          amount: t.amount,
          asset_id: t.asset_id,
          asset_symbol: t.symbol,
          chain: t.chain,
          sender_user_id: t.sender_user_id,
          recipient_user_id: t.recipient_user_id,
        })}::jsonb
      )
      RETURNING id::text AS id, created_at::text AS created_at
    `;
    const reversalEntryId = reversalEntryRows[0]!.id;

    const receipt = await recordInternalChainTx(txSql as any, {
      entryId: reversalEntryId,
      type: "user_transfer_reversal",
      userId: input.adminUserId,
      metadata: {
        original_transfer_entry_id: originalId,
        amount: t.amount,
        symbol: t.symbol,
        reason: (input.reason ?? "").trim() || null,
      },
    });

    await txSql`
      INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
      VALUES
        (${reversalEntryId}::uuid, ${t.recipient_account_id}::uuid, ${t.asset_id}::uuid, ((${t.amount}::numeric) * -1)),
        (${reversalEntryId}::uuid, ${t.sender_account_id}::uuid, ${t.asset_id}::uuid, (${t.amount}::numeric))
    `;

    return {
      status: 200 as const,
      body: {
        reversal: {
          id: reversalEntryId,
          original_transfer_id: originalId,
          asset_id: t.asset_id,
          symbol: t.symbol,
          chain: t.chain,
          amount: t.amount,
          created_at: reversalEntryRows[0]!.created_at,
          tx_hash: receipt.txHash,
          block_height: receipt.blockHeight,
        },
      },
    };
  });
}
