import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import {
  getPublicLeaders,
  registerLeader,
} from "@/lib/exchange/copyTrading";

export const runtime = "nodejs";

/**
 * GET /api/exchange/copy-trading/leaders
 * Returns public leader profiles ranked by PnL
 */
export async function GET() {
  const sql = getSql();
  try {
    const leaders = await getPublicLeaders(sql);
    return NextResponse.json({ leaders });
  } catch (err: unknown) {
    console.error("[copy-trading] Error fetching leaders:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "Failed to load leaders" }, { status: 500 });
  }
}

/**
 * POST /api/exchange/copy-trading/leaders
 * Register or update the current user as a copy-trading leader
 * Body: { displayName, bio? }
 */
export async function POST(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const displayName = body.displayName?.trim();
    if (!displayName || displayName.length < 2) {
      return NextResponse.json({ error: "Display name required (min 2 chars)" }, { status: 400 });
    }

    const sql = getSql();
    const leader = await registerLeader(sql, userId, displayName, body.bio);
    return NextResponse.json({ leader }, { status: 201 });
  } catch (err: unknown) {
    console.error("[copy-trading] Error registering leader:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "Failed to register" }, { status: 500 });
  }
}
