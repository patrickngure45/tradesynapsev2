import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
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
  const userId = req.headers.get("x-user-id");
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
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    if (!body.leaderId) {
      return NextResponse.json({ error: "leaderId required" }, { status: 400 });
    }

    const sql = getSql();
    const sub = await subscribe(sql, userId, body.leaderId, {
      copyRatio: body.copyRatio,
      maxPerTrade: body.maxPerTrade,
      connectionId: body.connectionId,
    });

    return NextResponse.json({ subscription: sub }, { status: 201 });
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
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    if (!body.subscriptionId) {
      return NextResponse.json({ error: "subscriptionId required" }, { status: 400 });
    }

    const sql = getSql();
    const sub = await updateSubscription(sql, body.subscriptionId, userId, {
      status: body.status,
      copyRatio: body.copyRatio,
      maxPerTrade: body.maxPerTrade,
    });

    if (!sub) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }

    return NextResponse.json({ subscription: sub });
  } catch (err: unknown) {
    console.error("[copy-trading] Error updating subscription:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
