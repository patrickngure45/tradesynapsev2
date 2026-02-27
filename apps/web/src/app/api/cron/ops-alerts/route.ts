import { createHash } from "node:crypto";

import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { upsertServiceHeartbeat, listServiceHeartbeats } from "@/lib/system/heartbeat";
import { sendMail, isEmailConfigured } from "@/lib/email/transport";
import { opsAlertEmail } from "@/lib/email/templates";
import { requireCronRequestAuth } from "@/lib/auth/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvEnv(name: string, fallbackCsv = ""): string[] {
  const raw = String(process.env[name] ?? fallbackCsv).trim();
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function envInt(name: string, fallback: number, opts?: { min?: number; max?: number }): number {
  const n = Number(process.env[name]);
  const min = opts?.min ?? -Infinity;
  const max = opts?.max ?? Infinity;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

type ServiceExpectation = { service: string; staleAfterMs: number };

function getExpectedServices(): ServiceExpectation[] {
  const expected: ServiceExpectation[] = [];

  const expectOutboxWorker = (process.env.EXPECT_OUTBOX_WORKER ?? "").trim() === "1";
  if (expectOutboxWorker) expected.push({ service: "outbox-worker", staleAfterMs: 10 * 60_000 });

  const enableConditional = (process.env.EXCHANGE_ENABLE_CONDITIONAL_ORDERS ?? "").trim() === "1";
  if (enableConditional) expected.push({ service: "exchange:conditional-orders", staleAfterMs: 10 * 60_000 });

  const enablePriceAlerts = (process.env.EXCHANGE_ENABLE_PRICE_ALERTS ?? "").trim() === "1";
  if (enablePriceAlerts) expected.push({ service: "cron:price-alerts", staleAfterMs: 15 * 60_000 });

  const expectDepositScan = (process.env.EXPECT_DEPOSIT_SCAN ?? "").trim() === "1";
  const expectSweepDeposits = (process.env.EXPECT_SWEEP_DEPOSITS ?? "").trim() === "1";
  if (expectDepositScan) expected.push({ service: "deposit-scan:bsc", staleAfterMs: 60 * 60_000 });
  if (expectSweepDeposits) expected.push({ service: "sweep-deposits:bsc", staleAfterMs: 60 * 60_000 });

  // When email is configured, we expect this cron to run and heartbeat.
  if (isEmailConfigured()) expected.push({ service: "cron:email-notifications", staleAfterMs: 60 * 60_000 });

  return expected;
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

const querySchema = z.object({
  force: z
    .string()
    .optional()
    .transform((v) => (String(v ?? "").trim() === "1" ? true : false)),
});

export async function POST(request: Request) {
  const startMs = Date.now();
  const sql = getSql();

  const authErr = requireCronRequestAuth(request);
  if (authErr) return apiError("unauthorized", { status: authErr === "cron_unauthorized" ? 401 : 500 });

  const url = new URL(request.url);
  let q: z.infer<typeof querySchema>;
  try {
    q = querySchema.parse({ force: url.searchParams.get("force") ?? undefined });
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const toList = csvEnv("OPS_ALERT_EMAIL_TO");
  if (toList.length === 0) {
    await upsertServiceHeartbeat(sql as any, {
      service: "cron:ops-alerts",
      status: "degraded",
      details: { skipped: true, reason: "ops_alert_email_to_not_configured", duration_ms: Date.now() - startMs },
    }).catch(() => void 0);
    return Response.json({ ok: true, skipped: true, reason: "ops_alert_email_to_not_configured" });
  }

  if (!isEmailConfigured()) {
    await upsertServiceHeartbeat(sql as any, {
      service: "cron:ops-alerts",
      status: "degraded",
      details: { skipped: true, reason: "email_not_configured", duration_ms: Date.now() - startMs },
    }).catch(() => void 0);
    return Response.json({ ok: true, skipped: true, reason: "email_not_configured" });
  }

  const minIntervalMinutes = envInt("OPS_ALERT_MIN_INTERVAL_MINUTES", 30, { min: 1, max: 24 * 60 });
  const outboxDeadThreshold = envInt("OPS_OUTBOX_DEAD_THRESHOLD", 1, { min: 0, max: 1_000_000 });
  const outboxOpenThreshold = envInt("OPS_OUTBOX_OPEN_THRESHOLD", 5000, { min: 0, max: 1_000_000 });
  const emailOutboxPendingThreshold = envInt("OPS_EMAIL_OUTBOX_PENDING_THRESHOLD", 200, { min: 0, max: 1_000_000 });
  const emailOutboxAgeMinutes = envInt("OPS_EMAIL_OUTBOX_AGE_MINUTES", 20, { min: 0, max: 24 * 60 });
  const jobLockStaleAfterMinutes = envInt("OPS_JOB_LOCK_STALE_AFTER_MINUTES", 10, { min: 1, max: 7 * 24 * 60 });

  try {
    const result = await retryOnceOnTransientDbError(async () => {
      const [{ open: outboxOpen, dead: outboxDead, with_errors: outboxWithErrors } = { open: 0, dead: 0, with_errors: 0 }] = await sql<
        { open: number; dead: number; with_errors: number }[]
      >`
        SELECT
          count(*) FILTER (WHERE processed_at IS NULL AND dead_lettered_at IS NULL)::int AS open,
          count(*) FILTER (WHERE dead_lettered_at IS NOT NULL)::int AS dead,
          count(*) FILTER (WHERE last_error IS NOT NULL)::int AS with_errors
        FROM app_outbox_event
      `;

      const [{ pending: emailPending, failed: emailFailed, oldest_pending_at: oldestPendingAt } = { pending: 0, failed: 0, oldest_pending_at: null }] = await sql<
        { pending: number; failed: number; oldest_pending_at: string | null }[]
      >`
        SELECT
          count(*) FILTER (WHERE status = 'pending')::int AS pending,
          count(*) FILTER (WHERE status = 'failed')::int AS failed,
          min(created_at) FILTER (WHERE status = 'pending')::timestamptz::text AS oldest_pending_at
        FROM ex_email_outbox
      `;

      const heartbeats = await listServiceHeartbeats(sql as any);
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

      const staleLocks = await sql<
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
        WHERE held_until > now()
          AND updated_at < now() - make_interval(mins => ${jobLockStaleAfterMinutes})
        ORDER BY updated_at ASC
        LIMIT 25
      `;

      const oldestPendingMs = oldestPendingAt ? Date.parse(oldestPendingAt) : NaN;
      const emailOldestAgeMin = Number.isFinite(oldestPendingMs) ? Math.max(0, Math.floor((now - oldestPendingMs) / 60_000)) : null;

      const issues: string[] = [];

      if (outboxDeadThreshold >= 0 && outboxDead > outboxDeadThreshold) {
        issues.push(`app_outbox_event dead letters: ${outboxDead} (threshold ${outboxDeadThreshold})`);
      }
      if (outboxOpenThreshold >= 0 && outboxOpen > outboxOpenThreshold) {
        issues.push(`app_outbox_event backlog open: ${outboxOpen} (threshold ${outboxOpenThreshold})`);
      }
      if (outboxWithErrors > 0) {
        issues.push(`app_outbox_event has errors: ${outboxWithErrors}`);
      }

      if (emailOutboxPendingThreshold >= 0 && emailPending > emailOutboxPendingThreshold) {
        issues.push(`ex_email_outbox pending: ${emailPending} (threshold ${emailOutboxPendingThreshold})`);
      }
      if (emailFailed > 0) {
        issues.push(`ex_email_outbox failed: ${emailFailed}`);
      }
      if (emailOutboxAgeMinutes > 0 && emailOldestAgeMin != null && emailOldestAgeMin >= emailOutboxAgeMinutes) {
        issues.push(`ex_email_outbox oldest pending age: ${emailOldestAgeMin}m (threshold ${emailOutboxAgeMinutes}m)`);
      }

      if (staleExpectedServices.length > 0) {
        issues.push(`stale services: ${staleExpectedServices.join(", ")}`);
      }

      if (staleLocks.length > 0) {
        const sample = staleLocks
          .slice(0, 10)
          .map((l) => `${l.key} (holder ${l.holder_id})`)
          .join(", ");
        issues.push(
          `stale job locks: ${staleLocks.length} (>${jobLockStaleAfterMinutes}m since update). ${sample}`,
        );
      }

      const degraded = issues.length > 0;
      const fingerprint = sha256(
        JSON.stringify({
          issues,
          outboxOpen,
          outboxDead,
          outboxWithErrors,
          emailPending,
          emailFailed,
          oldestPendingAt,
          staleExpectedServices,
          staleLocks,
          jobLockStaleAfterMinutes,
        }),
      );

      // Dedupe: only send when fingerprint changes OR minimum interval passed.
      const stateKey = "ops:degraded";
      const [state] = await sql<{ last_sent_at: string; last_fingerprint: string | null }[]>`
        SELECT last_sent_at::text AS last_sent_at, last_fingerprint
        FROM app_ops_alert_state
        WHERE key = ${stateKey}
        LIMIT 1
      `;

      const lastSentMs = state?.last_sent_at ? Date.parse(String(state.last_sent_at)) : 0;
      const minutesSince = lastSentMs && Number.isFinite(lastSentMs) ? Math.floor((now - lastSentMs) / 60_000) : 10_000;
      const sameFingerprint = Boolean(state?.last_fingerprint && state.last_fingerprint === fingerprint);

      const shouldSend = degraded && (q.force || !sameFingerprint || minutesSince >= minIntervalMinutes);

      return {
        degraded,
        issues,
        fingerprint,
        shouldSend,
        minutesSince,
        expectedServices,
        staleExpectedServices,
        staleLocks,
        metrics: {
          outbox: { open: outboxOpen, dead: outboxDead, with_errors: outboxWithErrors },
          email_outbox: { pending: emailPending, failed: emailFailed, oldest_pending_at: oldestPendingAt, oldest_age_min: emailOldestAgeMin },
        },
      };
    });

    if (!result.degraded) {
      await upsertServiceHeartbeat(sql as any, {
        service: "cron:ops-alerts",
        status: "ok",
        details: { degraded: false, duration_ms: Date.now() - startMs },
      }).catch(() => void 0);

      return Response.json({ ok: true, degraded: false, took_ms: Date.now() - startMs });
    }

    if (!result.shouldSend) {
      await upsertServiceHeartbeat(sql as any, {
        service: "cron:ops-alerts",
        status: "degraded",
        details: { degraded: true, sent: false, reason: "deduped", minutes_since_last: result.minutesSince, duration_ms: Date.now() - startMs },
      }).catch(() => void 0);

      return Response.json({ ok: true, degraded: true, sent: false, reason: "deduped", issues: result.issues, took_ms: Date.now() - startMs });
    }

    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
    const statusUrl = (() => {
      try {
        if (!baseUrl) return "";
        return new URL("/status", baseUrl).toString();
      } catch {
        return "";
      }
    })();

    const email = opsAlertEmail({
      title: "Degraded health detected",
      summary: "One or more operational signals exceeded thresholds.",
      lines: result.issues,
      statusUrl,
    });

    for (const to of toList) {
      await sendMail({ to, subject: email.subject, text: email.text, html: email.html });
    }

    const stateKey = "ops:degraded";
    await sql`
      INSERT INTO app_ops_alert_state (key, last_sent_at, last_fingerprint, updated_at)
      VALUES (${stateKey}, now(), ${result.fingerprint}, now())
      ON CONFLICT (key) DO UPDATE
        SET last_sent_at = EXCLUDED.last_sent_at,
            last_fingerprint = EXCLUDED.last_fingerprint,
            updated_at = EXCLUDED.updated_at
    `;

    await upsertServiceHeartbeat(sql as any, {
      service: "cron:ops-alerts",
      status: "degraded",
      details: { degraded: true, sent: true, issues: result.issues, duration_ms: Date.now() - startMs },
    }).catch(() => void 0);

    return Response.json({ ok: true, degraded: true, sent: true, to: toList.length, issues: result.issues, took_ms: Date.now() - startMs });
  } catch (e) {
    await upsertServiceHeartbeat(sql as any, {
      service: "cron:ops-alerts",
      status: "error",
      details: { error: e instanceof Error ? e.message : String(e), duration_ms: Date.now() - startMs },
    }).catch(() => void 0);

    const resp = responseForDbError("cron.ops-alerts", e);
    if (resp) return resp;
    throw e;
  }
}

export async function GET(request: Request) {
  return POST(request);
}
