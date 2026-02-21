import type { Sql } from "postgres";

export type JobLockKey = string;

export async function tryAcquireJobLock(
  sql: Sql,
  params: {
    key: JobLockKey;
    holderId: string;
    ttlMs: number;
  },
): Promise<{ acquired: true; held_until: string } | { acquired: false; held_until: string | null; holder_id: string | null }> {
  const key = String(params.key).trim();
  const holderId = String(params.holderId).trim();
  const ttlMs = Math.max(1_000, Math.min(60 * 60_000, Math.trunc(params.ttlMs)));

  const ttlSec = Math.max(1, Math.trunc(ttlMs / 1000));

  const rows = await sql<{ held_until: string }[]>`
    INSERT INTO ex_job_lock (key, holder_id, held_until, updated_at)
    VALUES (${key}, ${holderId}, now() + make_interval(secs => ${ttlSec}), now())
    ON CONFLICT (key)
    DO UPDATE SET
      holder_id = EXCLUDED.holder_id,
      held_until = EXCLUDED.held_until,
      updated_at = now()
    WHERE ex_job_lock.held_until < now()
       OR ex_job_lock.holder_id = EXCLUDED.holder_id
    RETURNING held_until::text AS held_until
  `;

  if (rows.length > 0) {
    return { acquired: true, held_until: rows[0]!.held_until };
  }

  const [cur] = await sql<{ held_until: string; holder_id: string }[]>`
    SELECT held_until::text AS held_until, holder_id
    FROM ex_job_lock
    WHERE key = ${key}
    LIMIT 1
  `;

  return {
    acquired: false,
    held_until: cur?.held_until ?? null,
    holder_id: cur?.holder_id ?? null,
  };
}

export async function releaseJobLock(
  sql: Sql,
  params: {
    key: JobLockKey;
    holderId: string;
  },
): Promise<void> {
  const key = String(params.key).trim();
  const holderId = String(params.holderId).trim();

  await sql`
    UPDATE ex_job_lock
    SET held_until = now(), updated_at = now()
    WHERE key = ${key}
      AND holder_id = ${holderId}
  `;
}
