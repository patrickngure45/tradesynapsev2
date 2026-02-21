import type { Sql } from "postgres";

import { createSql } from "@/lib/db";

type NotificationEvent = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  metadata_json: unknown;
  created_at: string;
};

type Subscriber = {
  userId: string;
  send: (event: NotificationEvent) => void;
};

const CHANNEL = "ex_notification";

let started = false;
let sql: Sql | null = null;

const subscribersByUser = new Map<string, Set<Subscriber>>();

function startListener() {
  if (started) return;
  started = true;

  sql = createSql() as unknown as Sql;

  // postgres.js: LISTEN/NOTIFY handler is invoked with (payload) string.
  // Keep it resilient: never throw from the listener.
  (sql as any)
    .listen(CHANNEL, (payload: string) => {
      try {
        const evt = JSON.parse(String(payload || "{}")) as NotificationEvent;
        const userId = String((evt as any).user_id ?? "").trim();
        if (!userId) return;

        const subs = subscribersByUser.get(userId);
        if (!subs || subs.size === 0) return;

        for (const sub of subs) {
          try {
            sub.send(evt);
          } catch {
            // ignore per-subscriber failures
          }
        }
      } catch {
        // ignore malformed payload
      }
    })
    .catch(() => {
      // If listen fails (db unavailable on cold start), allow retries on next subscribe.
      started = false;
      sql = null;
    });
}

export function subscribeToUserNotifications(params: {
  userId: string;
  send: (event: NotificationEvent) => void;
}): () => void {
  startListener();

  const userId = String(params.userId).trim();
  const sub: Subscriber = { userId, send: params.send };

  const set = subscribersByUser.get(userId) ?? new Set<Subscriber>();
  set.add(sub);
  subscribersByUser.set(userId, set);

  return () => {
    const cur = subscribersByUser.get(userId);
    if (!cur) return;
    cur.delete(sub);
    if (cur.size === 0) subscribersByUser.delete(userId);
  };
}
