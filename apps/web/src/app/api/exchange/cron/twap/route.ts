import { NextRequest, NextResponse } from "next/server";

import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { tryAcquireJobLock, releaseJobLock } from "@/lib/system/jobLock";
import { upsertServiceHeartbeat } from "@/lib/system/heartbeat";
import { createNotification } from "@/lib/notifications";
import { toBigInt3818, fromBigInt3818 } from "@/lib/exchange/fixed3818";
import { quantizeDownToStep3818 } from "@/lib/exchange/steps";
import { requireCronRequestAuth } from "@/lib/auth/cronAuth";

import { POST as placeOrder } from "@/app/api/exchange/orders/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireEnabledInProd(): string | null {
  if (process.env.NODE_ENV !== "production") return null;
  const enabled = String(process.env.EXCHANGE_ENABLE_TWAP ?? "").trim();
  if (enabled !== "1" && enabled.toLowerCase() !== "true") return "twap_disabled";
  return null;
}

export async function POST(req: NextRequest) {
  const authErr = requireCronRequestAuth(req);
  if (authErr) {
    const status = authErr === "cron_unauthorized" ? 401 : 500;
    return NextResponse.json({ error: authErr }, { status });
  }

  const enabledErr = requireEnabledInProd();
  if (enabledErr) return NextResponse.json({ ok: false, error: enabledErr }, { status: 403 });

  const internalSecret = String(process.env.INTERNAL_SERVICE_SECRET ?? "").trim();
  if (!internalSecret) return NextResponse.json({ ok: false, error: "internal_service_secret_not_configured" }, { status: 500 });

  const sql = getSql();
  const url = new URL(req.url);
  const max = Math.max(1, Math.min(200, Number(url.searchParams.get("max") ?? "50") || 50));

  const lockKey = "exchange:twap";
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
        FROM app_twap_plan
        WHERE status = 'active'
          AND next_run_at <= now()
          AND remaining_quantity > 0
        ORDER BY next_run_at ASC
        LIMIT ${max}
      `;
    });

    for (const row of ids) {
      processed += 1;
      try {
        const outcome = await sql.begin(async (tx) => {
          const txSql = tx as any;

          const planRows = await txSql<any[]>`
            SELECT
              p.id::text AS id,
              p.user_id::text AS user_id,
              p.market_id::text AS market_id,
              m.symbol AS market_symbol,
              m.lot_size::text AS lot_size,
              p.side,
              p.status,
              p.remaining_quantity::text AS remaining_quantity,
              p.slice_quantity::text AS slice_quantity,
              p.interval_sec,
              p.next_run_at,
              p.auth_expires_at
            FROM app_twap_plan p
            JOIN ex_market m ON m.id = p.market_id
            WHERE p.id = ${row.id}::uuid
              AND p.status = 'active'
              AND p.next_run_at <= now()
              AND p.remaining_quantity > 0
            LIMIT 1
            FOR UPDATE SKIP LOCKED
          `;
          if (!planRows.length) return { status: "skipped" as const, reason: "not_due_or_locked" };
          const plan = planRows[0]!;

          const scheduledFor = plan.next_run_at as Date;

          const runRows = await txSql<{ id: string }[]>`
            INSERT INTO app_twap_run (
              plan_id, user_id, market_id, side, scheduled_for, status, slice_quantity
            )
            VALUES (
              ${plan.id}::uuid,
              ${plan.user_id}::uuid,
              ${plan.market_id}::uuid,
              ${plan.side},
              ${scheduledFor.toISOString()}::timestamptz,
              'failed',
              ${String(plan.slice_quantity)}::numeric(38,18)
            )
            RETURNING id::text AS id
          `;
          const runId = runRows[0]!.id;

          const authExpiresAt = plan.auth_expires_at ? new Date(plan.auth_expires_at).getTime() : null;
          if (authExpiresAt != null && authExpiresAt <= Date.now()) {
            await txSql`
              UPDATE app_twap_plan
              SET status = 'paused',
                  last_run_at = now(),
                  last_run_status = 'skipped',
                  last_run_error = 'auth_expired',
                  updated_at = now()
              WHERE id = ${plan.id}::uuid
            `;

            await txSql`
              UPDATE app_twap_run
              SET status = 'skipped', error = 'auth_expired', finished_at = now()
              WHERE id = ${runId}::uuid
            `;

            try {
              await createNotification(txSql, {
                userId: plan.user_id,
                type: "system",
                title: "TWAP paused",
                body: "Your TWAP needs re-authorization. Open Terminal and resume it.",
                metadata: { kind: "twap", plan_id: plan.id, href: "/terminal" },
              });
            } catch {
              // ignore
            }

            return { status: "skipped" as const, reason: "auth_expired" };
          }

          const lot = String(plan.lot_size ?? "0.00000001");
          const remaining = toBigInt3818(String(plan.remaining_quantity));
          const slice = toBigInt3818(String(plan.slice_quantity));
          const take = remaining < slice ? remaining : slice;
          const takeQty = quantizeDownToStep3818(fromBigInt3818(take), lot);
          if (toBigInt3818(takeQty) <= 0n) {
            await txSql`
              UPDATE app_twap_plan
              SET status = 'completed',
                  remaining_quantity = 0,
                  last_run_at = now(),
                  last_run_status = 'skipped',
                  last_run_error = 'quantity_too_small',
                  updated_at = now()
              WHERE id = ${plan.id}::uuid
            `;
            await txSql`
              UPDATE app_twap_run
              SET status = 'skipped', error = 'quantity_too_small', finished_at = now()
              WHERE id = ${runId}::uuid
            `;
            return { status: "skipped" as const, reason: "quantity_too_small" };
          }

          // Place one market slice using internal service auth.
          const headers = new Headers();
          headers.set("content-type", "application/json");
          headers.set("x-internal-service-token", internalSecret);
          headers.set("x-user-id", String(plan.user_id));

          const orderReq = new Request("http://internal/api/exchange/orders", {
            method: "POST",
            headers,
            body: JSON.stringify({ market_id: String(plan.market_id), side: String(plan.side), type: "market", quantity: takeQty }),
          });

          const res = await placeOrder(orderReq);
          const payload = await res.json().catch(() => ({} as any));

          if (!res.ok) {
            const code = typeof (payload as any)?.error === "string" ? String((payload as any).error) : `http_${res.status}`;
            await txSql`
              UPDATE app_twap_run
              SET status = 'failed', error = ${code}, finished_at = now()
              WHERE id = ${runId}::uuid
            `;
            await txSql`
              UPDATE app_twap_plan
              SET last_run_at = now(),
                  last_run_status = 'failed',
                  last_run_error = ${code},
                  next_run_at = now() + interval '1 minute',
                  updated_at = now()
              WHERE id = ${plan.id}::uuid
            `;
            return { status: "failed" as const, reason: code };
          }

          const orderId = (payload as any)?.order?.id ?? null;
          const fills = Array.isArray((payload as any)?.executions) ? (payload as any).executions.length : null;

          const newRemaining = remaining - toBigInt3818(takeQty);
          const intervalSec = Number(plan.interval_sec) || 60;
          const nextRun = new Date(Date.now() + Math.max(10, Math.min(24 * 60 * 60, intervalSec)) * 1000);
          const done = newRemaining <= 0n;

          await txSql`
            UPDATE app_twap_run
            SET status = 'success',
                error = NULL,
                order_id = ${orderId ? orderId : null}::uuid,
                fills_count = ${fills},
                slice_quantity = ${takeQty}::numeric(38,18),
                finished_at = now()
            WHERE id = ${runId}::uuid
          `;

          await txSql`
            UPDATE app_twap_plan
            SET remaining_quantity = ${fromBigInt3818(newRemaining)}::numeric(38,18),
                last_run_at = now(),
                last_run_status = 'success',
                last_run_error = NULL,
                next_run_at = ${(done ? new Date() : nextRun).toISOString()}::timestamptz,
                status = ${done ? "completed" : "active"},
                updated_at = now()
            WHERE id = ${plan.id}::uuid
          `;

          return { status: "success" as const, orderId, done };
        });

        if (outcome.status === "success") succeeded += 1;
        else if (outcome.status === "failed") failed += 1;
        else skipped += 1;
      } catch {
        failed += 1;
      }
    }

    try {
      await upsertServiceHeartbeat(sql as any, {
        service: "cron:twap",
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
        service: "cron:twap",
        status: "error",
        details: { message: e instanceof Error ? e.message : String(e) },
      });
    } catch {
      // ignore
    }

    const resp = responseForDbError("exchange.cron.twap", e);
    if (resp) return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
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
