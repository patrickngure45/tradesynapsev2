import { bytesToU64BigInt, sha256Hex } from "@/lib/uncertainty/hash";

export type VolatilityProfile = "low" | "medium" | "high";

export type InsightRarity = "common" | "rare" | "epic" | "legendary";

export type InsightOutcome = {
  kind: "insight";
  code: string;
  rarity: InsightRarity;
  label: string;
  metadata: {
    text: string;
    disclaimer: string;
    topic: string;
  };
};

type Weighted<T> = { weight: number; value: T };

const RARITY_TABLE: Record<VolatilityProfile, Array<Weighted<InsightRarity>>> = {
  low: [
    { weight: 9300, value: "common" },
    { weight: 650, value: "rare" },
    { weight: 45, value: "epic" },
    { weight: 5, value: "legendary" },
  ],
  medium: [
    { weight: 8800, value: "common" },
    { weight: 1000, value: "rare" },
    { weight: 170, value: "epic" },
    { weight: 30, value: "legendary" },
  ],
  high: [
    { weight: 8000, value: "common" },
    { weight: 1400, value: "rare" },
    { weight: 430, value: "epic" },
    { weight: 170, value: "legendary" },
  ],
};

const DISCLAIMER = "Informational only. Not financial advice. Always verify independently.";

const TOPICS: Array<{ topic: string; titles: string[]; lines: string[] }> = [
  {
    topic: "liquidity",
    titles: ["Liquidity Lens", "Depth Snapshot", "Spread Check"],
    lines: [
      "Tighter spreads usually reflect stronger two-sided interest.",
      "Watch how depth changes near round-number prices.",
      "Sudden thin books can amplify slippage on market orders.",
    ],
  },
  {
    topic: "risk",
    titles: ["Risk Posture", "Volatility Note", "Drawdown Reminder"],
    lines: [
      "Size positions so a bad day is survivable.",
      "Avoid stacking correlated bets when volatility rises.",
      "Define exit conditions before you enter.",
    ],
  },
  {
    topic: "execution",
    titles: ["Execution Tip", "Order Hygiene", "Fee Awareness"],
    lines: [
      "Limit orders can reduce fees and slippage, but may not fill.",
      "Large orders can be split to reduce footprint.",
      "Check fee tiers and routes before executing.",
    ],
  },
  {
    topic: "p2p",
    titles: ["P2P Safety", "Counterparty Check", "Dispute Prep"],
    lines: [
      "Keep chat and payment evidence organized.",
      "Prefer counterparties with consistent history.",
      "Never send funds outside agreed rails.",
    ],
  },
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

function pickFrom<T>(rngU64: bigint, list: T[]): { picked: T; idx: number; total: number } {
  const total = Math.max(1, list.length);
  const idx = Number(rngU64 % BigInt(total));
  return { picked: list[idx] ?? list[0]!, idx, total };
}

function u64FromHash(hashHex: string): bigint {
  return bytesToU64BigInt(Buffer.from(hashHex.slice(0, 16), "hex"));
}

export function resolveInsightPack(params: {
  actionId: string;
  userId: string;
  module: string;
  profile: VolatilityProfile;
  serverSeedB64: string;
  clientSeed: string;
  clientCommitHash: string;
}): {
  outcome: InsightOutcome;
  audit: {
    random_hash: string;
    rarity_roll: number;
    rarity_total: number;
    topic_roll: number;
    topic_total: number;
  };
} {
  const rarityHash = sha256Hex(
    `${params.serverSeedB64}:${params.clientSeed}:${params.actionId}:${params.userId}:${params.module}:${params.profile}:${params.clientCommitHash}:rarity`,
  );
  const rarityRng = u64FromHash(rarityHash);
  const rarityPick = pickWeighted(rarityRng, RARITY_TABLE[params.profile] ?? RARITY_TABLE.low);
  const rarity = rarityPick.picked;

  const topicHash = sha256Hex(`${rarityHash}:topic:${rarity}`);
  const topicRng = u64FromHash(topicHash);
  const topicPick = pickFrom(topicRng, TOPICS);

  const titleHash = sha256Hex(`${topicHash}:title`);
  const titleRng = u64FromHash(titleHash);
  const titlePick = pickFrom(titleRng, topicPick.picked.titles);

  const lineHash = sha256Hex(`${titleHash}:line`);
  const lineRng = u64FromHash(lineHash);
  const linePick = pickFrom(lineRng, topicPick.picked.lines);

  const nonce = lineHash.slice(0, 10);
  const code = `insight:${topicPick.picked.topic}:${rarity}:${nonce}`;

  const text = `${linePick.picked} (${topicPick.picked.topic})`;

  return {
    outcome: {
      kind: "insight",
      code,
      rarity,
      label: titlePick.picked,
      metadata: {
        text,
        disclaimer: DISCLAIMER,
        topic: topicPick.picked.topic,
      },
    },
    audit: {
      random_hash: lineHash,
      rarity_roll: rarityPick.roll,
      rarity_total: rarityPick.total,
      topic_roll: topicPick.idx,
      topic_total: topicPick.total,
    },
  };
}
