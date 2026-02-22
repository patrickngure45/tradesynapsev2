import { NextRequest, NextResponse } from "next/server";

import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { quoteConvert, convertFeeBps, buildConvertJournalLines } from "@/lib/exchange/convert";
import { toBigInt3818 } from "@/lib/exchange/fixed3818";
import { recordInternalChainTx } from "@/lib/exchange/internalChain";
import { createNotification } from "@/lib/notifications";
import { upsertServiceHeartbeat } from "@/lib/system/heartbeat";
import { tryAcquireJobLock, releaseJobLock } from "@/lib/system/jobLock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireCronAuth(req: NextRequest): string | null {
  if (process.env.NODE_ENV !== "production") return null;

  const configured = process.env.EXCHANGE_CRON_SECRET ?? process.env.CRON_SECRET;
  if (!configured) return "cron_secret_not_configured";

  const provided = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  if (!provided || provided !== configured) return "cron_unauthorized";
  return null;
}

function requireEnabledInProd(): string | null {
  if (process.env.NODE_ENV !== "production") return null;
  const enabled = String(process.env.EXCHANGE_ENABLE_RECURRING_BUYS ?? "").trim();
  if (enabled !== "1" && enabled.toLowerCase() !== "true") return "recurring_buys_disabled";
  return null;
}

