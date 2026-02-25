import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { enforceAccountSecurityRateLimit } from "@/lib/auth/securityRateLimit";
import { listServiceHeartbeats, type HeartbeatRow } from "@/lib/system/heartbeat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ServiceExpectation = { service: string; staleAfterMs: number };

function getExpectedServices(): ServiceExpectation[] {
  const expected: ServiceExpectation[] = [];

  const expectOutboxWorker = (process.env.EXPECT_OUTBOX_WORKER ?? "").trim() === "1";
  if (expectOutboxWorker) expected.push({ service: "outbox-worker", staleAfterMs: 10 * 60_000 });

  const enableConditional = (process.env.EXCHANGE_ENABLE_CONDITIONAL_ORDERS ?? "").trim() === "1";
  if (enableConditional) expected.push({ service: "exchange:conditional-orders", staleAfterMs: 10 * 60_000 });

  const enablePriceAlerts = (process.env.EXCHANGE_ENABLE_PRICE_ALERTS ?? "").trim() === "1";
  if (enablePriceAlerts) expected.push({ service: "cron:price-alerts", staleAfterMs: 15 * 60_000 });

  const enableNotificationsDigest = (process.env.EXCHANGE_ENABLE_NOTIFICATIONS_DIGEST ?? "").trim() === "1";
  if (enableNotificationsDigest) expected.push({ service: "cron:notifications-digest", staleAfterMs: 30 * 60_000 });

  const expectP2pExpireOrders = (process.env.EXPECT_P2P_EXPIRE_ORDERS ?? "").trim() === "1";
  if (expectP2pExpireOrders) expected.push({ service: "p2p:expire-orders", staleAfterMs: 10 * 60_000 });

  const expectDepositScan = (process.env.EXPECT_DEPOSIT_SCAN ?? "").trim() === "1";
  const expectSweepDeposits = (process.env.EXPECT_SWEEP_DEPOSITS ?? "").trim() === "1";
  if (expectDepositScan) expected.push({ service: "deposit-scan:bsc", staleAfterMs: 60 * 60_000 });
  if (expectSweepDeposits) expected.push({ service: "sweep-deposits:bsc", staleAfterMs: 60 * 60_000 });

  return expected;
}

function pickOverall(args: {
  dbOk: boolean;
  outboxDead: number;
  outboxWithErrors: number;
  staleExpectedServices: string[];
}): "online" | "degraded" | "offline" {
  if (!args.dbOk) return "offline";
  if (args.outboxDead > 0) return "degraded";
  if (args.outboxWithErrors > 0) return "degraded";
  if (args.staleExpectedServices.length > 0) return "degraded";
  return "online";
}

