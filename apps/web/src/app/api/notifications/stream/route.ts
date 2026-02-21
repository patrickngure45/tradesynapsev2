import { apiError } from "@/lib/api/errors";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { subscribeToUserNotifications } from "@/lib/realtime/notificationHub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sseFormat(event: string, data: unknown): string {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  // Keep it single-line per SSE rules (split if needed)
  const lines = payload.split(/\r?\n/);
  return `event: ${event}\n${lines.map((l) => `data: ${l}`).join("\n")}\n\n`;
}

export async function GET(request: Request) {
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const encoder = new TextEncoder();

  let unsubscribe: (() => void) | null = null;
  let pingTimer: any = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const sendRaw = (chunk: string) => controller.enqueue(encoder.encode(chunk));

      // Initial handshake
      sendRaw(sseFormat("ready", { ok: true, t: new Date().toISOString() }));

      unsubscribe = subscribeToUserNotifications({
        userId: actingUserId,
        send: (evt) => {
          sendRaw(sseFormat("notification", evt));
        },
      });

      // Keep-alive ping (prevents some proxies from closing idle SSE)
      pingTimer = setInterval(() => {
        try {
          sendRaw(sseFormat("ping", { t: Date.now() }));
        } catch {
          // ignore
        }
      }, 25_000);

      request.signal.addEventListener(
        "abort",
        () => {
          try {
            if (pingTimer) clearInterval(pingTimer);
          } catch {
            // ignore
          }
          try {
            unsubscribe?.();
          } catch {
            // ignore
          }
          controller.close();
        },
        { once: true },
      );
    },
    cancel() {
      try {
        if (pingTimer) clearInterval(pingTimer);
      } catch {
        // ignore
      }
      try {
        unsubscribe?.();
      } catch {
        // ignore
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
