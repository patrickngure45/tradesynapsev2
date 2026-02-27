import type { getSql } from "@/lib/db";

export async function logArcadeConsumption(
  sql: ReturnType<typeof getSql>,
  input: {
    user_id: string;
    kind: string;
    code: string;
    rarity?: string | null;
    quantity: number;
    context_type: string;
    context_id?: string | null;
    module?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<void> {
  await sql`
    INSERT INTO arcade_consumption (
      user_id,
      kind,
      code,
      rarity,
      quantity,
      context_type,
      context_id,
      module,
      metadata_json
    ) VALUES (
      ${input.user_id}::uuid,
      ${input.kind},
      ${input.code},
      ${input.rarity ?? null},
      ${Math.max(1, Math.floor(Number(input.quantity ?? 1)))},
      ${input.context_type},
      ${input.context_id ?? null},
      ${input.module ?? null},
      ${sql.json((input.metadata ?? {}) as any)}
    )
  `;
}
