import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { randomUUID } from "node:crypto";

import { enqueueOutbox } from "@/lib/outbox";
import { upsertServiceHeartbeat } from "@/lib/system/heartbeat";
import { tryAcquireJobLock, releaseJobLock } from "@/lib/system/jobLock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((v) => (v == null ? 50 : Math.max(1, Math.min(500, Number(v) || 50)))),
});

function isProd() {
  return String(process.env.NODE_ENV ?? "").toLowerCase() === "production";
}

function isEnabledInProd(): boolean {
  return String(process.env.EXCHANGE_ENABLE_CONDITIONAL_ORDERS ?? "").trim() === "1";
}

function checkCronSecret(request: Request): boolean {
  const expected = String(process.env.EXCHANGE_CRON_SECRET ?? process.env.CRON_SECRET ?? "").trim();
  if (!expected) return false;
  const got = request.headers.get("x-cron-secret") ?? new URL(request.url).searchParams.get("secret") ?? "";
  return got === expected;
}

/**
 * POST /api/exchange/cron/conditional-orders
 * Secured with x-cron-secret. Disabled by default in production.
 */
export async function POST(request: Request) {
  if (isProd() && !isEnabledInProd()) return apiError("forbidden");
  if (!checkCronSecret(request)) return apiError("forbidden");

  const url = new URL(request.url);
  let q: z.infer<typeof querySchema>;
  try {
    q = querySchema.parse({ limit: url.searchParams.get("limit") ?? undefined });
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const sql = getSql();

  try {
    const holderId = randomUUID();
    const lockKey = "exchange:conditional-orders:enqueue";
    const lock = await tryAcquireJobLock(sql as any, { key: lockKey, holderId, ttlMs: 20_000 });
    if (!lock.acquired) {
      return Response.json({ ok: true, enqueued: false, skipped: true });
    }

    try {
      const id = await enqueueOutbox(sql as any, {
        topic: "ex.conditional.evaluate",
        aggregate_type: "exchange",
        aggregate_id: "conditional-orders",
        payload: { limit: q.limit },
      });

      await upsertServiceHeartbeat(sql as any, {
        service: "exchange:conditional-orders",
        status: "ok",
        details: { enqueued: true, outbox_event_id: id, limit: q.limit },
      });
    } catch {
      // ignore
    } finally {
      await releaseJobLock(sql as any, { key: lockKey, holderId });
    }

    return Response.json({ ok: true, enqueued: true, limit: q.limit });
  } catch (e) {
    const resp = responseForDbError("exchange.cron.conditional-orders", e);
    if (resp) return resp;
    throw e;
  }
}

// Allow simple cron providers that only support GET.
export async function GET(request: Request) {
  return POST(request);
}
