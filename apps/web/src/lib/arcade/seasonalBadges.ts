import { bytesToU64BigInt, sha256Hex } from "@/lib/uncertainty/hash";
import { seasonalBadgePoolMetaFor, type SeasonalBadge } from "@/lib/arcade/seasonalBadgesMeta";

export type VolatilityProfile = "low" | "medium" | "high";

type Weighted<T> = { weight: number; value: T };

const RARITY_TABLE: Record<VolatilityProfile, Array<Weighted<SeasonalBadge["rarity"]>>> = {
  low: [
    { weight: 8600, value: "common" },
    { weight: 1200, value: "rare" },
    { weight: 180, value: "epic" },
    { weight: 20, value: "legendary" },
  ],
  medium: [
    { weight: 7800, value: "common" },
    { weight: 1500, value: "rare" },
    { weight: 550, value: "epic" },
    { weight: 150, value: "legendary" },
  ],
  high: [
    { weight: 7000, value: "common" },
    { weight: 1900, value: "rare" },
    { weight: 800, value: "epic" },
    { weight: 300, value: "legendary" },
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

export function resolveSeasonalBadgeDrop(params: {
  actionId: string;
  userId: string;
  module: string;
  profile: VolatilityProfile;
  serverSeedB64: string;
  clientSeed: string;
  clientCommitHash: string;
  seasonKey: string;
}): {
  outcome: SeasonalBadge;
  audit: {
    random_hash: string;
    rarity_roll: number;
    rarity_total: number;
    item_roll: number;
    item_total: number;
  };
} {
  const meta = seasonalBadgePoolMetaFor(params.seasonKey);
  const badges = meta.badges;

  // Step 1: roll rarity.
  const rarityHash = sha256Hex(
    `${params.serverSeedB64}:${params.clientSeed}:${params.actionId}:${params.userId}:${params.module}:${params.profile}:${params.clientCommitHash}:season=${params.seasonKey}:rarity`,
  );
  const rarityRng = bytesToU64BigInt(Buffer.from(rarityHash.slice(0, 16), "hex"));
  const rarityPick = pickWeighted(rarityRng, RARITY_TABLE[params.profile] ?? RARITY_TABLE.low);

  // Step 2: pick an item within that rarity.
  const options = badges.filter((b) => b.rarity === rarityPick.picked);
  const list = options.length ? options : badges;

  const itemHash = sha256Hex(`${rarityHash}:item`);
  const itemRng = bytesToU64BigInt(Buffer.from(itemHash.slice(0, 16), "hex"));
  const idx = Number(itemRng % BigInt(list.length));
  const picked = list[idx] ?? list[0]!;

  return {
    outcome: picked,
    audit: {
      random_hash: itemHash,
      rarity_roll: rarityPick.roll,
      rarity_total: rarityPick.total,
      item_roll: Number(itemRng % 10_000n),
      item_total: 10_000,
    },
  };
}