function cadenceMs(cadence: string): number {
  return cadence === "weekly" ? 7 * 24 * 60 * 60_000 : 24 * 60 * 60_000;
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

const SYSTEM_LIQUIDITY_USER_ID = "00000000-0000-0000-0000-000000000002";
const SYSTEM_TREASURY_USER_ID = "00000000-0000-0000-0000-000000000001";

export async function POST(req: NextRequest) {
  const authErr = requireCronAuth(req);
  if (authErr) {
    const status = authErr === "cron_unauthorized" ? 401 : 500;
    return NextResponse.json({ error: authErr }, { status });
  }

  const enabledErr = requireEnabledInProd();
  if (enabledErr) {
    return NextResponse.json({ ok: false, error: enabledErr }, { status: 403 });
  }

  const sql = getSql();
  const url = new URL(req.url);
  const max = Math.max(1, Math.min(200, Number(url.searchParams.get("max") ?? "50") || 50));

  const lockKey = "exchange:recurring-buys";
  const holderId = `${process.env.RAILWAY_SERVICE_NAME ?? process.env.SERVICE_NAME ?? "web"}:${crypto.randomUUID()}`;
  const lock = await tryAcquireJobLock(sql as any, { key: lockKey, holderId, ttlMs: 2 * 60_000 });
  if (!lock.acquired) {
    return NextResponse.json({ ok: false, error: "job_in_progress", held_until: lock.held_until, holder_id: lock.holder_id }, { status: 429 });
  }

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  try {
    const ids = await retryOnceOnTransientDbError(async () => {
      return await (sql as any)<{ id: string }[]>`
        SELECT id::text AS id
        FROM app_recurring_buy_plan
        WHERE status = 'active'
          AND next_run_at <= now()
        ORDER BY next_run_at ASC
        LIMIT ${max}
      `;
    });

    for (const row of ids) {
      processed += 1;
      try {
        const out = await sql.begin(async (tx) => {
          const txSql = tx as any;

          const planRows = await txSql<any[]>`
            SELECT
              id::text AS id,
              user_id::text AS user_id,
              status,
              from_symbol,
              to_symbol,
              amount_in::text AS amount_in,
              cadence,
              next_run_at,
              auth_expires_at
            FROM app_recurring_buy_plan
            WHERE id = ${row.id}::uuid
              AND status = 'active'
              AND next_run_at <= now()
            LIMIT 1
            FOR UPDATE SKIP LOCKED
          `;
          if (!planRows.length) return { status: "skipped" as const, reason: "not_due_or_locked" };
          const plan = planRows[0]!;

          const scheduledFor = plan.next_run_at as Date;

          const runRows = await txSql<{ id: string }[]>`
            INSERT INTO app_recurring_buy_run (
              plan_id, user_id, scheduled_for, status, from_symbol, to_symbol, amount_in
            )
            VALUES (
              ${plan.id}::uuid,
              ${plan.user_id}::uuid,
              ${scheduledFor.toISOString()}::timestamptz,
              'failed',
              ${String(plan.from_symbol)},
              ${String(plan.to_symbol)},
              ${String(plan.amount_in)}::numeric(38,18)
            )
            RETURNING id::text AS id
          `;
          const runId = runRows[0]!.id;

          const authExpiresAt = plan.auth_expires_at ? new Date(plan.auth_expires_at).getTime() : null;
          if (authExpiresAt != null && authExpiresAt <= Date.now()) {
            await txSql`
              UPDATE app_recurring_buy_plan
              SET status = 'paused',
                  last_run_at = now(),
                  last_run_status = 'failed',
                  last_run_error = 'auth_expired',
                  updated_at = now()
              WHERE id = ${plan.id}::uuid
            `;

            await txSql`
              UPDATE app_recurring_buy_run
              SET status = 'skipped',
                  error = 'auth_expired',
                  finished_at = now()
              WHERE id = ${runId}::uuid
            `;

            try {
              await createNotification(txSql, {
                userId: plan.user_id,
                type: "system",
                title: "Recurring buy paused",
                body: "Your recurring buy needs re-authorization. Open Account → Notifications/Automation and resume it.",
                metadata: { kind: "recurring_buy", plan_id: plan.id },
              });
            } catch {
              // ignore
            }

            return { status: "skipped" as const, reason: "auth_expired" };
          }

          const fromSym = String(plan.from_symbol).trim().toUpperCase();
          const toSym = String(plan.to_symbol).trim().toUpperCase();
          const amountIn = String(plan.amount_in).trim();

          const assets: Array<{ id: string; symbol: string }> = await txSql`
            SELECT id::text AS id, symbol
            FROM ex_asset
            WHERE chain = 'bsc'
              AND is_enabled = true
              AND symbol = ANY(${[fromSym, toSym]})
          `;
          const fromAsset = assets.find((a) => a.symbol.toUpperCase() === fromSym) ?? null;
          const toAsset = assets.find((a) => a.symbol.toUpperCase() === toSym) ?? null;
          if (!fromAsset || !toAsset) {
            await txSql`
              UPDATE app_recurring_buy_run
              SET status = 'failed', error = 'asset_not_found', finished_at = now()
              WHERE id = ${runId}::uuid
            `;
            await txSql`
              UPDATE app_recurring_buy_plan
              SET last_run_at = now(), last_run_status = 'failed', last_run_error = 'asset_not_found',
                  next_run_at = now() + interval '6 hours', updated_at = now()
              WHERE id = ${plan.id}::uuid
            `;
            return { status: "failed" as const, reason: "asset_not_found" };
          }

          const feeBps = convertFeeBps();
          const quote = await quoteConvert(txSql as any, {
            fromSymbol: fromSym,
            toSymbol: toSym,
            amountIn,
            feeBps,
          });
          if (!quote) {
            await txSql`
              UPDATE app_recurring_buy_run
              SET status = 'failed', error = 'quote_unavailable', finished_at = now()
              WHERE id = ${runId}::uuid
            `;
            await txSql`
              UPDATE app_recurring_buy_plan
              SET last_run_at = now(), last_run_status = 'failed', last_run_error = 'quote_unavailable',
                  next_run_at = now() + interval '1 hour', updated_at = now()
              WHERE id = ${plan.id}::uuid
            `;
            return { status: "failed" as const, reason: "quote_unavailable" };
          }

          const userFromAcct = await ensureLedgerAccount(txSql, plan.user_id, fromAsset.id);
          const available = await availableForAccount(txSql, userFromAcct);
          if (toBigInt3818(available) < toBigInt3818(quote.amountIn)) {
            await txSql`
              UPDATE app_recurring_buy_run
              SET status = 'skipped', error = 'insufficient_balance', finished_at = now()
              WHERE id = ${runId}::uuid
            `;
            await txSql`
              UPDATE app_recurring_buy_plan
              SET last_run_at = now(), last_run_status = 'failed', last_run_error = 'insufficient_balance',
                  next_run_at = now() + interval '6 hours', updated_at = now()
              WHERE id = ${plan.id}::uuid
            `;
            return { status: "skipped" as const, reason: "insufficient_balance" };
          }

          await Promise.all([
            ensureSystemUser(txSql, SYSTEM_LIQUIDITY_USER_ID),
            ensureSystemUser(txSql, SYSTEM_TREASURY_USER_ID),
          ]);

          const [userToAcct, systemFromAcct, systemToAcct, treasuryFromAcct] = await Promise.all([
            ensureLedgerAccount(txSql, plan.user_id, toAsset.id),
            ensureLedgerAccount(txSql, SYSTEM_LIQUIDITY_USER_ID, fromAsset.id),
            ensureLedgerAccount(txSql, SYSTEM_LIQUIDITY_USER_ID, toAsset.id),
            ensureLedgerAccount(txSql, SYSTEM_TREASURY_USER_ID, fromAsset.id),
          ]);

          const systemToAvailable = await availableForAccount(txSql, systemToAcct);
          if (toBigInt3818(systemToAvailable) < toBigInt3818(quote.amountOut)) {
            await txSql`
              UPDATE app_recurring_buy_run
              SET status = 'failed', error = 'liquidity_unavailable', finished_at = now()
              WHERE id = ${runId}::uuid
            `;
            await txSql`
              UPDATE app_recurring_buy_plan
              SET last_run_at = now(), last_run_status = 'failed', last_run_error = 'liquidity_unavailable',
                  next_run_at = now() + interval '2 hours', updated_at = now()
              WHERE id = ${plan.id}::uuid
            `;
            return { status: "failed" as const, reason: "liquidity_unavailable" };
          }

          const reference = `dca:${plan.id}:${Date.now()}`;
          const entryRows = await txSql<{ id: string; created_at: string }[]>`
            INSERT INTO ex_journal_entry (type, reference, metadata_json)
            VALUES (
              'convert',
              ${reference},
              ${txSql.json({
                user_id: plan.user_id,
                automation: "recurring_buy",
                plan_id: plan.id,
                from: fromSym,
                to: toSym,
                amount_in: quote.amountIn,
                fee_in: quote.feeIn,
                net_in: quote.netIn,
                amount_out: quote.amountOut,
                rate_to_per_from: quote.rateToPerFrom,
                fee_bps: feeBps,
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
          for (const l of lines) {
            await txSql`
              INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
              VALUES (${entryId}::uuid, ${l.accountId}::uuid, ${l.assetId}::uuid, (${l.amount}::numeric))
            `;
          }

          await recordInternalChainTx(txSql as any, {
            entryId,
            type: "convert",
            userId: plan.user_id,
            metadata: {
              automation: "recurring_buy",
              plan_id: plan.id,
              from: fromSym,
              to: toSym,
              amount_in: quote.amountIn,
              amount_out: quote.amountOut,
              fee_bps: feeBps,
              price_source: quote.priceSource,
            },
          });

          const nextRun = new Date(Date.now() + cadenceMs(String(plan.cadence)));

          await txSql`
            UPDATE app_recurring_buy_run
            SET status = 'success',
                error = NULL,
                entry_id = ${entryId}::uuid,
                amount_out = ${quote.amountOut}::numeric(38,18),
                rate_to_per_from = ${quote.rateToPerFrom}::numeric(38,18),
                finished_at = now()
            WHERE id = ${runId}::uuid
          `;

          await txSql`
            UPDATE app_recurring_buy_plan
            SET last_run_at = now(),
                last_run_status = 'success',
                last_run_error = NULL,
                last_entry_id = ${entryId}::uuid,
                next_run_at = ${nextRun.toISOString()}::timestamptz,
                updated_at = now()
            WHERE id = ${plan.id}::uuid
          `;

          try {
            await createNotification(txSql, {
              userId: plan.user_id,
              type: "system",
              title: "Recurring buy executed",
              body: `${quote.amountIn} ${fromSym} → ${quote.amountOut} ${toSym}`,
              metadata: { kind: "recurring_buy", plan_id: plan.id, entry_id: entryId, href: "/wallet" },
            });
          } catch {
            // ignore
          }

          return { status: "success" as const, entryId };
        });

        if (out.status === "success") succeeded += 1;
        else if (out.status === "failed") failed += 1;
        else skipped += 1;
      } catch {
        failed += 1;
      }
    }

    try {
      await upsertServiceHeartbeat(sql as any, {
        service: "cron:recurring-buys",
        status: "ok",
        details: { processed, succeeded, failed, skipped },
      });
    } catch {
      // ignore
    }

    return NextResponse.json({ ok: true, processed, succeeded, failed, skipped });
  } catch (e) {
    try {
      await upsertServiceHeartbeat(sql as any, {
        service: "cron:recurring-buys",
        status: "error",
        details: { message: e instanceof Error ? e.message : String(e) },
      });
    } catch {
      // ignore
    }

    const resp = responseForDbError("exchange.cron.recurring-buys", e);
    if (resp) {
      return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
    }

    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  } finally {
    try {
      await releaseJobLock(sql as any, { key: lockKey, holderId });
    } catch {
      // ignore
    }
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
