import { z } from "zod";
import { NextResponse } from "next/server";

import { apiError, apiZodError } from "@/lib/api/errors";
import { requireAdminForApi } from "@/lib/auth/admin";
import { auditContextFromRequest, writeAuditLog } from "@/lib/auditLog";
import { getSql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  job: z.enum([
    "conditional_orders",
    "recurring_buys",
    "outbox_worker",
    "deposit_scan_bsc",
    "deposit_finalize_bsc",
    "sweep_deposits_bsc",
    "twap",
    "ops_alerts",
  ]),
  limit: z.coerce.number().int().min(1).max(500).optional(), // conditional orders
  max: z.coerce.number().int().min(1).max(200).optional(), // recurring buys
  max_blocks: z.coerce.number().int().min(10).max(20_000).optional(),
  blocks_per_batch: z.coerce.number().int().min(10).max(3_000).optional(),
  max_ms: z.coerce.number().int().min(1_000).max(120_000).optional(),
  confirmations: z.coerce.number().int().min(0).max(200).optional(),
  tokens: z.coerce.number().int().min(0).max(1).optional(),
  native: z.coerce.number().int().min(0).max(1).optional(),
  finalize: z.coerce.number().int().min(0).max(1).optional(),
  execute: z.coerce.number().int().min(0).max(1).optional(),
  force: z.coerce.number().int().min(0).max(1).optional(),
  gas_topups: z.coerce.number().int().min(0).max(1).optional(),
  symbols: z.string().trim().max(500).optional(),
  batch: z.coerce.number().int().min(1).max(100).optional(),
  max_batches: z.coerce.number().int().min(1).max(25).optional(),
  outbox_max_ms: z.coerce.number().int().min(2_000).max(55_000).optional(),
  topics: z.array(z.string().trim().min(1).max(200)).optional(),
});

function cronSecret(): string {
  return String(process.env.EXCHANGE_CRON_SECRET ?? process.env.CRON_SECRET ?? "").trim();
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, Math.max(0, max - 1)) + "…";
}

export async function POST(request: Request) {
  const sql = getSql();
  const admin = await requireAdminForApi(sql, request);
  if (!admin.ok) return admin.response;

  const json = await request.json().catch(() => ({}));
  let input: z.infer<typeof postSchema>;
  try {
    input = postSchema.parse(json);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const origin = new URL(request.url).origin;
  const secret = cronSecret();
  const isProd = String(process.env.NODE_ENV ?? "").toLowerCase() === "production";
  if (isProd && !secret) return apiError("cron_secret_not_configured");

  const url = new URL(origin);
  let path = "";
  const headers: HeadersInit = {
    "content-type": "application/json",
  };
  if (secret) headers["x-cron-secret"] = secret;

  if (input.job === "conditional_orders") {
    path = "/api/exchange/cron/conditional-orders";
    url.pathname = path;
    if (input.limit != null) url.searchParams.set("limit", String(input.limit));
  } else if (input.job === "recurring_buys") {
    path = "/api/exchange/cron/recurring-buys";
    url.pathname = path;
    if (input.max != null) url.searchParams.set("max", String(input.max));
  } else if (input.job === "outbox_worker") {
    path = "/api/exchange/cron/outbox-worker";
    url.pathname = path;
    if (input.batch != null) url.searchParams.set("batch", String(input.batch));
    if (input.max_batches != null) url.searchParams.set("max_batches", String(input.max_batches));
    if (input.outbox_max_ms != null) url.searchParams.set("max_ms", String(input.outbox_max_ms));
    if (input.topics?.length) url.searchParams.set("topics", input.topics.join(","));
  } else if (input.job === "deposit_scan_bsc") {
    path = "/api/exchange/cron/scan-deposits";
    url.pathname = path;
    if (input.max_blocks != null) url.searchParams.set("max_blocks", String(input.max_blocks));
    if (input.blocks_per_batch != null) url.searchParams.set("blocks_per_batch", String(input.blocks_per_batch));
    if (input.max_ms != null) url.searchParams.set("max_ms", String(input.max_ms));
    if (input.confirmations != null) url.searchParams.set("confirmations", String(input.confirmations));
    if (input.tokens != null) url.searchParams.set("tokens", String(input.tokens));
    if (input.native != null) url.searchParams.set("native", String(input.native));
    if (input.finalize != null) url.searchParams.set("finalize", String(input.finalize));
    if (input.symbols) url.searchParams.set("symbols", input.symbols);
  } else if (input.job === "deposit_finalize_bsc") {
    path = "/api/exchange/cron/finalize-deposits";
    url.pathname = path;
    if (input.max != null) url.searchParams.set("max", String(Math.max(1, Math.min(2000, input.max))));
    if (input.max_ms != null) url.searchParams.set("max_ms", String(input.max_ms));
    if (input.confirmations != null) url.searchParams.set("confirmations", String(input.confirmations));
  } else if (input.job === "sweep_deposits_bsc") {
    path = "/api/exchange/cron/sweep-deposits";
    url.pathname = path;
    if (input.execute != null) url.searchParams.set("execute", String(input.execute));
    if (input.force != null) url.searchParams.set("force", String(input.force));
    if (input.gas_topups != null) url.searchParams.set("gas_topups", String(input.gas_topups));
    if (input.tokens != null) url.searchParams.set("tokens", String(input.tokens));
    if (input.symbols) url.searchParams.set("symbols", input.symbols);
  } else if (input.job === "ops_alerts") {
    path = "/api/cron/ops-alerts";
    url.pathname = path;
    if (input.force != null) url.searchParams.set("force", String(input.force));
  } else {
    path = "/api/exchange/cron/twap";
    url.pathname = path;
    if (input.max != null) url.searchParams.set("max", String(input.max));
  }

  const targetUrl = url.toString();
  const ctx = auditContextFromRequest(request);

  try {
    const resp = await fetch(targetUrl, {
      method: "POST",
      headers,
      cache: "no-store",
    });

    const text = await resp.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { _raw: text };
    }

    const obj = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
    const err = obj && typeof obj.error === "string" ? obj.error : null;
    const msg = obj && typeof obj.message === "string" ? obj.message : null;

    try {
      await writeAuditLog(sql as any, {
        actorId: admin.userId,
        actorType: "admin",
        action: "admin.cron.run",
        resourceType: "cron_job",
        resourceId: input.job,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
        detail: {
          job: input.job,
          target_path: path,
          target_url: targetUrl,
          input,
          downstream: {
            ok: resp.ok,
            status: resp.status,
            error: err,
            message: msg ? truncate(msg, 500) : null,
          },
        },
      });
    } catch {
      // ignore audit failures
    }

    return NextResponse.json(
      {
        ok: resp.ok,
        job: input.job,
        status: resp.status,
        data,
      },
      { status: resp.ok ? 200 : resp.status },
    );
  } catch (e) {
    try {
      await writeAuditLog(sql as any, {
        actorId: admin.userId,
        actorType: "admin",
        action: "admin.cron.run_failed",
        resourceType: "cron_job",
        resourceId: input.job,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
        detail: {
          job: input.job,
          target_path: path,
          target_url: targetUrl,
          input,
          error: e instanceof Error ? truncate(e.message, 500) : truncate(String(e), 500),
        },
      });
    } catch {
      // ignore
    }
    return apiError("internal_error");
  }
}
