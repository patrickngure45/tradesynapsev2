import { getSql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Lightweight readiness probe.
 * Returns 200 if the app can connect to the DB and respond.
 * Returns 503 if the DB is unreachable.
 *
 * Use /api/health/db for a more detailed migration check.
 */
export async function GET() {
  const start = Date.now();

  try {
    const sql = getSql();
    await sql`SELECT 1 AS ok`;

    return Response.json(
      {
        status: "ok",
        uptime_s: Math.floor(process.uptime()),
        db: "reachable",
        ts: new Date().toISOString(),
        latency_ms: Date.now() - start,
      },
      { status: 200 }
    );
  } catch {
    return Response.json(
      {
        status: "degraded",
        db: "unreachable",
        ts: new Date().toISOString(),
        latency_ms: Date.now() - start,
      },
      { status: 503, headers: { "Retry-After": "5" } }
    );
  }
}
