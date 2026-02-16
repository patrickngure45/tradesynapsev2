import { NextRequest, NextResponse } from "next/server";

import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { apiError } from "@/lib/api/errors";
import { auditContextFromRequest, writeAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const sql = getSql();
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const { id } = await ctx.params;

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return apiError(activeErr);

    const [exec] = await sql<
      Array<{
        id: string;
        user_id: string;
        status: string;
        kind: string;
        exchange: string | null;
        symbol: string | null;
        params_json: any;
      }>
    >`
      SELECT id, user_id, status, kind, exchange, symbol, params_json
      FROM trading_bot_execution
      WHERE id = ${id}::uuid AND user_id = ${actingUserId}::uuid
      LIMIT 1
    `;

    if (!exec) return NextResponse.json({ error: "not_found" }, { status: 404 });

    // Idempotent stop: if already canceled, nothing to do.
    if (exec.status === "canceled") {
      return NextResponse.json({ success: true, status: exec.status, message: "Execution already canceled." });
    }

    // If not started yet, cancel immediately. The execute worker only runs when status='queued'.
    if (exec.status === "queued") {
      await sql`
        UPDATE trading_bot_execution
        SET status = 'canceled', finished_at = now(), error = NULL,
            result_json = jsonb_set(result_json, '{stop}', ${JSON.stringify({ at: new Date().toISOString(), note: "Canceled before start." })}::jsonb, true)
        WHERE id = ${id}::uuid AND user_id = ${actingUserId}::uuid
      `;

      const auditCtx = auditContextFromRequest(request);
      await writeAuditLog(sql, {
        actorId: actingUserId,
        actorType: "user",
        action: "trading.bot.stop",
        resourceType: "trading_bot_execution",
        resourceId: String(exec.id),
        ip: auditCtx.ip,
        userAgent: auditCtx.userAgent,
        requestId: auditCtx.requestId,
        detail: {
          execution_id: String(exec.id),
          kind: exec.kind,
          exchange: exec.exchange,
          symbol: exec.symbol,
          from_status: "queued",
          to_status: "canceled",
        },
      });

      return NextResponse.json({ success: true, status: "canceled", message: "Canceled before start." });
    }

    // For any other state (running/succeeded/failed/etc), enqueue an unwind job.
    // We move the execution into cancel_requested so the UI can display progress.
    if (exec.status !== "cancel_requested" && exec.status !== "unwinding") {
      await sql`
        UPDATE trading_bot_execution
        SET status = 'cancel_requested', error = NULL,
            result_json = jsonb_set(result_json, '{stop}', ${JSON.stringify({ at: new Date().toISOString(), note: "Stop requested." })}::jsonb, true)
        WHERE id = ${id}::uuid AND user_id = ${actingUserId}::uuid
      `;

      await sql`
        INSERT INTO app_outbox_event (topic, aggregate_type, aggregate_id, payload_json)
        VALUES (
          'trading.bot.unwind',
          'trading_bot_execution',
          ${String(exec.id)},
          ${JSON.stringify({ execution_id: String(exec.id) })}::jsonb
        )
      `;
    }

    const auditCtx = auditContextFromRequest(request);
    await writeAuditLog(sql, {
      actorId: actingUserId,
      actorType: "user",
      action: "trading.bot.stop",
      resourceType: "trading_bot_execution",
      resourceId: String(exec.id),
      ip: auditCtx.ip,
      userAgent: auditCtx.userAgent,
      requestId: auditCtx.requestId,
      detail: {
        execution_id: String(exec.id),
        kind: exec.kind,
        exchange: exec.exchange,
        symbol: exec.symbol,
        to_status: "cancel_requested",
      },
    });

    return NextResponse.json({
      success: true,
      status: "cancel_requested",
      message: "Stop requested. Unwind is queued in background.",
    });
  } catch (e) {
    console.error("[bot/stop] Error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
