import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const putSchema = z.object({
  quiet_enabled: z.boolean(),
  quiet_start_min: z.number().int().min(0).max(1439),
  quiet_end_min: z.number().int().min(0).max(1439),
  tz_offset_min: z.number().int().min(-840).max(840),
  digest_enabled: z.boolean(),
});

const DEFAULTS = {
  quiet_enabled: false,
  quiet_start_min: 22 * 60,
  quiet_end_min: 8 * 60,
  tz_offset_min: 0,
  digest_enabled: true,
} as const;

export async function GET(request: Request) {
  const sql = getSql();

  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("unauthorized", { status: 401 });

  try {
    const activeErr = await retryOnceOnTransientDbError(() => requireActiveUser(sql, actingUserId));
    if (activeErr) return apiError(activeErr);

    const rows = await retryOnceOnTransientDbError(async () => {
      return await sql<
        Array<{
          quiet_enabled: boolean;
          quiet_start_min: number;
          quiet_end_min: number;
          tz_offset_min: number;
          digest_enabled: boolean;
          updated_at: string;
        }>
      >`
        SELECT quiet_enabled, quiet_start_min, quiet_end_min, tz_offset_min, digest_enabled, updated_at::text AS updated_at
        FROM app_notification_schedule
        WHERE user_id = ${actingUserId}::uuid
        LIMIT 1
      `;
    });

    const r = rows[0] ?? null;
    const schedule = {
      quiet_enabled: r?.quiet_enabled ?? DEFAULTS.quiet_enabled,
      quiet_start_min: r?.quiet_start_min ?? DEFAULTS.quiet_start_min,
      quiet_end_min: r?.quiet_end_min ?? DEFAULTS.quiet_end_min,
      tz_offset_min: r?.tz_offset_min ?? DEFAULTS.tz_offset_min,
      digest_enabled: r?.digest_enabled ?? DEFAULTS.digest_enabled,
      updated_at: r?.updated_at ?? null,
    };

    return Response.json({ schedule });
  } catch (e) {
    const resp = responseForDbError("account.notification-schedule.get", e);
    if (resp) return resp;
    throw e;
  }
}

export async function PUT(request: Request) {
  const sql = getSql();

  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("unauthorized", { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_input");
  }

  let input: z.infer<typeof putSchema>;
  try {
    input = putSchema.parse(body);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  try {
    const activeErr = await retryOnceOnTransientDbError(() => requireActiveUser(sql, actingUserId));
    if (activeErr) return apiError(activeErr);

    await retryOnceOnTransientDbError(async () => {
      await sql`
        INSERT INTO app_notification_schedule (
          user_id,
          quiet_enabled,
          quiet_start_min,
          quiet_end_min,
          tz_offset_min,
          digest_enabled,
          updated_at
        )
        VALUES (
          ${actingUserId}::uuid,
          ${input.quiet_enabled},
          ${input.quiet_start_min},
          ${input.quiet_end_min},
          ${input.tz_offset_min},
          ${input.digest_enabled},
          now()
        )
        ON CONFLICT (user_id)
        DO UPDATE SET
          quiet_enabled = EXCLUDED.quiet_enabled,
          quiet_start_min = EXCLUDED.quiet_start_min,
          quiet_end_min = EXCLUDED.quiet_end_min,
          tz_offset_min = EXCLUDED.tz_offset_min,
          digest_enabled = EXCLUDED.digest_enabled,
          updated_at = now()
      `;
    });

    return Response.json({ ok: true });
  } catch (e) {
    const resp = responseForDbError("account.notification-schedule.put", e);
    if (resp) return resp;
    throw e;
  }
}
