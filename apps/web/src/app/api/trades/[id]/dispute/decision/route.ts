import { z } from "zod";

import { getSql } from "@/lib/db";
import { enforceAccountSecurityRateLimit } from "@/lib/auth/securityRateLimit";
import { canResolveFromDispute } from "@/lib/state/trade";
import { canTransitionDispute, isOpenLikeDisputeStatus } from "@/lib/state/dispute";
import { apiError, apiZodError } from "@/lib/api/errors";
import { responseForDbError } from "@/lib/dbTransient";
import { requireReviewerKey } from "@/lib/auth/keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postDecisionSchema = z.object({
  decision: z.enum(["release_to_buyer", "refund_buyer", "release_to_seller", "cancel_trade"]),
  decided_by: z.string().min(1).max(200),
  rationale: z.string().max(5000).optional(),
});

const tradeIdSchema = z.string().uuid();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireReviewerKey(request);
  if (!auth.ok) {
    return apiError(auth.error);
  }

  const sql = getSql();
  const { id } = await params;

  try {
    tradeIdSchema.parse(id);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const rateLimitRes = await enforceAccountSecurityRateLimit({
    sql,
    request,
    limiterName: "trades.dispute.decision",
    windowMs: 60_000,
    max: 20,
    includeIp: true,
  });
  if (rateLimitRes) return rateLimitRes;

  const json = await request.json().catch(() => ({}));
  let input: z.infer<typeof postDecisionSchema>;
  try {
    input = postDecisionSchema.parse(json);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  try {
    const result = await sql.begin(async (tx) => {
      const txSql = tx as unknown as typeof sql;

    const disputes = await txSql<{
      id: string;
      trade_id: string;
      status: string;
    }[]>`
      SELECT id, trade_id, status
      FROM dispute
      WHERE trade_id = ${id}
      LIMIT 1
    `;

    if (disputes.length === 0) {
      return { status: 404 as const, body: { error: "dispute_not_found" } };
    }

    const dispute = disputes[0]!;

    if (!isOpenLikeDisputeStatus(dispute.status)) {
      return { status: 409 as const, body: { error: "dispute_not_open" } };
    }

    if (!canTransitionDispute(dispute.status, "resolved")) {
      return {
        status: 409 as const,
        body: { error: "dispute_transition_not_allowed", details: { from: dispute.status, to: "resolved" } },
      };
    }

    const trades = await txSql<{ status: string }[]>`
      SELECT status
      FROM trade
      WHERE id = ${id}
      LIMIT 1
    `;

    if (trades.length === 0) {
      return { status: 404 as const, body: { error: "trade_not_found" } };
    }

    const tradeStatusBefore = trades[0]!.status;

    if (!canResolveFromDispute(tradeStatusBefore)) {
      return {
        status: 409 as const,
        body: { error: "trade_not_disputed", details: { status: tradeStatusBefore } },
      };
    }

    const nextTradeStatus = input.decision === "cancel_trade" ? "canceled" : "resolved";

    const decisions = await txSql<{
      id: string;
      dispute_id: string;
      decision: string;
      rationale: string | null;
      decided_by: string;
      created_at: string;
    }[]>`
      INSERT INTO dispute_decision (
        dispute_id,
        decision,
        rationale,
        decided_by
      ) VALUES (
        ${dispute.id},
        ${input.decision},
        ${input.rationale ?? null},
        ${input.decided_by}
      )
      RETURNING id, dispute_id, decision, rationale, decided_by, created_at
    `;

    const disputeUpdated = await txSql<{ id: string }[]>`
      UPDATE dispute
      SET status = 'resolved', resolved_at = now()
      WHERE id = ${dispute.id} AND status = ${dispute.status}
      RETURNING id
    `;

    if (disputeUpdated.length === 0) {
      return { status: 409 as const, body: { error: "trade_state_conflict" } };
    }

    if (tradeStatusBefore !== nextTradeStatus) {
      if (nextTradeStatus === "canceled") {
        const updated = await txSql<{ id: string }[]>`
          UPDATE trade
          SET status = 'canceled', canceled_at = now()
          WHERE id = ${id} AND status = 'disputed'
          RETURNING id
        `;
        if (updated.length === 0) {
          return { status: 409 as const, body: { error: "trade_state_conflict" } };
        }
      } else {
        const updated = await txSql<{ id: string }[]>`
          UPDATE trade
          SET status = 'resolved'
          WHERE id = ${id} AND status = 'disputed'
          RETURNING id
        `;
        if (updated.length === 0) {
          return { status: 409 as const, body: { error: "trade_state_conflict" } };
        }
      }

      await txSql`
        INSERT INTO trade_state_transition (
          trade_id,
          from_status,
          to_status,
          actor_user_id,
          actor_type,
          reason_code
        ) VALUES (
          ${id},
          ${tradeStatusBefore},
          ${nextTradeStatus},
          NULL,
          'system',
          ${"dispute_decision:" + input.decision + ":" + input.decided_by}
        )
      `;
    }

    return {
      status: 201 as const,
      body: { dispute_id: dispute.id, decision: decisions[0]! },
    };
    });

    if ("error" in result.body && typeof result.body.error === "string") {
      return apiError(result.body.error, { status: result.status });
    }

    return Response.json(result.body, { status: result.status });
  } catch (e) {
    const resp = responseForDbError("trades.dispute.decision", e);
    if (resp) return resp;
    throw e;
  }
}
