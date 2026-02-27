import { bytesToU64BigInt, sha256Hex } from "@/lib/uncertainty/hash";

export type VolatilityProfile = "low" | "medium" | "high";

export type StreakProtectorOutcome = {
  kind: "perk";
  code: "streak_protector";
  rarity: "rare";
  label: string;
  quantity: number;
};

type Weighted<T> = { weight: number; value: T };

// Bounded and friendly: always grants 1 protector; higher profiles can grant 2.
const QTY_TABLE: Record<VolatilityProfile, Array<Weighted<number>>> = {
  low: [
    { weight: 980, value: 1 },
    { weight: 20, value: 2 },
  ],
  medium: [
    { weight: 940, value: 1 },
    { weight: 60, value: 2 },
  ],
  high: [
    { weight: 880, value: 1 },
    { weight: 120, value: 2 },
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

export function resolveStreakProtector(params: {
  actionId: string;
  userId: string;
  module: string;
  profile: VolatilityProfile;
  serverSeedB64: string;
  clientSeed: string;
  clientCommitHash: string;
  weekStartIso: string;
}): { outcome: StreakProtectorOutcome; audit: { random_hash: string; roll: number; total: number } } {
  const randomHash = sha256Hex(
    `${params.serverSeedB64}:${params.clientSeed}:${params.actionId}:${params.userId}:${params.module}:${params.profile}:${params.clientCommitHash}:${params.weekStartIso}:qty`,
  );
  const rngU64 = bytesToU64BigInt(Buffer.from(randomHash.slice(0, 16), "hex"));
  const picked = pickWeighted(rngU64, QTY_TABLE[params.profile]);

  return {
    outcome: {
      kind: "perk",
      code: "streak_protector",
      rarity: "rare",
      label: "Streak Protector",
      quantity: picked.picked,
    },
    audit: { random_hash: randomHash, roll: picked.roll, total: picked.total },
  };
}
