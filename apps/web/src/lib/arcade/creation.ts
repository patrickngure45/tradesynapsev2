import { bytesToU64BigInt, sha256Hex } from "@/lib/uncertainty/hash";

export type VolatilityProfile = "low" | "medium" | "high";

export type CosmeticRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export type CosmeticOutcome = {
  kind: "cosmetic";
  code: string;
  rarity: CosmeticRarity;
  label: string;
  metadata: {
    base_code: string;
    traits: string[];
    origin: "blind_creation" | "mutation" | "fusion";
    parent_codes?: string[];
  };
};

type Weighted<T> = { weight: number; value: T };

const RARITY_TABLE: Record<VolatilityProfile, Array<Weighted<CosmeticRarity>>> = {
  low: [
    { weight: 8450, value: "common" },
    { weight: 1150, value: "uncommon" },
    { weight: 330, value: "rare" },
    { weight: 60, value: "epic" },
    { weight: 10, value: "legendary" },
  ],
  medium: [
    { weight: 7600, value: "common" },
    { weight: 1500, value: "uncommon" },
    { weight: 720, value: "rare" },
    { weight: 150, value: "epic" },
    { weight: 30, value: "legendary" },
  ],
  high: [
    { weight: 6700, value: "common" },
    { weight: 1850, value: "uncommon" },
    { weight: 1050, value: "rare" },
    { weight: 290, value: "epic" },
    { weight: 110, value: "legendary" },
  ],
};

const TEMPLATES: Record<CosmeticRarity, Array<{ base_code: string; label: string }>> = {
  common: [
    { base_code: "forge_spark", label: "Forged Spark" },
    { base_code: "forge_sticker", label: "Forged Sticker" },
    { base_code: "forge_badge", label: "Forged Badge" },
  ],
  uncommon: [
    { base_code: "forge_glow", label: "Forged Glow" },
    { base_code: "forge_frame", label: "Forged Frame" },
  ],
  rare: [
    { base_code: "forge_aura", label: "Forged Aura" },
    { base_code: "forge_title", label: "Forged Title" },
  ],
  epic: [
    { base_code: "forge_comet", label: "Forged Comet" },
    { base_code: "forge_sigil", label: "Forged Sigil" },
  ],
  legendary: [
    { base_code: "forge_crown", label: "Forged Crown" },
    { base_code: "forge_halo", label: "Forged Halo" },
  ],
};

const TRAIT_ADJ = [
  "Prismatic",
  "Cerulean",
  "Ember",
  "Auric",
  "Obsidian",
  "Verdant",
  "Iridescent",
  "Radiant",
  "Silent",
  "Stellar",
];

const TRAIT_NOUN = [
  "Thread",
  "Circuit",
  "Glyph",
  "Echo",
  "Bloom",
  "Vector",
  "Chime",
  "Vow",
  "Rift",
  "Crest",
];

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

function pickFrom<T>(rngU64: bigint, list: T[]): T {
  const idx = Number(rngU64 % BigInt(Math.max(1, list.length)));
  return list[idx] ?? list[0]!;
}

function u64FromHash(hashHex: string): bigint {
  return bytesToU64BigInt(Buffer.from(hashHex.slice(0, 16), "hex"));
}

function nextRarityUp(r: CosmeticRarity): CosmeticRarity {
  switch (r) {
    case "common":
      return "uncommon";
    case "uncommon":
      return "rare";
    case "rare":
      return "epic";
    case "epic":
      return "legendary";
    default:
      return "legendary";
  }
}

function normalizeRarity(r: string): CosmeticRarity {
  const x = String(r ?? "").toLowerCase();
  if (x === "common" || x === "uncommon" || x === "rare" || x === "epic" || x === "legendary") return x;
  return "common";
}

export function resolveBlindCreation(params: {
  actionId: string;
  userId: string;
  module: string;
  profile: VolatilityProfile;
  serverSeedB64: string;
  clientSeed: string;
  clientCommitHash: string;
}): {
  outcome: CosmeticOutcome;
  audit: { random_hash: string; rarity_roll: number; rarity_total: number; template_roll: number; template_total: number };
} {
  const rarityHash = sha256Hex(
    `${params.serverSeedB64}:${params.clientSeed}:${params.actionId}:${params.userId}:${params.module}:${params.profile}:${params.clientCommitHash}:rarity`,
  );
  const rarityRng = u64FromHash(rarityHash);
  const rarityPick = pickWeighted(rarityRng, RARITY_TABLE[params.profile] ?? RARITY_TABLE.low);
  const rarity = rarityPick.picked;

  const templateHash = sha256Hex(`${rarityHash}:template:${rarity}`);
  const templateRng = u64FromHash(templateHash);
  const templateList = TEMPLATES[rarity] ?? TEMPLATES.common;
  const tIdx = Number(templateRng % BigInt(templateList.length));
  const template = templateList[tIdx] ?? templateList[0]!;

  const traitHash = sha256Hex(`${templateHash}:traits`);
  const traitRng = u64FromHash(traitHash);
  const adj = pickFrom(traitRng, TRAIT_ADJ);
  const noun = pickFrom(traitRng >> 13n, TRAIT_NOUN);
  const traits = [`${adj} ${noun}`, `${noun} of ${adj}`];

  const nonce = templateHash.slice(0, 10);
  const code = `${template.base_code}:${nonce}`;

  return {
    outcome: {
      kind: "cosmetic",
      code,
      rarity,
      label: template.label,
      metadata: {
        base_code: template.base_code,
        traits,
        origin: "blind_creation",
      },
    },
    audit: {
      random_hash: templateHash,
      rarity_roll: rarityPick.roll,
      rarity_total: rarityPick.total,
      template_roll: tIdx,
      template_total: templateList.length,
    },
  };
}

