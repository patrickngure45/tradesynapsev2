import { NextRequest, NextResponse } from "next/server";

import { getSql } from "@/lib/db";
import { responseForDbError } from "@/lib/dbTransient";
import { requireCronRequestAuth } from "@/lib/auth/cronAuth";
import { upsertServiceHeartbeat } from "@/lib/system/heartbeat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Move due scheduled arcade actions into `ready` state and emit outbox events.
 *
 * This is intentionally lightweight: resolution can still be user-initiated (reveal)
 * but we need a scheduled transition to create tension + notifications.
 */
export async function POST(req: NextRequest) {
  const authErr = requireCronRequestAuth(req);
  if (authErr) {
    const sql = getSql();
    await upsertServiceHeartbeat(sql as any, {
      service: "arcade:resolve-ready",
      status: "error",
      details: { error: authErr },
    }).catch(() => void 0);
    const status = authErr === "cron_unauthorized" ? 401 : 500;
    return NextResponse.json({ error: authErr }, { status });
  }

  const sql = getSql();

  try {
    const result = await sql.begin(async (tx) => {
      const txSql = tx as unknown as typeof sql;

      // 0) Hint stage: scheduled time_vault actions become hint_ready halfway through.
      //    We store hint_at in input_json when created.
      const hinted = await txSql<
        { id: string; user_id: string; module: string }[]
      >`
        UPDATE arcade_action
        SET status = 'hint_ready'
        WHERE status = 'scheduled'
          AND module = 'time_vault'
          AND (input_json ? 'hint_at')
          AND (input_json->>'hint_at')::timestamptz <= now()
        RETURNING id::text AS id, user_id::text AS user_id, module
      `;

      if (hinted.length > 0) {
        await txSql`
          INSERT INTO app_outbox_event (topic, aggregate_type, aggregate_id, payload_json)
          SELECT
            'arcade.action.hint_ready',
            'arcade_action',
            x.id,
            jsonb_build_object('action_id', x.id, 'user_id', x.user_id, 'module', x.module)
          FROM (
            SELECT id::text AS id, user_id::text AS user_id, module
            FROM arcade_action
            WHERE id = ANY(${hinted.map((x) => x.id)}::uuid[])
          ) x
        `;
      }

      // 1) Final stage: due actions become ready.
      const moved = await txSql<
        {
          id: string;
          user_id: string;
          module: string;
        }[]
      >`
        UPDATE arcade_action
        SET status = 'ready'
        WHERE status IN ('scheduled', 'hint_ready')
          AND resolves_at IS NOT NULL
          AND resolves_at <= now()
        RETURNING id::text AS id, user_id::text AS user_id, module
      `;

      if (moved.length === 0) {
        return { hinted: hinted.length, moved: 0 };
      }

      // Emit outbox events for notifications/fan-out.
      // Use a single INSERT..SELECT for efficiency.
      await txSql`
        INSERT INTO app_outbox_event (topic, aggregate_type, aggregate_id, payload_json)
        SELECT
          'arcade.action.ready',
          'arcade_action',
          m.id,
          jsonb_build_object(
            'action_id', m.id,
            'user_id', m.user_id,
            'module', m.module
          )
        FROM (
          SELECT id::text AS id, user_id::text AS user_id, module
          FROM arcade_action
          WHERE id = ANY(${moved.map((x) => x.id)}::uuid[])
        ) m
      `;

      return { hinted: hinted.length, moved: moved.length };
    });

    await upsertServiceHeartbeat(sql as any, {
      service: "arcade:resolve-ready",
      status: "ok",
      details: { hinted: result.hinted, moved: result.moved },
    }).catch(() => void 0);

    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (e) {
    const dep = responseForDbError("arcade_resolve_ready", e);
    if (dep) return dep;

    await upsertServiceHeartbeat(sql as any, {
      service: "arcade:resolve-ready",
      status: "error",
      details: { error: e instanceof Error ? e.message : String(e) },
    }).catch(() => void 0);

    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
