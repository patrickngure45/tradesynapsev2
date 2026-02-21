import { z } from "zod";

import { getSql } from "@/lib/db";
import { apiError, apiZodError } from "@/lib/api/errors";
import { enqueueOutbox } from "@/lib/outbox";
import { responseForDbError } from "@/lib/dbTransient";
import { requireAdminForApi } from "@/lib/auth/admin";
import { logRouteResponse } from "@/lib/routeLog";
import { writeAuditLog, auditContextFromRequest } from "@/lib/auditLog";
import { createNotification } from "@/lib/notifications";
import { toBigInt3818 } from "@/lib/exchange/fixed3818";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

const postSchema = z
  .object({
    approved_by: z.string().min(1).max(200).optional(),
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

  const approvedBy =
    input?.approved_by ?? admin.userId;

  try {
    const result = await sql.begin(async (tx) => {
      const txSql = tx as unknown as typeof sql;

    const rows = await txSql<
      {
        id: string;
        status: string;
        user_id: string;
        amount: string;
        asset_id: string;
        asset_symbol: string;
        hold_id: string | null;
        hold_status: string | null;
        hold_remaining_amount: string | null;
      }[]
    >`
      SELECT
        w.id,
        w.status,
        w.user_id::text AS user_id,
        w.amount::text AS amount,
        w.asset_id::text AS asset_id,
        a.symbol AS asset_symbol,
        w.hold_id::text AS hold_id,
        h.status AS hold_status,
        h.remaining_amount::text AS hold_remaining_amount
      FROM ex_withdrawal_request w
      JOIN ex_asset a ON a.id = w.asset_id
      LEFT JOIN ex_hold h ON h.id = w.hold_id
      WHERE w.id = ${id}
      LIMIT 1
      FOR UPDATE
    `;

    if (rows.length === 0) return { status: 404 as const, body: { error: "not_found" } };
    const w = rows[0]!;

    // Idempotency: if already approved/broadcasted/confirmed, return success.
    if (w.status === "approved" || w.status === "broadcasted" || w.status === "confirmed") {
      return { status: 200 as const, body: { ok: true, withdrawal_id: id, status: w.status } };
    }

    if (w.status !== "requested" && w.status !== "needs_review") {
      return { status: 409 as const, body: { error: "trade_state_conflict", details: { current_status: w.status } } };
    }

    // Ensure we have an active hold reserved for this withdrawal.
    if (!w.hold_id) {
      return { status: 409 as const, body: { error: "withdrawal_missing_hold" } };
    }
    if (w.hold_status !== "active") {
      return {
        status: 409 as const,
        body: { error: "withdrawal_hold_not_active", details: { hold_status: w.hold_status } },
      };
    }
    if (w.hold_remaining_amount && toBigInt3818(w.hold_remaining_amount) < toBigInt3818(w.amount)) {
      return {
        status: 409 as const,
        body: {
          error: "withdrawal_hold_insufficient",
          details: { remaining: w.hold_remaining_amount, required: w.amount },
        },
      };
    }

    // If we have a risk signal that says "block", require rejection.
    const risk = await txSql<
      { recommended_action: string | null; score: number | null; model_version: string | null }[]
    >`
      SELECT recommended_action, score::int AS score, model_version
      FROM app_signal
      WHERE subject_type = 'withdrawal'
        AND subject_id = ${id}
        AND kind = 'risk_assessment'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const latest = risk[0] ?? null;
    if (latest?.recommended_action === "block") {
      return {
        status: 409 as const,
        body: {
          error: "withdrawal_risk_blocked",
          details: {
            score: latest.score,
            recommended_action: latest.recommended_action,
            model_version: latest.model_version,
          },
        },
      };
    }

    const updated = await txSql<{ id: string }[]>`
      UPDATE ex_withdrawal_request
      SET status = 'approved', approved_by = ${approvedBy}, approved_at = now(), updated_at = now()
      WHERE id = ${id} AND status IN ('requested','needs_review')
      RETURNING id
    `;

    if (updated.length === 0) {
      return { status: 409 as const, body: { error: "trade_state_conflict" } };
    }

    await enqueueOutbox(txSql, {
      topic: "ex.withdrawal.approved",
      aggregate_type: "withdrawal",
      aggregate_id: id,
      payload: {
        withdrawal_id: id,
        approved_by: approvedBy,
        status: "approved",
      },
    });

    // Notify user
    await createNotification(txSql, {
      userId: w.user_id,
      type: "withdrawal_approved",
      title: "Withdrawal Approved",
      body: `Your withdrawal of ${w.amount} has been approved and is being processed.`,
      metadata: { withdrawalId: id },
    });

      return { status: 200 as const, body: { ok: true, withdrawal_id: id, status: "approved" } };
    });

    const err = result.body as { error?: string; details?: unknown };
    if (typeof err.error === "string") {
      return apiError(err.error, { status: result.status, details: err.details });
    }

    const response = Response.json(result.body, { status: result.status });
    logRouteResponse(request, response, { startMs, meta: { withdrawalId: id, approvedBy } });

    try {
      await writeAuditLog(sql, {
        actorType: "admin",
        action: "withdrawal.approved",
        resourceType: "withdrawal",
        resourceId: id,
        ...auditContextFromRequest(request),
        detail: { approved_by: approvedBy },
      });
    } catch { /* audit log failure must not block response */ }

    return response;
  } catch (e) {
    const resp = responseForDbError("exchange.admin.withdrawals.approve", e);
    if (resp) return resp;
    throw e;
  }
}