export function resolveMutation(params: {
  actionId: string;
  userId: string;
  module: string;
  profile: VolatilityProfile;
  serverSeedB64: string;
  clientSeed: string;
  clientCommitHash: string;
  input: { code: string; rarity: string };
}): {
  outcome: CosmeticOutcome;
  audit: { random_hash: string; roll: number; total: number; upgraded: boolean };
} {
  const inRarity = normalizeRarity(params.input.rarity);
  const randomHash = sha256Hex(
    `${params.serverSeedB64}:${params.clientSeed}:${params.actionId}:${params.userId}:${params.module}:${params.profile}:${params.clientCommitHash}:mutate:${params.input.code}:${inRarity}`,
  );

  const rng = u64FromHash(randomHash);
  const roll = Number(rng % 10_000n);

  const upgradeChance = params.profile === "high" ? 2600 : params.profile === "medium" ? 1800 : 1200;
  const upgraded = inRarity !== "legendary" && roll < upgradeChance;
  const outRarity: CosmeticRarity = upgraded ? nextRarityUp(inRarity) : inRarity;

  const templateHash = sha256Hex(`${randomHash}:template:${outRarity}`);
  const templateRng = u64FromHash(templateHash);
  const templateList = TEMPLATES[outRarity] ?? TEMPLATES.common;
  const template = pickFrom(templateRng, templateList);

  const traitHash = sha256Hex(`${templateHash}:traits`);
  const traitRng = u64FromHash(traitHash);
  const adj = pickFrom(traitRng, TRAIT_ADJ);
  const noun = pickFrom(traitRng >> 9n, TRAIT_NOUN);
  const traits = [`${adj} ${noun}`, `${adj} ${noun} (mutated)`];

  const nonce = templateHash.slice(0, 10);
  const code = `${template.base_code}:mut:${nonce}`;

  return {
    outcome: {
      kind: "cosmetic",
      code,
      rarity: outRarity,
      label: template.label,
      metadata: {
        base_code: template.base_code,
        traits,
        origin: "mutation",
        parent_codes: [params.input.code],
      },
    },
    audit: {
      random_hash: templateHash,
      roll,
      total: 10_000,
      upgraded,
    },
  };
}

export function resolveFusion(params: {
  actionId: string;
  userId: string;
  module: string;
  profile: VolatilityProfile;
  serverSeedB64: string;
  clientSeed: string;
  clientCommitHash: string;
  input: { code_a: string; rarity_a: string; code_b: string; rarity_b: string };
}): {
  outcome: CosmeticOutcome;
  audit: { random_hash: string; roll: number; total: number; upgraded: boolean };
} {
  const ra = normalizeRarity(params.input.rarity_a);
  const rb = normalizeRarity(params.input.rarity_b);

  const randomHash = sha256Hex(
    `${params.serverSeedB64}:${params.clientSeed}:${params.actionId}:${params.userId}:${params.module}:${params.profile}:${params.clientCommitHash}:fusion:${params.input.code_a}:${ra}:${params.input.code_b}:${rb}`,
  );

  const rng = u64FromHash(randomHash);
  const roll = Number(rng % 10_000n);

  const base: CosmeticRarity =
    ra === "legendary" || rb === "legendary"
      ? "legendary"
      : ra === "epic" || rb === "epic"
        ? "epic"
        : ra === "rare" || rb === "rare"
          ? "rare"
          : ra === "uncommon" || rb === "uncommon"
            ? "uncommon"
            : "common";

  const same = ra === rb;
  const upgradeChance = same
    ? params.profile === "high"
      ? 3500
      : params.profile === "medium"
        ? 2500
        : 1500
    : params.profile === "high"
      ? 1500
      : params.profile === "medium"
        ? 1000
        : 500;

  const upgraded = base !== "legendary" && roll < upgradeChance;
  const outRarity: CosmeticRarity = upgraded ? nextRarityUp(base) : base;

  const templateHash = sha256Hex(`${randomHash}:template:${outRarity}`);
  const templateRng = u64FromHash(templateHash);

  const fusionTemplates: Array<{ base_code: string; label: string }> = [
    { base_code: "fusion_emblem", label: "Fusion Emblem" },
    { base_code: "fusion_knot", label: "Fusion Knot" },
    { base_code: "fusion_seal", label: "Fusion Seal" },
  ];
  const template = pickFrom(templateRng, fusionTemplates);

  const traitHash = sha256Hex(`${templateHash}:traits`);
  const traitRng = u64FromHash(traitHash);
  const adj = pickFrom(traitRng, TRAIT_ADJ);
  const noun = pickFrom(traitRng >> 11n, TRAIT_NOUN);
  const traits = [`${adj} ${noun}`, `Bound ${noun}`];

  const nonce = templateHash.slice(0, 10);
  const code = `${template.base_code}:fus:${nonce}`;

  return {
    outcome: {
      kind: "cosmetic",
      code,
      rarity: outRarity,
      label: template.label,
      metadata: {
        base_code: template.base_code,
        traits,
        origin: "fusion",
        parent_codes: [params.input.code_a, params.input.code_b],
      },
    },
    audit: {
      random_hash: templateHash,
      roll,
      total: 10_000,
      upgraded,
    },
  };
}
