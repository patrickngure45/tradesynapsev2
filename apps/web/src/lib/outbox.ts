import type { Sql } from "postgres";

export type OutboxTopic =
  | "arcade.action.hint_ready"
  | "arcade.action.ready"
  | "ex.order.placed"
  | "ex.order.canceled"
  | "ex.conditional.evaluate"
  | "ex.withdrawal.requested"
  | "ex.withdrawal.approved"
  | "ex.withdrawal.rejected"
  | "ex.withdrawal.broadcasted"
  | "ex.withdrawal.confirmed"
  | "ex.withdrawal.failed"
  | "trading.bot.execute"
  | "trading.bot.unwind";

export type OutboxEnqueue = {
  topic: OutboxTopic;
  aggregate_type?: string | null;
  aggregate_id?: string | null;
  payload: Record<string, unknown>;
  visible_at?: Date;
};

export type OutboxRow = {
  id: string;
  topic: string;
  aggregate_type: string | null;
  aggregate_id: string | null;
  payload_json: unknown;
  attempts: number;
  last_error: string | null;
  dead_lettered_at?: string | null;
  visible_at: string;
  locked_at: string | null;
  lock_id: string | null;
  created_at: string;
  processed_at: string | null;
};

export async function enqueueOutbox(sql: Sql, ev: OutboxEnqueue): Promise<string> {
  const visibleAt = ev.visible_at ?? new Date();
  const payloadText = JSON.stringify(ev.payload ?? {});

  const rows = await sql<{ id: string }[]>`
    INSERT INTO app_outbox_event (topic, aggregate_type, aggregate_id, payload_json, visible_at)
    VALUES (
      ${ev.topic},
      ${ev.aggregate_type ?? null},
      ${ev.aggregate_id ?? null},
      (
        CASE
          WHEN jsonb_typeof(((${payloadText}::jsonb #>> '{}')::jsonb)) = 'object'
            THEN ((${payloadText}::jsonb #>> '{}')::jsonb)
          ELSE jsonb_build_object('value', ((${payloadText}::jsonb #>> '{}')::jsonb))
        END
      ),
      ${visibleAt}
    )
    RETURNING id
  `;

  return rows[0]!.id;
}

export async function claimOutboxBatch(
  sql: Sql,
  opts: {
    limit: number;
    lockId: string;
    lockTtlSeconds?: number;
    topics?: string[];
  }
): Promise<OutboxRow[]> {
  const limit = Math.max(1, Math.min(500, Math.floor(opts.limit)));
  const lockTtlSeconds = Math.max(5, Math.min(600, Math.floor(opts.lockTtlSeconds ?? 30)));
  const topics = opts.topics?.length ? opts.topics : null;

  if (!topics) {
    const rows = await sql<OutboxRow[]>`
      WITH picked AS (
        SELECT id
        FROM app_outbox_event
        WHERE processed_at IS NULL
          AND dead_lettered_at IS NULL
          AND visible_at <= now()
          AND (
            locked_at IS NULL
            OR locked_at < (now() - make_interval(secs => ${lockTtlSeconds}))
          )
        ORDER BY visible_at ASC, created_at ASC, id ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE app_outbox_event o
      SET locked_at = now(), lock_id = ${opts.lockId}::uuid
      FROM picked
      WHERE o.id = picked.id
      RETURNING
        o.id,
        o.topic,
        o.aggregate_type,
        o.aggregate_id,
        o.payload_json,
        o.attempts,
        o.last_error,
        o.visible_at,
        o.locked_at,
        o.lock_id,
        o.created_at,
        o.processed_at
    `;
    return rows;
  }

  const rows = await sql<OutboxRow[]>`
    WITH picked AS (
      SELECT id
      FROM app_outbox_event
      WHERE processed_at IS NULL
        AND dead_lettered_at IS NULL
        AND visible_at <= now()
        AND (
          locked_at IS NULL
          OR locked_at < (now() - make_interval(secs => ${lockTtlSeconds}))
        )
        AND topic = ANY(${sql.array(topics)})
      ORDER BY visible_at ASC, created_at ASC, id ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE app_outbox_event o
    SET locked_at = now(), lock_id = ${opts.lockId}::uuid
    FROM picked
    WHERE o.id = picked.id
    RETURNING
      o.id,
      o.topic,
      o.aggregate_type,
      o.aggregate_id,
      o.payload_json,
      o.attempts,
      o.last_error,
      o.visible_at,
      o.locked_at,
      o.lock_id,
      o.created_at,
      o.processed_at
  `;

  return rows;
}

export async function ackOutbox(sql: Sql, opts: { id: string; lockId: string }): Promise<void> {
  await sql`
    UPDATE app_outbox_event
    SET processed_at = now(), locked_at = NULL, lock_id = NULL
    WHERE id = ${opts.id}::uuid
      AND lock_id = ${opts.lockId}::uuid
      AND processed_at IS NULL
  `;
}

