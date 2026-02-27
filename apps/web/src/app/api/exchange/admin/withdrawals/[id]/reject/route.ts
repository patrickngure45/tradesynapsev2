import { z } from "zod";

import { getSql } from "@/lib/db";
import { apiError, apiZodError } from "@/lib/api/errors";
import { enqueueOutbox } from "@/lib/outbox";
import { responseForDbError } from "@/lib/dbTransient";
import { requireAdminForApi } from "@/lib/auth/admin";
import { logRouteResponse } from "@/lib/routeLog";
import { writeAuditLog, auditContextFromRequest } from "@/lib/auditLog";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

const postSchema = z
  .object({
    reason: z.string().min(1).max(500).optional(),
    rejected_by: z.string().min(1).max(200).optional(),
  })
  .optional();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const startMs = Date.now();
  const sql = getSql();
  const admin = await requireAdminForApi(sql, request);
  if (!admin.ok) return admin.response;
  const { id } = await params;

  try {
    idSchema.parse(id);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const body = await request.json().catch(() => ({}));
  let input: z.infer<NonNullable<typeof postSchema>> | undefined;
  try {
    input = postSchema.parse(body);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const rejectedBy =
    input?.rejected_by ?? admin.userId;

  try {
    const result = await sql.begin(async (tx) => {
      const txSql = tx as unknown as typeof sql;

    const rows = await txSql<
      { id: string; status: string; hold_id: string | null; user_id: string; amount: string }[]
    >`
      SELECT id, status, hold_id, user_id::text AS user_id, amount::text AS amount
      FROM ex_withdrawal_request
      WHERE id = ${id}
      LIMIT 1
    `;

    if (rows.length === 0) return { status: 404 as const, body: { error: "not_found" } };
    const w = rows[0]!;

    // Idempotency: if already rejected, return success.
    if (w.status === "rejected") {
      return { status: 200 as const, body: { ok: true, withdrawal_id: id, status: "rejected" } };
    }

    // Prevent rejecting once approved/broadcasted/confirmed (would conflict with on-chain send).
    if (w.status === "approved" || w.status === "broadcasted" || w.status === "confirmed") {
      return {
        status: 409 as const,
        body: { error: "trade_state_conflict", details: { current_status: w.status } },
      };
    }

    if (w.status !== "requested" && w.status !== "needs_review") {
      return { status: 409 as const, body: { error: "trade_state_conflict", details: { current_status: w.status } } };
    }

    const reason = input?.reason ?? "rejected";

    const updated = await txSql<{ id: string }[]>`
      UPDATE ex_withdrawal_request
      SET status = 'rejected', failure_reason = ${reason}, approved_by = ${rejectedBy}, approved_at = now(), updated_at = now()
      WHERE id = ${id} AND status IN ('requested','needs_review')
      RETURNING id
    `;

    if (updated.length === 0) {
      return { status: 409 as const, body: { error: "trade_state_conflict" } };
    }

    if (w.hold_id) {
      await txSql`
        UPDATE ex_hold
        SET status = 'released', released_at = now()
        WHERE id = ${w.hold_id} AND status = 'active'
      `;
    }

    await enqueueOutbox(txSql, {
      topic: "ex.withdrawal.rejected",
      aggregate_type: "withdrawal",
      aggregate_id: id,
      payload: {
        withdrawal_id: id,
        rejected_by: rejectedBy,
        reason: input?.reason ?? "rejected",
        status: "rejected",
      },
    });

    // Notify user
    await createNotification(txSql, {
      userId: w.user_id,
      type: "withdrawal_rejected",
      title: "Withdrawal Rejected",
      body: `Your withdrawal of ${w.amount} was rejected${input?.reason ? `: ${input.reason}` : "."}`,
      metadata: { withdrawalId: id, reason: input?.reason ?? "rejected" },
    });

      return { status: 200 as const, body: { ok: true, withdrawal_id: id, status: "rejected" } };
    });


    const err = result.body as { error?: string; details?: unknown };
    if (typeof err.error === "string") {
      return apiError(err.error, { status: result.status, details: err.details });
    }

    const response = Response.json(result.body, { status: result.status });
    logRouteResponse(request, response, { startMs, meta: { withdrawalId: id, rejectedBy } });

    try {
      await writeAuditLog(sql, {
        actorType: "admin",
        action: "withdrawal.rejected",
        resourceType: "withdrawal",
        resourceId: id,
        ...auditContextFromRequest(request),
        detail: { rejected_by: rejectedBy, reason: input?.reason ?? "rejected" },
      });
    } catch { /* audit log failure must not block response */ }

    return response;
  } catch (e) {
    const resp = responseForDbError("exchange.admin.withdrawals.reject", e);
    if (resp) return resp;
    throw e;
  }
}
