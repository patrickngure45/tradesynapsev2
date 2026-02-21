import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Railway may provide one of these depending on deploy method.
  const commit =
    process.env.RAILWAY_GIT_COMMIT_SHA ??
    process.env.GIT_COMMIT_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    null;

  return NextResponse.json({
    ok: true,
    commit,
    node_env: process.env.NODE_ENV ?? null,
    service: process.env.RAILWAY_SERVICE_NAME ?? process.env.SERVICE_NAME ?? null,
    now: new Date().toISOString(),
  });
}
