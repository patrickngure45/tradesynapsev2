import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { listNotifications, countUnread, markRead, markAllRead } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/notifications — list notifications for the acting user
 * Query params: unread_only=1, limit=50
 */
export async function GET(request: Request) {
  const sql = getSql();

  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return apiError(activeErr);

    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get("unread_only") === "1";
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") ?? "50") || 50));

    const [notifications, unreadCount] = await retryOnceOnTransientDbError(async () => {
      return await Promise.all([
        listNotifications(sql, { userId: actingUserId, limit, unreadOnly }),
        countUnread(sql, actingUserId),
      ]);
    });

    return Response.json({ notifications, unread_count: unreadCount });
  } catch (e) {
    const resp = responseForDbError("notifications.list", e);
    if (resp) return resp;
    throw e;
  }
}

/**
 * POST /api/notifications — mark notifications as read
 * Body: { ids: string[] } or { mark_all_read: true }
 */
export async function POST(request: Request) {
  const sql = getSql();

  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return apiError(activeErr);

    const body = await request.json().catch(() => ({}));

    if (body.mark_all_read === true) {
      const count = await markAllRead(sql, actingUserId);
      return Response.json({ marked_read: count });
    }

    const parsed = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }).safeParse(body);
    if (!parsed.success) return apiError("invalid_input");

    const count = await markRead(sql, { userId: actingUserId, ids: parsed.data.ids });
    return Response.json({ marked_read: count });
  } catch (e) {
    const resp = responseForDbError("notifications.mark-read", e);
    if (resp) return resp;
    throw e;
  }
}
