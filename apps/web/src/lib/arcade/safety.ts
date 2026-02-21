import { getSql } from "@/lib/db";

export type ArcadeSafetyLimits = {
  self_excluded_until: string | null;
  daily_action_limit: number | null;
  daily_shard_spend_limit: number | null;
};

function utcDateIso(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0, 10);
}

export async function getArcadeSafetyLimits(
  sql: ReturnType<typeof getSql>,
  userId: string,
): Promise<ArcadeSafetyLimits> {
  const rows = await sql<
    {
      self_excluded_until: string | null;
      daily_action_limit: number | null;
      daily_shard_spend_limit: number | null;
    }[]
  >`
    SELECT
      self_excluded_until::text AS self_excluded_until,
      daily_action_limit,
      daily_shard_spend_limit
    FROM arcade_safety_limits
    WHERE user_id = ${userId}::uuid
    LIMIT 1
  `;

  const row = rows[0];
  return {
    self_excluded_until: row?.self_excluded_until ?? null,
    daily_action_limit: row?.daily_action_limit ?? null,
    daily_shard_spend_limit: row?.daily_shard_spend_limit ?? null,
  };
}

export async function enforceArcadeSafety(
  sql: ReturnType<typeof getSql>,
  input: { userId: string; module: string; shardSpend?: number },
): Promise<{ ok: true } | { ok: false; error: string; details?: any }> {
  const limits = await getArcadeSafetyLimits(sql, input.userId);

  if (limits.self_excluded_until) {
    const untilMs = Date.parse(limits.self_excluded_until);
    if (Number.isFinite(untilMs) && untilMs > Date.now()) {
      return { ok: false, error: "self_excluded", details: { until: limits.self_excluded_until } };
    }
  }

  if (typeof limits.daily_action_limit === "number" && Number.isFinite(limits.daily_action_limit) && limits.daily_action_limit > 0) {
    const todayIso = utcDateIso(new Date());
    const since = `${todayIso}T00:00:00.000Z`;
    const [row] = await sql<{ c: string }[]>`
      SELECT count(*)::text AS c
      FROM arcade_action
      WHERE user_id = ${input.userId}::uuid
        AND requested_at >= ${since}::timestamptz
    `;
    const c = Number(row?.c ?? "0");
    if (Number.isFinite(c) && c >= limits.daily_action_limit) {
      return { ok: false, error: "rate_limit_exceeded", details: { kind: "daily_action_limit", limit: limits.daily_action_limit } };
    }
  }

  const spend = Math.max(0, Math.floor(Number(input.shardSpend ?? 0)));
  if (spend > 0 && typeof limits.daily_shard_spend_limit === "number" && Number.isFinite(limits.daily_shard_spend_limit) && limits.daily_shard_spend_limit > 0) {
    const todayIso = utcDateIso(new Date());
    const since = `${todayIso}T00:00:00.000Z`;

    const [row] = await sql<{ q: string }[]>`
      SELECT coalesce(sum(quantity), 0)::text AS q
      FROM arcade_consumption
      WHERE user_id = ${input.userId}::uuid
        AND kind = 'shard'
        AND code = 'arcade_shard'
        AND created_at >= ${since}::timestamptz
    `;

    const used = Number(row?.q ?? "0");
    if (Number.isFinite(used) && used + spend > limits.daily_shard_spend_limit) {
      return {
        ok: false,
        error: "rate_limit_exceeded",
        details: {
          kind: "daily_shard_spend_limit",
          limit: limits.daily_shard_spend_limit,
          used,
          requested: spend,
        },
      };
    }
  }

  return { ok: true };
}

export async function upsertArcadeSafetyLimits(
  sql: ReturnType<typeof getSql>,
  input: {
    userId: string;
    selfExcludedUntil: string | null;
    dailyActionLimit: number | null;
    dailyShardSpendLimit: number | null;
  },
): Promise<ArcadeSafetyLimits> {
  const selfExcludedUntil = input.selfExcludedUntil?.trim() ? input.selfExcludedUntil.trim() : null;
  const dailyActionLimit = typeof input.dailyActionLimit === "number" && Number.isFinite(input.dailyActionLimit)
    ? Math.max(0, Math.floor(input.dailyActionLimit))
    : null;
  const dailyShardSpendLimit = typeof input.dailyShardSpendLimit === "number" && Number.isFinite(input.dailyShardSpendLimit)
    ? Math.max(0, Math.floor(input.dailyShardSpendLimit))
    : null;

  const rows = await sql<
    { self_excluded_until: string | null; daily_action_limit: number | null; daily_shard_spend_limit: number | null }[]
  >`
    INSERT INTO arcade_safety_limits (user_id, self_excluded_until, daily_action_limit, daily_shard_spend_limit, updated_at)
    VALUES (
      ${input.userId}::uuid,
      ${selfExcludedUntil}::timestamptz,
      ${dailyActionLimit},
      ${dailyShardSpendLimit},
      now()
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      self_excluded_until = EXCLUDED.self_excluded_until,
      daily_action_limit = EXCLUDED.daily_action_limit,
      daily_shard_spend_limit = EXCLUDED.daily_shard_spend_limit,
      updated_at = now()
    RETURNING
      self_excluded_until::text AS self_excluded_until,
      daily_action_limit,
      daily_shard_spend_limit
  `;

  const row = rows[0];
  return {
    self_excluded_until: row?.self_excluded_until ?? null,
    daily_action_limit: row?.daily_action_limit ?? null,
    daily_shard_spend_limit: row?.daily_shard_spend_limit ?? null,
  };
}
