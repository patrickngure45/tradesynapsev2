import { NextResponse } from "next/server";

import { apiError } from "@/lib/api/errors";
import { requireAdminForApi } from "@/lib/auth/admin";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SERVICES = [
  "exchange:conditional-orders",
  "cron:recurring-buys",
  "outbox-worker",
  "deposit-scan:bsc",
  "deposit-finalize:bsc",
  "sweep-deposits:bsc",
  "cron:twap",
  "cron:ops-alerts",
] as const;

const LOCK_KEYS = [
  "exchange:conditional-orders:enqueue",
  "exchange:recurring-buys",
  "exchange:outbox-worker",
  "exchange:scan-deposits:bsc",
  "exchange:finalize-deposits:bsc",
  "exchange:sweep-deposits:bsc",
  "exchange:twap",
] as const;

export async function GET(request: Request) {
  const sql = getSql();
  const admin = await requireAdminForApi(sql, request);
  if (!admin.ok) return admin.response;

  try {
    const [rows, lockRows, outboxByTopic] = await Promise.all([
      retryOnceOnTransientDbError(async () => {
        return await sql<
          {
            service: string;
            status: string;
            details_json: unknown;
            last_seen_at: string;
            updated_at: string;
          }[]
        >`
          SELECT
            service,
            status,
            details_json,
            last_seen_at::text,
            updated_at::text
          FROM app_service_heartbeat
          WHERE service = ANY(${SERVICES as unknown as string[]})
          ORDER BY service ASC
        `;
      }),
      retryOnceOnTransientDbError(async () => {
        return await sql<
          {
            key: string;
            holder_id: string;
            held_until: string;
            updated_at: string;
          }[]
        >`
          SELECT
            key,
            holder_id,
            held_until::text AS held_until,
            updated_at::text AS updated_at
          FROM ex_job_lock
          WHERE key = ANY(${LOCK_KEYS as unknown as string[]})
          ORDER BY key ASC
        `;
      }),
      retryOnceOnTransientDbError(async () => {
        return await sql<
          {
            topic: string;
            open_total: number;
            ready: number;
            locked: number;
            scheduled: number;
            dead_lettered: number;
          }[]
        >`
          SELECT
            topic,
            count(*) FILTER (WHERE processed_at IS NULL AND dead_lettered_at IS NULL)::int AS open_total,
            count(*) FILTER (
              WHERE processed_at IS NULL AND dead_lettered_at IS NULL
                AND visible_at <= now()
                AND lock_id IS NULL
            )::int AS ready,
            count(*) FILTER (
              WHERE processed_at IS NULL AND dead_lettered_at IS NULL
                AND visible_at <= now()
                AND lock_id IS NOT NULL
            )::int AS locked,
            count(*) FILTER (
              WHERE processed_at IS NULL AND dead_lettered_at IS NULL
                AND visible_at > now()
            )::int AS scheduled,
            count(*) FILTER (WHERE processed_at IS NULL AND dead_lettered_at IS NOT NULL)::int AS dead_lettered
          FROM app_outbox_event
          GROUP BY topic
          ORDER BY (count(*) FILTER (WHERE processed_at IS NULL)) DESC, topic ASC
          LIMIT 50
        `;
      }),
    ]);

    const byService = new Map(rows.map((r) => [r.service, r] as const));
    const heartbeats = SERVICES.map((service) => {
      return (
        byService.get(service) ?? {
          service,
          status: "missing",
          details_json: {},
          last_seen_at: null,
          updated_at: null,
        }
      );
    });

    const byKey = new Map(lockRows.map((r) => [r.key, r] as const));
    const locks = LOCK_KEYS.map((key) => {
      return (
        byKey.get(key) ?? {
          key,
          holder_id: null,
          held_until: null,
          updated_at: null,
        }
      );
    });

    const outboxTotals = outboxByTopic.reduce(
      (acc, r) => {
        acc.open_total += r.open_total;
        acc.ready += r.ready;
        acc.locked += r.locked;
        acc.scheduled += r.scheduled;
        acc.dead_lettered += r.dead_lettered;
        return acc;
      },
      { open_total: 0, ready: 0, locked: 0, scheduled: 0, dead_lettered: 0 },
    );

    const isProd = String(process.env.NODE_ENV ?? "").toLowerCase() === "production";
    const cronSecret = String(process.env.EXCHANGE_CRON_SECRET ?? process.env.CRON_SECRET ?? "").trim();
    const internalServiceSecret = String(process.env.INTERNAL_SERVICE_SECRET ?? "").trim();
    const bscRpcUrl = String(process.env.BSC_RPC_URL ?? "").trim();
    const deployerKey = String(process.env.DEPLOYER_PRIVATE_KEY ?? "").trim();
    const masterSeed = String(process.env.CITADEL_MASTER_SEED ?? "").trim();

    const config = {
      is_prod: isProd,
      cron_secret_configured: Boolean(cronSecret),
      internal_service_secret_configured: Boolean(internalServiceSecret),
      blockchain: {
        bsc_rpc_url_configured: Boolean(bscRpcUrl),
        deployer_private_key_configured: Boolean(deployerKey),
        citadel_master_seed_configured: Boolean(masterSeed),
      },
      enabled: {
        conditional_orders: String(process.env.EXCHANGE_ENABLE_CONDITIONAL_ORDERS ?? "").trim() === "1",
        recurring_buys: (() => {
          const v = String(process.env.EXCHANGE_ENABLE_RECURRING_BUYS ?? "").trim().toLowerCase();
          return v === "1" || v === "true";
        })(),
        deposit_scan: (() => {
          const v = String(process.env.EXCHANGE_ENABLE_DEPOSIT_SCAN ?? "").trim().toLowerCase();
          return v === "1" || v === "true";
        })(),
        sweep_deposits: (() => {
          const v = String(process.env.EXCHANGE_ENABLE_SWEEP_DEPOSITS ?? "").trim().toLowerCase();
          return v === "1" || v === "true";
        })(),
        twap: (() => {
          const v = String(process.env.EXCHANGE_ENABLE_TWAP ?? "").trim().toLowerCase();
          return v === "1" || v === "true";
        })(),
      },
    };

    return NextResponse.json(
      {
        ok: true,
        now: new Date().toISOString(),
        config,
        heartbeats,
        locks,
        outbox: {
          totals: outboxTotals,
          by_topic: outboxByTopic,
        },
      },
      { status: 200 },
    );
  } catch (e) {
    const resp = responseForDbError("exchange.admin.cron.heartbeats", e);
    if (resp) return resp;
    return apiError("internal_error");
  }
}
