import { getSql } from "@/lib/db";
import { sha256Hex } from "@/lib/uncertainty/hash";

export type ProgressionState = {
  xp: number;
  tier: number;
  prestige: number;
};

const KEY = "progression";

const TIER_THRESHOLDS = [0, 10, 25, 50, 100, 200, 350, 550, 800] as const;

export function tierForXp(xp: number): number {
  const x = Math.max(0, Math.floor(xp));
  let tier = 0;
  for (let i = 0; i < TIER_THRESHOLDS.length; i++) {
    if (x >= TIER_THRESHOLDS[i]!) tier = i;
  }
  return tier;
}

export function nextTierXp(tier: number): number | null {
  const next = tier + 1;
  return next < TIER_THRESHOLDS.length ? TIER_THRESHOLDS[next]! : null;
}

export function clampProgression(v: any): ProgressionState {
  const xp = Number(v?.xp ?? 0);
  const tier = Number(v?.tier ?? 0);
  const prestige = Number(v?.prestige ?? 0);
  const safeXp = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  const safeTier = Number.isFinite(tier) ? Math.max(0, Math.floor(tier)) : 0;
  const safePrestige = Number.isFinite(prestige) ? Math.max(0, Math.floor(prestige)) : 0;
  return { xp: safeXp, tier: safeTier, prestige: safePrestige };
}

export async function getProgressionState(
  sql: ReturnType<typeof getSql>,
  userId: string,
): Promise<ProgressionState> {
  const rows = await sql<{ value_json: any }[]>`
    SELECT value_json
    FROM arcade_state
    WHERE user_id = ${userId}::uuid
      AND key = ${KEY}
    LIMIT 1
  `;
  return clampProgression(rows[0]?.value_json ?? {});
}

export async function addArcadeXp(
  sql: ReturnType<typeof getSql>,
  input: {
    userId: string;
    deltaXp: number;
    contextRandomHash: string;
    source: string;
    grantCosmetics?: boolean;
  },
): Promise<{ before: ProgressionState; after: ProgressionState; tierUp: boolean; bonusXp: number }> {
  const delta = Math.max(0, Math.floor(Number(input.deltaXp ?? 0)));

  const rows = await sql<{ value_json: any }[]>`
    SELECT value_json
    FROM arcade_state
    WHERE user_id = ${input.userId}::uuid
      AND key = ${KEY}
    LIMIT 1
    FOR UPDATE
  `;

  const before = clampProgression(rows[0]?.value_json ?? {});

  const nextXp = before.xp + delta;
  const computedTier = tierForXp(nextXp);

  let bonusXp = 0;
  let afterTier = computedTier;

  // Bounded probabilistic multiplier at promotion time.
  // If tier increases, grant a small bonus XP (0..5) derived from the existing randomness context.
  if (computedTier > before.tier) {
    const h = sha256Hex(`${input.contextRandomHash}:tier_up:${before.tier}->${computedTier}:${input.source}`);
    const n = parseInt(h.slice(0, 4), 16);
    bonusXp = Number.isFinite(n) ? (n % 6) : 0;
    afterTier = computedTier;
  }

  const after: ProgressionState = {
    xp: nextXp + bonusXp,
    tier: afterTier,
    prestige: before.prestige,
  };

  await sql`
    INSERT INTO arcade_state (user_id, key, value_json, created_at, updated_at)
    VALUES (
      ${input.userId}::uuid,
      ${KEY},
      ${sql.json(after as unknown as any)}::jsonb,
      now(),
      now()
    )
    ON CONFLICT (user_id, key)
    DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = now()
  `;

  const tierUp = after.tier > before.tier;

  if (tierUp && input.grantCosmetics !== false) {
    // Cosmetic badge for new tier.
    await sql`
      INSERT INTO arcade_inventory (user_id, kind, code, rarity, quantity, metadata_json, created_at, updated_at)
      VALUES (
        ${input.userId}::uuid,
        'badge',
        ${`tier_${after.tier}`},
        'common',
        1,
        ${sql.json({ label: `Tier ${after.tier} Badge`, source: "tier_up", tier: after.tier })}::jsonb,
        now(),
        now()
      )
      ON CONFLICT (user_id, kind, code, rarity)
      DO UPDATE SET quantity = arcade_inventory.quantity + 1, updated_at = now()
    `;
  }

  return { before, after, tierUp, bonusXp };
}

export async function prestigeReset(
  sql: ReturnType<typeof getSql>,
  input: { userId: string },
): Promise<{ before: ProgressionState; after: ProgressionState }> {
  const rows = await sql<{ value_json: any }[]>`
    SELECT value_json
    FROM arcade_state
    WHERE user_id = ${input.userId}::uuid
      AND key = ${KEY}
    LIMIT 1
    FOR UPDATE
  `;

  const before = clampProgression(rows[0]?.value_json ?? {});

  // Require some meaningful progress.
  if (before.tier < 3) {
    throw Object.assign(new Error("prestige_not_available"), { code: "prestige_not_available" });
  }

  const after: ProgressionState = {
    xp: 0,
    tier: 0,
    prestige: before.prestige + 1,
  };

  await sql`
    INSERT INTO arcade_state (user_id, key, value_json, created_at, updated_at)
    VALUES (
      ${input.userId}::uuid,
      ${KEY},
      ${sql.json(after as unknown as any)}::jsonb,
      now(),
      now()
    )
    ON CONFLICT (user_id, key)
    DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = now()
  `;

  await sql`
    INSERT INTO arcade_inventory (user_id, kind, code, rarity, quantity, metadata_json, created_at, updated_at)
    VALUES (
      ${input.userId}::uuid,
      'badge',
      ${`prestige_${after.prestige}`},
      'rare',
      1,
      ${sql.json({ label: `Prestige ${after.prestige}`, source: "prestige" })}::jsonb,
      now(),
      now()
    )
    ON CONFLICT (user_id, kind, code, rarity)
    DO UPDATE SET quantity = arcade_inventory.quantity + 1, updated_at = now()
  `;

  return { before, after };
}
