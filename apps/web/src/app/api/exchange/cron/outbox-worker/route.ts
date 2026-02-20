import { NextRequest, NextResponse } from "next/server";

import { getSql } from "@/lib/db";
import { runOutboxWorkerOnce } from "@/lib/outbox/workerOnce";

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

export async function POST(req: NextRequest) {
  const authErr = requireCronAuth(req);
  if (authErr) {
    const status = authErr === "cron_unauthorized" ? 401 : 500;
    return NextResponse.json({ error: authErr }, { status });
  }

  const url = new URL(req.url);
  const batchSize = Number(url.searchParams.get("batch") ?? "");
  const maxBatches = Number(url.searchParams.get("max_batches") ?? "");
  const maxMs = Number(url.searchParams.get("max_ms") ?? "");
  const topicsRaw = (url.searchParams.get("topics") ?? "").trim();
  const topics = topicsRaw
    ? topicsRaw.split(",").map((t) => t.trim()).filter(Boolean)
    : undefined;

  const sql = getSql();

  try {
    const result = await runOutboxWorkerOnce(sql as any, {
      batchSize: Number.isFinite(batchSize) && batchSize > 0 ? batchSize : undefined,
      maxBatches: Number.isFinite(maxBatches) && maxBatches > 0 ? maxBatches : undefined,
      maxMs: Number.isFinite(maxMs) && maxMs > 0 ? maxMs : undefined,
      topics,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: "outbox_worker_failed", message },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
