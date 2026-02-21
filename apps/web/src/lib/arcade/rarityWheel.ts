import { bytesToU64BigInt, sha256Hex } from "@/lib/uncertainty/hash";

export type VolatilityProfile = "low" | "medium" | "high";

export type WheelOutcome = {
  kind: "cosmetic";
  code: string;
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
  label: string;
};

type Weighted<T> = { weight: number; value: T };

const OUTCOMES: Record<WheelOutcome["rarity"], WheelOutcome[]> = {
  common: [
    { kind: "cosmetic", code: "wheel_spark", rarity: "common", label: "Wheel Spark" },
    { kind: "cosmetic", code: "wheel_sticker", rarity: "common", label: "Wheel Sticker" },
  ],
  uncommon: [
    { kind: "cosmetic", code: "wheel_glow", rarity: "uncommon", label: "Wheel Glow" },
    { kind: "cosmetic", code: "wheel_frame", rarity: "uncommon", label: "Wheel Frame" },
  ],
  rare: [
    { kind: "cosmetic", code: "wheel_aura", rarity: "rare", label: "Wheel Aura" },
    { kind: "cosmetic", code: "wheel_title", rarity: "rare", label: "Wheel Title" },
  ],
  epic: [
    { kind: "cosmetic", code: "wheel_comet", rarity: "epic", label: "Wheel Comet" },
  ],
  legendary: [
    { kind: "cosmetic", code: "wheel_crown", rarity: "legendary", label: "Wheel Crown" },
  ],
};

const RARITY_TABLE: Record<VolatilityProfile, Array<Weighted<WheelOutcome["rarity"]>>> = {
  low: [
    { weight: 8700, value: "common" },
    { weight: 1100, value: "uncommon" },
    { weight: 170, value: "rare" },
    { weight: 25, value: "epic" },
    { weight: 5, value: "legendary" },
  ],
  medium: [
    { weight: 7900, value: "common" },
    { weight: 1500, value: "uncommon" },
    { weight: 480, value: "rare" },
    { weight: 95, value: "epic" },
    { weight: 25, value: "legendary" },
  ],
  high: [
    { weight: 7000, value: "common" },
    { weight: 1900, value: "uncommon" },
    { weight: 820, value: "rare" },
    { weight: 210, value: "epic" },
    { weight: 70, value: "legendary" },
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

function outcomeFromRarity(rngU64: bigint, rarity: WheelOutcome["rarity"]): WheelOutcome {
  const list = OUTCOMES[rarity];
  const idx = Number(rngU64 % BigInt(list.length));
  return list[idx] ?? list[0]!;
}

export function resolveRarityWheel(params: {
  actionId: string;
  userId: string;
  module: string;
  profile: VolatilityProfile;
  serverSeedB64: string;
  clientSeed: string;
  clientCommitHash: string;
  pityRare: number;
}): {
  outcome: WheelOutcome;
  audit: { random_hash: string; roll: number; total: number; pity_rare: number; rarity_roll: number; rarity_total: number };
} {
  const pity = Math.max(0, Math.min(50, Math.floor(params.pityRare)));

  // Step 1: roll rarity.
  const rarityHash = sha256Hex(
    `${params.serverSeedB64}:${params.clientSeed}:${params.actionId}:${params.userId}:${params.module}:${params.profile}:${params.clientCommitHash}:rarity:pity=${pity}`,
  );
  const rarityRng = bytesToU64BigInt(Buffer.from(rarityHash.slice(0, 16), "hex"));
  const rarityPick = pickWeighted(rarityRng, RARITY_TABLE[params.profile]);

  // Pity rule: after 10 non-rare spins, guarantee at least "rare".
  // Still bounded: does not force epic/legendary.
  const guaranteedRare = pity >= 10;
  const rarity: WheelOutcome["rarity"] = guaranteedRare
    ? (rarityPick.picked === "common" || rarityPick.picked === "uncommon" ? "rare" : rarityPick.picked)
    : rarityPick.picked;

  // Step 2: pick a concrete cosmetic within rarity.
  const itemHash = sha256Hex(`${rarityHash}:item:${rarity}`);
  const itemRng = bytesToU64BigInt(Buffer.from(itemHash.slice(0, 16), "hex"));
  const outcome = outcomeFromRarity(itemRng, rarity);

  return {
    outcome,
    audit: {
      random_hash: itemHash,
      roll: Number(itemRng % 10_000n),
      total: 10_000,
      pity_rare: pity,
      rarity_roll: rarityPick.roll,
      rarity_total: rarityPick.total,
    },
  };
}
