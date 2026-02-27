import { getSql } from "@/lib/db";

export type ArcadeStateRow = {
  user_id: string;
  key: string;
  value_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export async function getArcadeState(
  sql: ReturnType<typeof getSql>,
  input: { userId: string; key: string },
): Promise<Record<string, unknown> | null> {
  const rows = await sql<{ value_json: any }[]>`
    SELECT value_json
    FROM arcade_state
    WHERE user_id = ${input.userId}::uuid
      AND key = ${input.key}
    LIMIT 1
  `;
  if (!rows.length) return null;
  const v = rows[0]?.value_json;
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export async function setArcadeState(
  sql: ReturnType<typeof getSql>,
  input: { userId: string; key: string; value: Record<string, unknown> },
): Promise<void> {
  await sql`
    INSERT INTO arcade_state (user_id, key, value_json, created_at, updated_at)
    VALUES (${input.userId}::uuid, ${input.key}, ${sql.json(input.value as unknown as any)}::jsonb, now(), now())
    ON CONFLICT (user_id, key)
    DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = now()
  `;
}

export async function patchArcadeState(
  sql: ReturnType<typeof getSql>,
  input: { userId: string; key: string; patch: Record<string, unknown> },
): Promise<Record<string, unknown>> {
  const current = (await getArcadeState(sql, { userId: input.userId, key: input.key })) ?? {};
  const next = { ...current, ...input.patch };
  await setArcadeState(sql, { userId: input.userId, key: input.key, value: next });
  return next;
}
