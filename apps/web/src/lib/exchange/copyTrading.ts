/**
 * Copy Trading Engine
 *
 * Handles leader registration, follower subscriptions,
 * and order mirroring logic for cross-exchange copy trading.
 */
import type { Sql } from "postgres";

export type Leader = {
  id: string;
  user_id: string;
  display_name: string;
  bio: string | null;
  is_public: boolean;
  total_followers: number;
  total_pnl_pct: string;
  win_rate: string;
  created_at: string;
};

export type Subscription = {
  id: string;
  follower_user_id: string;
  leader_id: string;
  leader_name: string;
  status: "active" | "paused" | "stopped";
  copy_ratio: string;
  max_per_trade: string | null;
  connection_id: string | null;
  created_at: string;
};

// ── Leader operations ────────────────────────────────────────────────

export async function registerLeader(
  sql: Sql,
  userId: string,
  displayName: string,
  bio?: string,
): Promise<Leader> {
  const [row] = await sql`
    INSERT INTO copy_trading_leader (user_id, display_name, bio, is_public)
    VALUES (${userId}, ${displayName}, ${bio ?? null}, true)
    ON CONFLICT (user_id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      bio = EXCLUDED.bio,
      updated_at = now()
    RETURNING id, user_id, display_name, bio, is_public,
              total_followers, total_pnl_pct::text, win_rate::text, created_at
  `;
  return row as unknown as Leader;
}

export async function getPublicLeaders(sql: Sql): Promise<Leader[]> {
  const rows = await sql`
    SELECT id, user_id, display_name, bio, is_public,
           total_followers, total_pnl_pct::text, win_rate::text, created_at
    FROM copy_trading_leader
    WHERE is_public = true
    ORDER BY total_pnl_pct DESC, total_followers DESC
    LIMIT 50
  `;
  return rows as unknown as Leader[];
}

export async function getLeaderByUserId(sql: Sql, userId: string): Promise<Leader | null> {
  const [row] = await sql`
    SELECT id, user_id, display_name, bio, is_public,
           total_followers, total_pnl_pct::text, win_rate::text, created_at
    FROM copy_trading_leader
    WHERE user_id = ${userId}
  `;
  return (row as unknown as Leader) ?? null;
}

// ── Subscription operations ─────────────────────────────────────────

export async function subscribe(
  sql: Sql,
  followerUserId: string,
  leaderId: string,
  opts: { copyRatio?: number; maxPerTrade?: number; connectionId?: string } = {},
): Promise<Subscription> {
  const { copyRatio = 1.0, maxPerTrade, connectionId } = opts;

  const [row] = await sql`
    INSERT INTO copy_trading_subscription
      (follower_user_id, leader_id, copy_ratio, max_per_trade, connection_id)
    VALUES (
      ${followerUserId}, ${leaderId}, ${copyRatio},
      ${maxPerTrade ?? null}, ${connectionId ?? null}
    )
    ON CONFLICT (follower_user_id, leader_id) DO UPDATE SET
      status = 'active',
      copy_ratio = ${copyRatio},
      max_per_trade = ${maxPerTrade ?? null},
      connection_id = ${connectionId ?? null},
      updated_at = now()
    RETURNING id, follower_user_id, leader_id, status,
              copy_ratio::text, max_per_trade::text, connection_id, created_at
  `;

  // Update follower count
  await sql`
    UPDATE copy_trading_leader SET
      total_followers = (
        SELECT count(*) FROM copy_trading_subscription
        WHERE leader_id = ${leaderId} AND status = 'active'
      ),
      updated_at = now()
    WHERE id = ${leaderId}
  `;

  return {
    ...(row as unknown as Subscription),
    leader_name: "",
  };
}

export async function updateSubscription(
  sql: Sql,
  subscriptionId: string,
  followerUserId: string,
  updates: { status?: string; copyRatio?: number; maxPerTrade?: number | null },
): Promise<Subscription | null> {
  const setClauses: string[] = [];
  const vals: Record<string, unknown> = {};

  if (updates.status !== undefined) vals.status = updates.status;
  if (updates.copyRatio !== undefined) vals.copy_ratio = updates.copyRatio;
  if (updates.maxPerTrade !== undefined) vals.max_per_trade = updates.maxPerTrade;

  const [row] = await sql`
    UPDATE copy_trading_subscription SET
      status = COALESCE(${updates.status ?? null}, status),
      copy_ratio = COALESCE(${updates.copyRatio ?? null}, copy_ratio),
      max_per_trade = COALESCE(${updates.maxPerTrade ?? null}, max_per_trade),
      updated_at = now()
    WHERE id = ${subscriptionId} AND follower_user_id = ${followerUserId}
    RETURNING id, follower_user_id, leader_id, status,
              copy_ratio::text, max_per_trade::text, connection_id, created_at
  `;

  if (!row) return null;

  // Update leader follower count
  const sub = row as unknown as Subscription;
  await sql`
    UPDATE copy_trading_leader SET
      total_followers = (
        SELECT count(*) FROM copy_trading_subscription
        WHERE leader_id = ${sub.leader_id} AND status = 'active'
      ),
      updated_at = now()
    WHERE id = ${sub.leader_id}
  `;

  return { ...sub, leader_name: "" };
}

