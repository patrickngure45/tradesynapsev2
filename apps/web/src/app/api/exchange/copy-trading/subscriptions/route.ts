import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { getActingUserId } from "@/lib/auth/party";
import { apiError } from "@/lib/api/errors";
import { enforceAccountSecurityRateLimit } from "@/lib/auth/securityRateLimit";
import { chargeGasFee } from "@/lib/exchange/gas";
import {
  subscribe,
  getMySubscriptions,
  updateSubscription,
} from "@/lib/exchange/copyTrading";

export const runtime = "nodejs";

/**
 * GET /api/exchange/copy-trading/subscriptions
 * Returns the current user's copy-trading subscriptions
 */
export async function GET(req: NextRequest) {
  const userId = getActingUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getSql();
  try {
    const subscriptions = await getMySubscriptions(sql, userId);
    return NextResponse.json({ subscriptions });
  } catch (err: unknown) {
    console.error("[copy-trading] Error fetching subscriptions:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "Failed to load subscriptions" }, { status: 500 });
  }
}

/**
 * POST /api/exchange/copy-trading/subscriptions
 * Subscribe to a leader
 * Body: { leaderId, copyRatio?, maxPerTrade?, connectionId? }
 */
export async function POST(req: NextRequest) {
  const userId = getActingUserId(req);
  if (!userId) {
    return apiError("unauthorized", { status: 401 });
  }

  const sql = getSql();
  const rl = await enforceAccountSecurityRateLimit({
    sql: sql as any,
    request: req,
    limiterName: "exchange.copy_trading.subscriptions.post",
    windowMs: 60_000,
    max: 12,
    userId,
  });
  if (rl) return rl;

  try {
    const body = await req.json();
    if (!body.leaderId) {
      return NextResponse.json({ error: "leaderId required" }, { status: 400 });
    }

    const result = await sql.begin(async (tx) => {
      const txSql = tx as unknown as typeof sql;

      const gasErr = await chargeGasFee(txSql, {
        userId,
        action: "copy_trading_subscribe",
        reference: String(body.leaderId),
      });
      if (gasErr) return { status: gasErr.code === "insufficient_gas" ? 409 : 500, body: { error: gasErr.code, details: gasErr.details } };

      const sub = await subscribe(txSql, userId, body.leaderId, {
        copyRatio: body.copyRatio,
        maxPerTrade: body.maxPerTrade,
        connectionId: body.connectionId,
      });

      return { status: 201, body: { subscription: sub } };
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (err: unknown) {
    console.error("[copy-trading] Error subscribing:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 });
  }
}

/**
 * PATCH /api/exchange/copy-trading/subscriptions
 * Update a subscription (pause, resume, change ratio, stop)
 * Body: { subscriptionId, status?, copyRatio?, maxPerTrade? }
 */
export async function PATCH(req: NextRequest) {
  const userId = getActingUserId(req);
  if (!userId) {
    return apiError("unauthorized", { status: 401 });
  }

  const sql = getSql();
  const rl = await enforceAccountSecurityRateLimit({
    sql: sql as any,
    request: req,
    limiterName: "exchange.copy_trading.subscriptions.patch",
    windowMs: 60_000,
    max: 16,
    userId,
  });
  if (rl) return rl;

  try {
    const body = await req.json();
    if (!body.subscriptionId) {
      return NextResponse.json({ error: "subscriptionId required" }, { status: 400 });
    }

    const result = await sql.begin(async (tx) => {
      const txSql = tx as unknown as typeof sql;

      const gasErr = await chargeGasFee(txSql, {
        userId,
        action: "copy_trading_update",
        reference: String(body.subscriptionId),
      });
      if (gasErr) return { status: gasErr.code === "insufficient_gas" ? 409 : 500, body: { error: gasErr.code, details: gasErr.details } };

      const sub = await updateSubscription(txSql, body.subscriptionId, userId, {
        status: body.status,
        copyRatio: body.copyRatio,
        maxPerTrade: body.maxPerTrade,
      });

      if (!sub) return { status: 404, body: { error: "Subscription not found" } };
      return { status: 200, body: { subscription: sub } };
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (err: unknown) {
    console.error("[copy-trading] Error updating subscription:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
