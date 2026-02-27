import { apiError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { retryOnceOnTransientDbError, responseForDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const sql = getSql();

  try {
    const result = await retryOnceOnTransientDbError(async () => {
      const [counts] = await sql<
        {
          actions_total: string;
          actions_resolved: string;
          inventory_rows: string;
          inventory_quantity: string;
        }[]
      >`
        SELECT
          (SELECT count(*)::text FROM arcade_action WHERE user_id = ${actingUserId}::uuid) AS actions_total,
          (SELECT count(*)::text FROM arcade_action WHERE user_id = ${actingUserId}::uuid AND status = 'resolved') AS actions_resolved,
          (SELECT count(*)::text FROM arcade_inventory WHERE user_id = ${actingUserId}::uuid) AS inventory_rows,
          (SELECT coalesce(sum(quantity),0)::text FROM arcade_inventory WHERE user_id = ${actingUserId}::uuid) AS inventory_quantity
      `;

      const distAll = await sql<
        {
          rarity: string;
          count: string;
        }[]
      >`
        SELECT
          coalesce((outcome_json->'outcome'->>'rarity'), 'unknown') AS rarity,
          count(*)::text AS count
        FROM arcade_action
        WHERE user_id = ${actingUserId}::uuid
          AND status = 'resolved'
          AND module = 'daily_drop'
        GROUP BY 1
        ORDER BY count(*) DESC
      `;

      const dist7d = await sql<
        {
          day: string;
          rarity: string;
          count: string;
        }[]
      >`
        SELECT
          to_char(date_trunc('day', resolved_at), 'YYYY-MM-DD') AS day,
          coalesce((outcome_json->'outcome'->>'rarity'), 'unknown') AS rarity,
          count(*)::text AS count
        FROM arcade_action
        WHERE user_id = ${actingUserId}::uuid
          AND status = 'resolved'
          AND module = 'daily_drop'
          AND resolved_at >= now() - interval '7 days'
        GROUP BY 1, 2
        ORDER BY day ASC
      `;

      const calAll = await sql<{ rarity: string; count: string }[]>`
        SELECT
          coalesce((outcome_json->'outcome'->>'rarity'), 'unknown') AS rarity,
          count(*)::text AS count
        FROM arcade_action
        WHERE user_id = ${actingUserId}::uuid
          AND status = 'resolved'
          AND module = 'calendar_daily'
        GROUP BY 1
        ORDER BY count(*) DESC
      `;

      const cal7d = await sql<{ day: string; rarity: string; count: string }[]>`
        SELECT
          to_char(date_trunc('day', resolved_at), 'YYYY-MM-DD') AS day,
          coalesce((outcome_json->'outcome'->>'rarity'), 'unknown') AS rarity,
          count(*)::text AS count
        FROM arcade_action
        WHERE user_id = ${actingUserId}::uuid
          AND status = 'resolved'
          AND module = 'calendar_daily'
          AND resolved_at >= now() - interval '7 days'
        GROUP BY 1, 2
        ORDER BY day ASC
      `;

      const vaultAll = await sql<{ rarity: string; count: string }[]>`
        SELECT
          coalesce((outcome_json->'outcome'->>'rarity'), 'unknown') AS rarity,
          count(*)::text AS count
        FROM arcade_action
        WHERE user_id = ${actingUserId}::uuid
          AND status = 'resolved'
          AND module = 'time_vault'
        GROUP BY 1
        ORDER BY count(*) DESC
      `;

      const vault7d = await sql<{ day: string; rarity: string; count: string }[]>`
        SELECT
          to_char(date_trunc('day', resolved_at), 'YYYY-MM-DD') AS day,
          coalesce((outcome_json->'outcome'->>'rarity'), 'unknown') AS rarity,
          count(*)::text AS count
        FROM arcade_action
        WHERE user_id = ${actingUserId}::uuid
          AND status = 'resolved'
          AND module = 'time_vault'
          AND resolved_at >= now() - interval '7 days'
        GROUP BY 1, 2
        ORDER BY day ASC
      `;

      const draftAll = await sql<{ rarity: string; count: string }[]>`
        SELECT
          coalesce((outcome_json->'picked'->>'rarity'), 'unknown') AS rarity,
          count(*)::text AS count
        FROM arcade_action
        WHERE user_id = ${actingUserId}::uuid
          AND status = 'resolved'
          AND module = 'boost_draft'
        GROUP BY 1
        ORDER BY count(*) DESC
      `;

      const draft7d = await sql<{ day: string; rarity: string; count: string }[]>`
        SELECT
          to_char(date_trunc('day', resolved_at), 'YYYY-MM-DD') AS day,
          coalesce((outcome_json->'picked'->>'rarity'), 'unknown') AS rarity,
          count(*)::text AS count
        FROM arcade_action
        WHERE user_id = ${actingUserId}::uuid
          AND status = 'resolved'
          AND module = 'boost_draft'
          AND resolved_at >= now() - interval '7 days'
        GROUP BY 1, 2
        ORDER BY day ASC
      `;

      const oracleAll = await sql<{ rarity: string; count: string }[]>`
        SELECT
          coalesce((outcome_json->>'tier'), 'unknown') AS rarity,
          count(*)::text AS count
        FROM arcade_action
        WHERE user_id = ${actingUserId}::uuid
          AND status = 'resolved'
          AND module = 'ai_oracle'
        GROUP BY 1
        ORDER BY count(*) DESC
      `;

      const oracle7d = await sql<{ day: string; rarity: string; count: string }[]>`
        SELECT
          to_char(date_trunc('day', resolved_at), 'YYYY-MM-DD') AS day,
          coalesce((outcome_json->>'tier'), 'unknown') AS rarity,
          count(*)::text AS count
        FROM arcade_action
        WHERE user_id = ${actingUserId}::uuid
          AND status = 'resolved'
          AND module = 'ai_oracle'
          AND resolved_at >= now() - interval '7 days'
        GROUP BY 1, 2
        ORDER BY day ASC
      `;

      const boostSpend7d = await sql<{ day: string; code: string; count: string }[]>`
        SELECT
          to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
          code,
          coalesce(sum(quantity), 0)::text AS count
        FROM arcade_consumption
        WHERE user_id = ${actingUserId}::uuid
          AND kind = 'boost'
          AND created_at >= now() - interval '7 days'
        GROUP BY 1, 2
        ORDER BY day ASC
      `;

      const [craft7d] = await sql<
        {
          items_salvaged: string;
          shards_spent: string;
          salvage_events: string;
          craft_events: string;
        }[]
      >`
        SELECT
          coalesce((SELECT sum(quantity) FROM arcade_consumption WHERE user_id = ${actingUserId}::uuid AND context_type = 'crafting_salvage' AND created_at >= now() - interval '7 days'), 0)::text AS items_salvaged,
          coalesce((SELECT sum(quantity) FROM arcade_consumption WHERE user_id = ${actingUserId}::uuid AND context_type = 'crafting_craft' AND kind = 'shard' AND code = 'arcade_shard' AND created_at >= now() - interval '7 days'), 0)::text AS shards_spent,
          coalesce((SELECT count(*) FROM arcade_consumption WHERE user_id = ${actingUserId}::uuid AND context_type = 'crafting_salvage' AND created_at >= now() - interval '7 days'), 0)::text AS salvage_events,
          coalesce((SELECT count(*) FROM arcade_consumption WHERE user_id = ${actingUserId}::uuid AND context_type = 'crafting_craft' AND created_at >= now() - interval '7 days'), 0)::text AS craft_events
      `;

      const latency7d = await sql<
        {
          module: string;
          n: string;
          p50_s: string | null;
          p95_s: string | null;
          avg_s: string | null;
        }[]
      >`
        SELECT
          module,
          count(*)::text AS n,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch from (resolved_at - requested_at)))::text AS p50_s,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch from (resolved_at - requested_at)))::text AS p95_s,
          avg(extract(epoch from (resolved_at - requested_at)))::text AS avg_s
        FROM arcade_action
        WHERE user_id = ${actingUserId}::uuid
          AND status = 'resolved'
          AND resolved_at >= now() - interval '7 days'
        GROUP BY 1
        ORDER BY module ASC
      `;

      const overdue = await sql<{ module: string; count: string }[]>`
        SELECT
          module,
          count(*)::text AS count
        FROM arcade_action
        WHERE user_id = ${actingUserId}::uuid
          AND status IN ('committed', 'scheduled')
          AND resolves_at IS NOT NULL
          AND resolves_at < now()
        GROUP BY 1
        ORDER BY count(*) DESC
      `;

      return {
        counts: {
          actions_total: Number(counts?.actions_total ?? "0"),
          actions_resolved: Number(counts?.actions_resolved ?? "0"),
          inventory_rows: Number(counts?.inventory_rows ?? "0"),
          inventory_quantity: Number(counts?.inventory_quantity ?? "0"),
        },
        daily_drop: {
          distribution_all_time: distAll.map((r) => ({ rarity: r.rarity, count: Number(r.count ?? "0") })),
          distribution_7d: dist7d.map((r) => ({ day: r.day, rarity: r.rarity, count: Number(r.count ?? "0") })),
        },
        calendar_daily: {
          distribution_all_time: calAll.map((r) => ({ rarity: r.rarity, count: Number(r.count ?? "0") })),
          distribution_7d: cal7d.map((r) => ({ day: r.day, rarity: r.rarity, count: Number(r.count ?? "0") })),
        },
        time_vault: {
          distribution_all_time: vaultAll.map((r) => ({ rarity: r.rarity, count: Number(r.count ?? "0") })),
          distribution_7d: vault7d.map((r) => ({ day: r.day, rarity: r.rarity, count: Number(r.count ?? "0") })),
        },
        boost_draft: {
          distribution_all_time: draftAll.map((r) => ({ rarity: r.rarity, count: Number(r.count ?? "0") })),
          distribution_7d: draft7d.map((r) => ({ day: r.day, rarity: r.rarity, count: Number(r.count ?? "0") })),
        },
        ai_oracle: {
          distribution_all_time: oracleAll.map((r) => ({ rarity: r.rarity, count: Number(r.count ?? "0") })),
          distribution_7d: oracle7d.map((r) => ({ day: r.day, rarity: r.rarity, count: Number(r.count ?? "0") })),
        },
        latency_7d: latency7d.map((r) => ({
          module: r.module,
          n: Number(r.n ?? "0"),
          p50_s: Number(r.p50_s ?? "0"),
          p95_s: Number(r.p95_s ?? "0"),
          avg_s: Number(r.avg_s ?? "0"),
        })),
        overdue: overdue.map((r) => ({ module: r.module, count: Number(r.count ?? "0") })),
        boost_consumption_7d: boostSpend7d.map((r) => ({ day: r.day, code: r.code, count: Number(r.count ?? "0") })),
        crafting_7d: {
          items_salvaged: Number(craft7d?.items_salvaged ?? "0"),
          shards_spent: Number(craft7d?.shards_spent ?? "0"),
          salvage_events: Number(craft7d?.salvage_events ?? "0"),
          craft_events: Number(craft7d?.craft_events ?? "0"),
        },
      };
    });

    return Response.json({ ok: true, ...result }, { status: 200 });
  } catch (e) {
    const dep = responseForDbError("arcade_transparency", e);
    if (dep) return dep;
    return apiError("internal_error");
  }
}
