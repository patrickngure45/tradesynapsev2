import { getSql } from "@/lib/db";
import { requireAdminForApi } from "@/lib/auth/admin";
import { apiError } from "@/lib/api/errors";
import { listDeadLetters, retryDeadLetter, countDeadLetters } from "@/lib/outbox";
import { responseForDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/exchange/admin/outbox/dead-letters — list dead-lettered outbox events */
export async function GET(request: Request) {
  const sql = getSql();
  const admin = await requireAdminForApi(sql, request);
  if (!admin.ok) return admin.response;
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") ?? "50")));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0"));
  const topic = url.searchParams.get("topic") ?? undefined;

  try {
    const [rows, total] = await Promise.all([
      listDeadLetters(sql, { limit, offset, topic }),
      countDeadLetters(sql, { topic }),
    ]);
    return Response.json({ dead_letters: rows, total, count: rows.length, limit, offset });
  } catch (e) {
    const resp = responseForDbError("admin.outbox.dead-letters.list", e);
    if (resp) return resp;
    throw e;
  }
}

/** POST /api/exchange/admin/outbox/dead-letters — retry a dead-lettered event */
export async function POST(request: Request) {
  const sql = getSql();
  const admin = await requireAdminForApi(sql, request);
  if (!admin.ok) return admin.response;
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : null;

  if (!id) return apiError("invalid_input");

  try {
    const ok = await retryDeadLetter(sql, { id });
    if (!ok) {
      return Response.json(
        { error: "not_found", message: "Event not found or not dead-lettered" },
        { status: 404 },
      );
    }
    return Response.json({ retried: true, id });
  } catch (e) {
    const resp = responseForDbError("admin.outbox.dead-letters.retry", e);
    if (resp) return resp;
    throw e;
  }
}
