import { bytesToU64BigInt, sha256Hex } from "@/lib/uncertainty/hash";

export type VolatilityProfile = "low" | "medium" | "high";

type Weighted<T> = { weight: number; value: T };

export type SharedPoolItem = {
  kind: "badge" | "cosmetic" | "key";
  code: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  label: string;
};

export type SharedPoolOutcome = {
  baseline: SharedPoolItem;
  boost: SharedPoolItem | null;
};

const BASELINE: SharedPoolItem = {
  kind: "badge",
  code: "shared_pool_member",
  rarity: "common",
  label: "Pool Member",
};

const BOOST_TABLE: Record<VolatilityProfile, Array<Weighted<"none" | "rare_cosmetic" | "epic_cosmetic" | "gate_key">>> = {
  low: [
    { weight: 9200, value: "none" },
    { weight: 700, value: "rare_cosmetic" },
    { weight: 90, value: "epic_cosmetic" },
    { weight: 10, value: "gate_key" },
  ],
  medium: [
    { weight: 8800, value: "none" },
    { weight: 950, value: "rare_cosmetic" },
    { weight: 220, value: "epic_cosmetic" },
    { weight: 30, value: "gate_key" },
  ],
  high: [
    { weight: 8300, value: "none" },
    { weight: 1200, value: "rare_cosmetic" },
    { weight: 420, value: "epic_cosmetic" },
    { weight: 80, value: "gate_key" },
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

function boostItemFor(kind: "none" | "rare_cosmetic" | "epic_cosmetic" | "gate_key"): SharedPoolItem | null {
  switch (kind) {
    case "none":
      return null;
    case "rare_cosmetic":
      return { kind: "cosmetic", code: "shared_pool_glow", rarity: "rare", label: "Pool Glow" };
    case "epic_cosmetic":
      return { kind: "cosmetic", code: "shared_pool_comet", rarity: "epic", label: "Pool Comet" };
    case "gate_key":
      return { kind: "key", code: "gate_key", rarity: "legendary", label: "Gate Key" };
  }
}

export function resolveSharedPool(params: {
  actionId: string;
  userId: string;
  module: string;
  profile: VolatilityProfile;
  serverSeedB64: string;
  clientSeed: string;
  clientCommitHash: string;
  weekStartIso: string;
}): {
  outcome: SharedPoolOutcome;
  audit: { random_hash: string; roll: number; total: number; boost_kind: string };
} {
  const hash = sha256Hex(
    `${params.serverSeedB64}:${params.clientSeed}:${params.actionId}:${params.userId}:${params.module}:${params.profile}:${params.clientCommitHash}:week=${params.weekStartIso}:boost`,
  );
  const rng = bytesToU64BigInt(Buffer.from(hash.slice(0, 16), "hex"));
  const pick = pickWeighted(rng, BOOST_TABLE[params.profile] ?? BOOST_TABLE.low);
  const boost = boostItemFor(pick.picked);

  return {
    outcome: {
      baseline: BASELINE,
      boost,
    },
    audit: {
      random_hash: hash,
      roll: pick.roll,
      total: pick.total,
      boost_kind: String(pick.picked),
    },
  };
}
