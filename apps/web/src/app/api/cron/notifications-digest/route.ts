import { apiError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { upsertServiceHeartbeat } from "@/lib/system/heartbeat";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cronAuthed(request: Request): boolean {
  const expected = String(process.env.CRON_SECRET ?? "").trim();
  if (!expected) return false;
  const provided = String(request.headers.get("x-cron-secret") ?? "").trim();
  return !!provided && provided === expected;
}

function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(String(v ?? ""));
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  return Math.max(lo, Math.min(hi, i));
}

function isInQuietHours(schedule: {
  quiet_enabled: boolean;
  quiet_start_min: number;
  quiet_end_min: number;
  tz_offset_min: number;
}): boolean {
  if (!schedule.quiet_enabled) return false;

  const offsetMin = clampInt(schedule.tz_offset_min, -840, 840, 0);
  const localMs = Date.now() + offsetMin * 60_000;
  const local = new Date(localMs);
  const localMin = local.getUTCHours() * 60 + local.getUTCMinutes();

  const start = clampInt(schedule.quiet_start_min, 0, 1439, 1320);
  const end = clampInt(schedule.quiet_end_min, 0, 1439, 480);
  if (start === end) return true;
  if (start < end) return localMin >= start && localMin < end;
  return localMin >= start || localMin < end;
}

export async function POST(request: Request) {
  if (!cronAuthed(request)) return apiError("unauthorized", { status: 401 });
  const sql = getSql();
  const startMs = Date.now();

  try {
    const result = await retryOnceOnTransientDbError(async () => {
      // Ensure only one digest worker runs at a time.
      await sql`SELECT pg_advisory_lock(hashtext('cron:notifications-digest'))`;
      try {
        // Scan schedules; only flush users who are currently OUTSIDE quiet hours.
        const schedules = await sql<
          Array<{
            user_id: string;
            quiet_enabled: boolean;
            quiet_start_min: number;
            quiet_end_min: number;
            tz_offset_min: number;
            digest_enabled: boolean;
          }>
        >`
          SELECT user_id::text AS user_id, quiet_enabled, quiet_start_min, quiet_end_min, tz_offset_min, digest_enabled
          FROM app_notification_schedule
          WHERE quiet_enabled = true AND digest_enabled = true
          ORDER BY updated_at DESC
          LIMIT 500
        `;

        let usersConsidered = 0;
        let usersFlushed = 0;
        let totalDeferred = 0;

        for (const s of schedules) {
          usersConsidered += 1;
          if (isInQuietHours(s)) continue;

          const deferred = await sql<
            Array<{ type: string; title: string; body: string; metadata_json: unknown; created_at: string }>
          >`
            SELECT type, title, body, metadata_json, created_at::text AS created_at
            FROM ex_notification_deferred
            WHERE user_id = ${s.user_id}::uuid
            ORDER BY created_at ASC
            LIMIT 200
          `;

          if (deferred.length === 0) continue;

          totalDeferred += deferred.length;

          const counts: Record<string, number> = {};
          for (const d of deferred) counts[d.type] = (counts[d.type] ?? 0) + 1;

          const top = Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([t, c]) => `${t}:${c}`)
            .join(", ");

          const body = `You received ${deferred.length} notifications during quiet hours. (${top})`;
          await createNotification(sql as any, {
            userId: s.user_id,
            type: "system",
            title: "Digest",
            body,
            metadata: {
              kind: "digest",
              count: deferred.length,
              counts,
              href: "/notifications",
            },
          });

          await sql`
            DELETE FROM ex_notification_deferred
            WHERE user_id = ${s.user_id}::uuid
          `;

          usersFlushed += 1;
        }

        return { usersConsidered, usersFlushed, totalDeferred };
      } finally {
        await sql`SELECT pg_advisory_unlock(hashtext('cron:notifications-digest'))`;
      }
    });

    await upsertServiceHeartbeat(sql as any, {
      service: "cron:notifications-digest",
      status: "ok",
      details: { ...result, duration_ms: Date.now() - startMs },
    });

    return Response.json({ ok: true, ...result });
  } catch (e) {
    await upsertServiceHeartbeat(sql as any, {
      service: "cron:notifications-digest",
      status: "error",
      details: { error: e instanceof Error ? e.message : String(e), duration_ms: Date.now() - startMs },
    }).catch(() => void 0);

    const resp = responseForDbError("cron.notifications-digest", e);
    if (resp) return resp;
    throw e;
  }
}
