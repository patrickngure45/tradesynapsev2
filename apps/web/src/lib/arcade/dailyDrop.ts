import { sha256Hex, bytesToU64BigInt } from "@/lib/uncertainty/hash";

export type VolatilityProfile = "low" | "medium" | "high";

export type DailyDropOutcome = {
  kind: "badge";
  code: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  label: string;
};

type Weighted<T> = { weight: number; value: T };

const OUTCOMES: Record<VolatilityProfile, Array<Weighted<DailyDropOutcome>>> = {
  low: [
    { weight: 840, value: { kind: "badge", code: "daily_spark", rarity: "common", label: "Daily Spark" } },
    { weight: 130, value: { kind: "badge", code: "daily_glint", rarity: "rare", label: "Daily Glint" } },
    { weight: 28, value: { kind: "badge", code: "daily_aura", rarity: "epic", label: "Daily Aura" } },
    { weight: 2, value: { kind: "badge", code: "daily_crown", rarity: "legendary", label: "Daily Crown" } },
  ],
  medium: [
    { weight: 760, value: { kind: "badge", code: "daily_spark", rarity: "common", label: "Daily Spark" } },
    { weight: 180, value: { kind: "badge", code: "daily_glint", rarity: "rare", label: "Daily Glint" } },
    { weight: 52, value: { kind: "badge", code: "daily_aura", rarity: "epic", label: "Daily Aura" } },
    { weight: 8, value: { kind: "badge", code: "daily_crown", rarity: "legendary", label: "Daily Crown" } },
  ],
  high: [
    { weight: 650, value: { kind: "badge", code: "daily_spark", rarity: "common", label: "Daily Spark" } },
    { weight: 240, value: { kind: "badge", code: "daily_glint", rarity: "rare", label: "Daily Glint" } },
    { weight: 90, value: { kind: "badge", code: "daily_aura", rarity: "epic", label: "Daily Aura" } },
    { weight: 20, value: { kind: "badge", code: "daily_crown", rarity: "legendary", label: "Daily Crown" } },
  ],
};

function pickWeighted<T>(rngU64: bigint, table: Array<Weighted<T>>): { picked: T; roll: number; total: number } {
  const total = table.reduce((acc, x) => acc + x.weight, 0);
  const roll = Number(rngU64 % BigInt(total));
  let cur = 0;
  for (const x of table) {
    cur += x.weight;
    if (roll < cur) return { picked: x.value, roll, total };
  }
  return { picked: table[table.length - 1]!.value, roll, total };
}

export function resolveDailyDrop(params: {
  actionId: string;
  userId: string;
  module: string;
  profile: VolatilityProfile;
  serverSeedB64: string;
  clientSeed: string;
  clientCommitHash: string;
}): {
  outcome: DailyDropOutcome;
  audit: {
    random_hash: string;
    roll: number;
    total: number;
  };
} {
  const profile = params.profile;
  const table = OUTCOMES[profile] ?? OUTCOMES.low;

  // Deterministic randomness from both parties + action.
  const randomHash = sha256Hex(
    `${params.serverSeedB64}:${params.clientSeed}:${params.actionId}:${params.userId}:${params.module}:${profile}:${params.clientCommitHash}`,
  );

  const rngU64 = bytesToU64BigInt(Buffer.from(randomHash.slice(0, 16), "hex"));
  const { picked, roll, total } = pickWeighted(rngU64, table);

  return {
    outcome: picked,
    audit: {
      random_hash: randomHash,
      roll,
      total,
    },
  };
}