export async function getMySubscriptions(sql: Sql, userId: string): Promise<Subscription[]> {
  const rows = await sql`
    SELECT s.id, s.follower_user_id, s.leader_id, s.status,
           s.copy_ratio::text, s.max_per_trade::text, s.connection_id, s.created_at,
           l.display_name AS leader_name
    FROM copy_trading_subscription s
    JOIN copy_trading_leader l ON l.id = s.leader_id
    WHERE s.follower_user_id = ${userId}
    ORDER BY s.created_at DESC
  `;
  return rows as unknown as Subscription[];
}

export async function getLeaderSubscribers(sql: Sql, leaderId: string): Promise<Subscription[]> {
  const rows = await sql`
    SELECT id, follower_user_id, leader_id, status,
           copy_ratio::text, max_per_trade::text, connection_id, created_at
    FROM copy_trading_subscription
    WHERE leader_id = ${leaderId} AND status = 'active'
    ORDER BY created_at ASC
  `;
  return rows.map((r) => ({ ...(r as unknown as Subscription), leader_name: "" }));
}

// ── Active subscriptions for order mirroring ────────────────────────
export async function getActiveSubscriptionsForLeader(
  sql: Sql,
  leaderUserId: string,
): Promise<Array<Subscription & { follower_connection_id: string | null }>> {
  const rows = await sql`
    SELECT s.id, s.follower_user_id, s.leader_id, s.status,
           s.copy_ratio::text, s.max_per_trade::text, s.connection_id AS follower_connection_id,
           s.created_at, l.display_name AS leader_name
    FROM copy_trading_subscription s
    JOIN copy_trading_leader l ON l.id = s.leader_id
    WHERE l.user_id = ${leaderUserId}
      AND s.status = 'active'
  `;
  return rows as unknown as Array<Subscription & { follower_connection_id: string | null }>;
}

/**
 * Propagates an order from a leader to their active subscribers.
 * Uses an internal service token to securely place orders on behalf of users
 * without relying on the dev-only x-user-id header bypass.
 */
export async function propagateLeaderOrder(
  sql: Sql,
  params: {
    leaderUserId: string;
    marketId: string;
    side: "buy" | "sell";
    type: "limit" | "market";
    price?: string; // Limit price
    quantity: string;
  }
) {
  // 1. Get subscribers
  const subs = await getActiveSubscriptionsForLeader(sql, params.leaderUserId);
  if (subs.length === 0) return; // No one to copy

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.NODE_ENV === "production" ? "" : "http://localhost:3000");
  if (!baseUrl) {
    console.error("[copy-trading] NEXT_PUBLIC_BASE_URL is not set — cannot propagate orders safely");
    return;
  }
  const serviceSecret = process.env.INTERNAL_SERVICE_SECRET;
  if (!serviceSecret) {
    console.error("[copy-trading] INTERNAL_SERVICE_SECRET not set — cannot propagate orders");
    return;
  }

  // 2. Process each subscriber
  // We run these in parallel, but with a catch-all to prevent one failure stopping others.
  await Promise.all(
    subs.map(async (sub) => {
      try {
        // Calculate Quantity: (Leader Quantity) * (Copy Ratio)
        const ratio = parseFloat(sub.copy_ratio);
        const leaderQty = parseFloat(params.quantity);
        let subQty = leaderQty * ratio;

        // Apply Max Per Trade Cap
        if (sub.max_per_trade) {
          const max = parseFloat(sub.max_per_trade);
          if (subQty > max) subQty = max;
        }

        // Avoid dust
        if (subQty <= 0.00000001) return;

        // Construct Payload — always use MARKET for guaranteed fill on copy trades
        const payload: Record<string, string> = {
          market_id: params.marketId,
          side: params.side,
          type: "market",
          quantity: subQty.toFixed(8),
        };

        // Execute Call with internal service token for prod-safe auth
        const res = await fetch(`${baseUrl}/api/exchange/orders`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-service-token": serviceSecret,
            "x-user-id": sub.follower_user_id,
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
           const err = await res.text();
           console.error(`[copy-trading] Failed for sub ${sub.id}: HTTP ${res.status}`);
        }

      } catch (e) {
        console.error(`[copy-trading] Error processing sub ${sub.id}:`, e instanceof Error ? e.message : e);
      }
    })
  );
}
