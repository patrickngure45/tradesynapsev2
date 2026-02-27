import { sha256Hex, bytesToU64BigInt } from "@/lib/uncertainty/hash";

export type VolatilityProfile = "low" | "medium" | "high";

export type CalendarDailyOutcome = {
  kind: "badge";
  code: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  label: string;
};

type Weighted<T> = { weight: number; value: T };

const BASE_TABLE: Record<VolatilityProfile, Array<Weighted<CalendarDailyOutcome>>> = {
  low: [
    { weight: 860, value: { kind: "badge", code: "cal_spark", rarity: "common", label: "Calendar Spark" } },
    { weight: 115, value: { kind: "badge", code: "cal_glint", rarity: "rare", label: "Calendar Glint" } },
    { weight: 22, value: { kind: "badge", code: "cal_aura", rarity: "epic", label: "Calendar Aura" } },
    { weight: 3, value: { kind: "badge", code: "cal_crown", rarity: "legendary", label: "Calendar Crown" } },
  ],
  medium: [
    { weight: 780, value: { kind: "badge", code: "cal_spark", rarity: "common", label: "Calendar Spark" } },
    { weight: 160, value: { kind: "badge", code: "cal_glint", rarity: "rare", label: "Calendar Glint" } },
    { weight: 48, value: { kind: "badge", code: "cal_aura", rarity: "epic", label: "Calendar Aura" } },
    { weight: 12, value: { kind: "badge", code: "cal_crown", rarity: "legendary", label: "Calendar Crown" } },
  ],
  high: [
    { weight: 670, value: { kind: "badge", code: "cal_spark", rarity: "common", label: "Calendar Spark" } },
    { weight: 220, value: { kind: "badge", code: "cal_glint", rarity: "rare", label: "Calendar Glint" } },
    { weight: 85, value: { kind: "badge", code: "cal_aura", rarity: "epic", label: "Calendar Aura" } },
    { weight: 25, value: { kind: "badge", code: "cal_crown", rarity: "legendary", label: "Calendar Crown" } },
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

function applyPity(profile: VolatilityProfile, pityRare: number): Array<Weighted<CalendarDailyOutcome>> {
  // Pity gently shifts weight from common → rare (and tiny epic) after long streaks without rare+.
  // This is user-friendly but still bounded and disclosed in Transparency.
  const base = BASE_TABLE[profile].map((x) => ({ ...x, value: { ...x.value } }));

  const pity = Math.max(0, Math.min(30, Math.floor(pityRare)));
  if (pity === 0) return base;

  const common = base.find((x) => x.value.rarity === "common");
  const rare = base.find((x) => x.value.rarity === "rare");
  const epic = base.find((x) => x.value.rarity === "epic");
  if (!common || !rare) return base;

  // Move up to 30 weight from common into rare, and a small slice into epic.
  const shift = Math.min(common.weight - 1, pity);
  common.weight -= shift;
  rare.weight += Math.floor(shift * 0.85);
  if (epic) epic.weight += shift - Math.floor(shift * 0.85);

  return base;
}

export function resolveCalendarDaily(params: {
  actionId: string;
  userId: string;
  module: string;
  profile: VolatilityProfile;
  serverSeedB64: string;
  clientSeed: string;
  clientCommitHash: string;
  claimDateIso: string;
  pityRare: number;
}): { outcome: CalendarDailyOutcome; audit: { random_hash: string; roll: number; total: number; pity_rare: number } } {
  const table = applyPity(params.profile, params.pityRare);

  const randomHash = sha256Hex(
    `${params.serverSeedB64}:${params.clientSeed}:${params.actionId}:${params.userId}:${params.module}:${params.profile}:${params.clientCommitHash}:${params.claimDateIso}:pity=${params.pityRare}`,
  );
  const rngU64 = bytesToU64BigInt(Buffer.from(randomHash.slice(0, 16), "hex"));
  const { picked, roll, total } = pickWeighted(rngU64, table);

  return {
    outcome: picked,
    audit: { random_hash: randomHash, roll, total, pity_rare: params.pityRare },
  };
}