export async function GET() {
  const sql = getSql();
  const startedAt = Date.now();

  let dbOk = false;
  let dbLatencyMs: number | null = null;
  try {
    const t0 = Date.now();
    await sql`SELECT 1`;
    dbOk = true;
    dbLatencyMs = Date.now() - t0;
  } catch {
    dbOk = false;
    dbLatencyMs = null;
  }

  let outboxOpen = 0;
  let outboxDead = 0;
  let outboxWithErrors = 0;

  let emailOutboxPending = 0;
  let emailOutboxFailed = 0;
  let emailOutboxOldestPendingAt: string | null = null;
  let emailOutboxOldestAgeMin: number | null = null;

  let opsAlertLastSentAt: string | null = null;
  if (dbOk) {
    try {
      const rows = await sql<{ open: number; dead: number; with_errors: number }[]>`
        SELECT
          count(*) FILTER (WHERE processed_at IS NULL AND dead_lettered_at IS NULL)::int AS open,
          count(*) FILTER (WHERE dead_lettered_at IS NOT NULL)::int AS dead,
          count(*) FILTER (WHERE last_error IS NOT NULL)::int AS with_errors
        FROM app_outbox_event
      `;
      const row = rows[0];
      if (row) {
        outboxOpen = row.open;
        outboxDead = row.dead;
        outboxWithErrors = row.with_errors;
      }
    } catch {
      outboxOpen = 0;
      outboxDead = 0;
      outboxWithErrors = 0;
    }

    try {
      const rows = await sql<{ pending: number; failed: number; oldest_pending_at: string | null }[]>`
        SELECT
          count(*) FILTER (WHERE status = 'pending')::int AS pending,
          count(*) FILTER (WHERE status = 'failed')::int AS failed,
          min(created_at) FILTER (WHERE status = 'pending')::timestamptz::text AS oldest_pending_at
        FROM ex_email_outbox
      `;
      const row = rows[0];
      if (row) {
        emailOutboxPending = row.pending ?? 0;
        emailOutboxFailed = row.failed ?? 0;
        emailOutboxOldestPendingAt = row.oldest_pending_at ?? null;
      }
      const oldestMs = emailOutboxOldestPendingAt ? Date.parse(String(emailOutboxOldestPendingAt)) : NaN;
      emailOutboxOldestAgeMin = Number.isFinite(oldestMs) ? Math.max(0, Math.floor((Date.now() - oldestMs) / 60_000)) : null;
    } catch {
      emailOutboxPending = 0;
      emailOutboxFailed = 0;
      emailOutboxOldestPendingAt = null;
      emailOutboxOldestAgeMin = null;
    }

    try {
      const rows = await sql<{ last_sent_at: string | null }[]>`
        SELECT last_sent_at::text AS last_sent_at
        FROM app_ops_alert_state
        WHERE key = 'ops:degraded'
        LIMIT 1
      `;
      opsAlertLastSentAt = rows[0]?.last_sent_at ?? null;
    } catch {
      opsAlertLastSentAt = null;
    }
  }

  let heartbeats: HeartbeatRow[] = [];
  if (dbOk) {
    try {
      heartbeats = await listServiceHeartbeats(sql);
    } catch {
      heartbeats = [];
    }
  }

  const now = Date.now();
  const hbByService = new Map<string, { lastSeenAtMs: number; status: string }>();
  for (const hb of heartbeats) {
    const ts = Date.parse(String(hb.last_seen_at ?? ""));
    hbByService.set(String(hb.service), {
      lastSeenAtMs: Number.isFinite(ts) ? ts : 0,
      status: String(hb.status ?? "ok"),
    });
  }

  const staleExpectedServices: string[] = [];
  const expectedServices = getExpectedServices();
  for (const exp of expectedServices) {
    const row = hbByService.get(exp.service);
    if (!row) {
      staleExpectedServices.push(exp.service);
      continue;
    }
    if (!row.lastSeenAtMs || now - row.lastSeenAtMs > exp.staleAfterMs) staleExpectedServices.push(exp.service);
  }

  const overall = pickOverall({ dbOk, outboxDead, outboxWithErrors, staleExpectedServices });
  const tookMs = Date.now() - startedAt;

  return NextResponse.json({
    ok: true,
    overall,
    db: { ok: dbOk, latency_ms: dbLatencyMs },
    outbox: { open: outboxOpen, dead: outboxDead, with_errors: outboxWithErrors },
    email_outbox: {
      pending: emailOutboxPending,
      failed: emailOutboxFailed,
      oldest_pending_at: emailOutboxOldestPendingAt,
      oldest_age_min: emailOutboxOldestAgeMin,
    },
    ops_alerts: {
      degraded_last_sent_at: opsAlertLastSentAt,
    },
    expected_services: expectedServices,
    stale_expected_services: staleExpectedServices,
    heartbeats,
    took_ms: tookMs,
  });
}

export async function POST(request: Request) {
  const sql = getSql();
  const rateLimitRes = await enforceAccountSecurityRateLimit({
    sql,
    request,
    limiterName: "status.post",
    windowMs: 60_000,
    max: 15,
    includeIp: true,
  });
  if (rateLimitRes) return rateLimitRes;
  return apiError("invalid_input");
}