export async function failOutbox(
  sql: Sql,
  opts: {
    id: string;
    lockId: string;
    error: unknown;
    nextVisibleAt: Date;
  }
): Promise<void> {
  const msg = stringifyUnknownError(opts.error);
  await sql`
    UPDATE app_outbox_event
    SET
      attempts = attempts + 1,
      last_error = ${msg},
      visible_at = ${opts.nextVisibleAt.toISOString()},
      locked_at = NULL,
      lock_id = NULL
    WHERE id = ${opts.id}::uuid
      AND lock_id = ${opts.lockId}::uuid
      AND processed_at IS NULL
  `;
}

export function stringifyUnknownError(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

// ── Dead-letter support ──────────────────────────────────────────────

/** Move an event to the dead-letter pool after exceeding max attempts. */
export async function deadLetterOutbox(
  sql: Sql,
  opts: { id: string; lockId: string; error: unknown },
): Promise<void> {
  const msg = stringifyUnknownError(opts.error);
  await sql`
    UPDATE app_outbox_event
    SET
      attempts = attempts + 1,
      last_error = ${msg},
      dead_lettered_at = now(),
      locked_at = NULL,
      lock_id = NULL
    WHERE id = ${opts.id}::uuid
      AND lock_id = ${opts.lockId}::uuid
      AND processed_at IS NULL
  `;
}

/** Retry a dead-lettered event by resetting it back to pending. */
export async function retryDeadLetter(sql: Sql, opts: { id: string }): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    UPDATE app_outbox_event
    SET
      dead_lettered_at = NULL,
      locked_at = NULL,
      lock_id = NULL,
      visible_at = now(),
      attempts = 0,
      last_error = NULL
    WHERE id = ${opts.id}::uuid
      AND dead_lettered_at IS NOT NULL
      AND processed_at IS NULL
    RETURNING id
  `;
  return rows.length > 0;
}

/** List dead-lettered events for admin review (most recent first). */
export async function listDeadLetters(
  sql: Sql,
  opts?: { limit?: number; offset?: number; topic?: string },
): Promise<OutboxRow[]> {
  const limit = Math.max(1, Math.min(200, Math.floor(opts?.limit ?? 50)));
  const offset = Math.max(0, Math.floor(opts?.offset ?? 0));
  const topic = opts?.topic ?? null;

  if (topic) {
    return sql<OutboxRow[]>`
      SELECT
        id, topic, aggregate_type, aggregate_id, payload_json,
        attempts, last_error, dead_lettered_at, visible_at, locked_at, lock_id,
        created_at, processed_at
      FROM app_outbox_event
      WHERE dead_lettered_at IS NOT NULL
        AND processed_at IS NULL
        AND topic = ${topic}
      ORDER BY dead_lettered_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  return sql<OutboxRow[]>`
    SELECT
      id, topic, aggregate_type, aggregate_id, payload_json,
      attempts, last_error, dead_lettered_at, visible_at, locked_at, lock_id,
      created_at, processed_at
    FROM app_outbox_event
    WHERE dead_lettered_at IS NOT NULL
      AND processed_at IS NULL
    ORDER BY dead_lettered_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

/** Count dead-lettered events (for pagination). */
export async function countDeadLetters(
  sql: Sql,
  opts?: { topic?: string },
): Promise<number> {
  const topic = opts?.topic ?? null;
  const rows = topic
    ? await sql<{ total: number }[]>`
        SELECT count(*)::int AS total FROM app_outbox_event
        WHERE dead_lettered_at IS NOT NULL
          AND processed_at IS NULL
          AND topic = ${topic}
      `
    : await sql<{ total: number }[]>`
        SELECT count(*)::int AS total FROM app_outbox_event
        WHERE dead_lettered_at IS NOT NULL
          AND processed_at IS NULL
      `;
  return rows[0]?.total ?? 0;
}

/** Mark a dead-lettered event as resolved (suppressed) without retrying. */
export async function resolveDeadLetter(sql: Sql, opts: { id: string }): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    UPDATE app_outbox_event
    SET
      processed_at = now(),
      locked_at = NULL,
      lock_id = NULL
    WHERE id = ${opts.id}::uuid
      AND dead_lettered_at IS NOT NULL
      AND processed_at IS NULL
    RETURNING id
  `;
  return rows.length > 0;
}

/** Fetch a single dead-lettered event (for export/details). */
export async function getDeadLetterById(sql: Sql, opts: { id: string }): Promise<OutboxRow | null> {
  const rows = await sql<OutboxRow[]>`
    SELECT
      id, topic, aggregate_type, aggregate_id, payload_json,
      attempts, last_error, dead_lettered_at, visible_at, locked_at, lock_id,
      created_at, processed_at
    FROM app_outbox_event
    WHERE id = ${opts.id}::uuid
      AND dead_lettered_at IS NOT NULL
    LIMIT 1
  `;
  return rows[0] ?? null;
}
