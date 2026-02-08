/**
 * POST /api/exchange/admin/withdrawals/[id]/broadcast
 *
 * Admin-triggered manual broadcast of an approved withdrawal.
 * The outbox worker handles this automatically, but admins may
 * need to manually trigger a retry or expedite a withdrawal.
 */
import { z } from "zod";

import { getSql } from "@/lib/db";
import { apiError, apiZodError } from "@/lib/api/errors";
import { responseForDbError } from "@/lib/dbTransient";
import { requireAdmin } from "@/lib/auth/admin";
import { logRouteResponse } from "@/lib/routeLog";
import { writeAuditLog, auditContextFromRequest } from "@/lib/auditLog";
import { handleWithdrawalBroadcast } from "@/lib/outbox/handlers/exchangeWithdrawalBroadcast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const startMs = Date.now();
  const sql = getSql();
  const admin = await requireAdmin(sql, request);
  if (!admin.ok) return apiError(admin.error);
  const { id } = await params;

  try {
    idSchema.parse(id);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  // Pre-check: withdrawal must exist and be approved
  const rows = await sql<{ id: string; status: string }[]>`
    SELECT id, status
    FROM ex_withdrawal_request
    WHERE id = ${id}
    LIMIT 1
  `;

  if (rows.length === 0) {
    return apiError("not_found", { status: 404 });
  }

  const w = rows[0]!;
  if (w.status !== "approved") {
    return apiError("trade_state_conflict", {
      status: 409,
      details: { current_status: w.status, message: "Only approved withdrawals can be broadcast" },
    });
  }

  try {
    await handleWithdrawalBroadcast(sql, { withdrawalId: id });

    // Re-fetch to get final status
    const final = await sql<{ status: string; tx_hash: string | null }[]>`
      SELECT status, tx_hash
      FROM ex_withdrawal_request
      WHERE id = ${id}
    `;

    const response = Response.json({
      ok: true,
      withdrawal_id: id,
      status: final[0]?.status ?? "unknown",
      tx_hash: final[0]?.tx_hash ?? null,
    });

    logRouteResponse(request, response, { startMs, meta: { withdrawalId: id } });

    try {
      await writeAuditLog(sql, {
        actorType: "admin",
        action: "withdrawal.broadcast",
        resourceType: "withdrawal",
        resourceId: id,
        ...auditContextFromRequest(request),
        detail: {
          final_status: final[0]?.status,
          tx_hash: final[0]?.tx_hash,
        },
      });
    } catch { /* audit log failure must not block response */ }

    return response;
  } catch (e) {
    const resp = responseForDbError("exchange.admin.withdrawals.broadcast", e);
    if (resp) return resp;
    throw e;
  }
}
