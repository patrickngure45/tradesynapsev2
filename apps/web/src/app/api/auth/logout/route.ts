import { serializeClearSessionCookie } from "@/lib/auth/session";
import { logRouteResponse } from "@/lib/routeLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/logout — clear the session cookie
 */
export async function POST(request: Request) {
  const startMs = Date.now();
  const secure = process.env.NODE_ENV === "production";
  const response = new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": serializeClearSessionCookie({ secure }),
    },
  });
  logRouteResponse(request, response, { startMs });
  return response;
}
