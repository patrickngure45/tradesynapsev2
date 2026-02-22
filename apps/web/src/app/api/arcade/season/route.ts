import { apiError } from "@/lib/api/errors";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function nextUtcMondayStart(now: Date): Date {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const day = now.getUTCDay(); // 0=Sun .. 6=Sat

  const startToday = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7;
  const next = new Date(startToday.getTime() + daysUntilMonday * 24 * 3600_000);
  return next;
}

function currentUtcMondayStart(now: Date): Date {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const day = now.getUTCDay();
  const startToday = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  const daysSinceMonday = (day + 6) % 7; // Monday -> 0
  return new Date(startToday.getTime() - daysSinceMonday * 24 * 3600_000);
}

export async function GET(request: Request) {
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const now = new Date();
  const seasonStart = currentUtcMondayStart(now);
  const nextShift = nextUtcMondayStart(now);
  const seasonKey = `week:${seasonStart.toISOString().slice(0, 10)}`;

  return Response.json(
    {
      ok: true,
      season: {
        key: seasonKey,
        starts_at: seasonStart.toISOString(),
        next_shift_at: nextShift.toISOString(),
        rules: [
          "Seasons shift weekly at 00:00 UTC on Monday.",
          "Some premium volatility modes can require rare keys (see Gate Key).",
          "Community progress is tracked per-week; each user can claim once when unlocked.",
        ],
      },
    },
    { status: 200 },
  );
}
