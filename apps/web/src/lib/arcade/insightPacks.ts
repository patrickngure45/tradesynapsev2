import { bytesToU64BigInt, sha256Hex } from "@/lib/uncertainty/hash";

export type VolatilityProfile = "low" | "medium" | "high";

export type InsightRarity = "common" | "rare" | "epic" | "legendary";

export type InsightOutcome = {
  kind: "insight";
  code: string;
  rarity: InsightRarity;
  label: string;
  metadata: {
    kind: "education" | "checklist" | "playbook" | "template";
    text: string;
    content_md?: string;
    disclaimer: string;
    topic: string;
    tags?: string[];
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

const CHECKLISTS: Array<{ topic: string; title: string; bullets: string[]; tags: string[] }> = [
  {
    topic: "token_safety",
    title: "Token Verification Checklist",
    bullets: [
      "Verify contract address from multiple independent sources.",
      "Check contract is verified on explorer and read key functions.",
      "Review liquidity depth and whether liquidity is locked (if applicable).",
      "Confirm transfer restrictions / taxes are disclosed and bounded.",
      "Avoid copycat tickers: compare full address, not name/symbol.",
    ],
    tags: ["safety", "tokens", "verification"],
  },
  {
    topic: "p2p",
    title: "P2P Trade Safety Checklist",
    bullets: [
      "Keep all communication inside the platform chat.",
      "Capture payment proof and timestamps (screenshots/receipts).",
      "Never accept pressure to move to external rails.",
      "If something feels off: pause and open a dispute early.",
      "Double-check amounts and names before releasing escrow.",
    ],
    tags: ["p2p", "safety"],
  },
  {
    topic: "execution",
    title: "Execution Discipline Checklist",
    bullets: [
      "Prefer limit orders when spread is wide.",
      "Split larger orders (TWAP/ladder) to reduce footprint.",
      "Set invalidation levels before entry (not after).",
      "Avoid chasing: if price runs, reassess instead of FOMO.",
      "Track fees and slippage; they compound over time.",
    ],
    tags: ["execution", "discipline"],
  },
];

const PLAYBOOKS: Array<{ topic: string; title: string; md: string; tags: string[] }> = [
  {
    topic: "risk",
    title: "Risk Playbook: Survive Volatility",
    md: [
      "### Risk Playbook",
      "- Size so a worst-case day is survivable.",
      "- Reduce correlation: avoid stacking similar bets.",
      "- Predefine exits: invalidation > hope.",
      "- Use holds/limits to avoid emotional overtrading.",
      "",
      "### Red flags",
      "- You can't explain why you're in the trade.",
      "- You're averaging down without a plan.",
      "- You're ignoring fees/slippage.",
    ].join("\n"),
    tags: ["risk", "volatility"],
  },
  {
    topic: "liquidity",
    title: "Liquidity Playbook: Read the Book",
    md: [
      "### Liquidity Playbook",
      "- Wide spread + thin depth = slippage risk.",
      "- Watch round numbers for spoofing/icebergs.",
      "- If depth vanishes, switch to smaller slices.",
      "",
      "### Practical moves",
      "- Use limit orders near mid when possible.",
      "- Avoid market orders during sudden depth drops.",
    ].join("\n"),
    tags: ["liquidity", "execution"],
  },
];

const TEMPLATES: Array<{ topic: string; title: string; md: string; tags: string[] }> = [
  {
    topic: "analysis",
    title: "Reusable Trade Review Template",
    md: [
      "## Trade Review (Template)",
      "**Context**: (market regime / news / liquidity)",
      "",
      "**Entry thesis**: (one sentence)",
      "- Evidence: ",
      "- Invalidation: ",
      "",
      "**Execution**:",
      "- Order type (limit/market/TWAP): ",
      "- Size rationale: ",
      "- Fees/slippage observed: ",
      "",
      "**Outcome**:",
      "- What went right:",
      "- What went wrong:",
      "- Next improvement:",
    ].join("\n"),
    tags: ["template", "review", "discipline"],
  },
  {
    topic: "security",
    title: "Security Incident Checklist (Template)",
    md: [
      "## Security Incident Checklist (Template)",
      "- Freeze: stop sending funds; stop screen sharing.",
      "- Verify: confirm addresses and parties via trusted channels.",
      "- Document: screenshots, tx hashes, chat logs.",
      "- Contain: rotate passwords / enable 2FA / revoke sessions.",
      "- Escalate: open dispute/support ticket with evidence.",
    ].join("\n"),
    tags: ["template", "security", "safety"],
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

  const contentHash = sha256Hex(`${topicHash}:content`);
  const contentRng = u64FromHash(contentHash);

  const packKind: InsightOutcome["metadata"]["kind"] =
    rarity === "legendary" ? "template" : rarity === "epic" ? "playbook" : rarity === "rare" ? "checklist" : "education";

  let label = "Insight";
  let text = "";
  let contentMd: string | undefined;
  let tags: string[] | undefined;
  let topic = topicPick.picked.topic;

  if (packKind === "education") {
    const titleHash = sha256Hex(`${contentHash}:title`);
    const titleRng = u64FromHash(titleHash);
    const titlePick = pickFrom(titleRng, topicPick.picked.titles);

    const lineHash = sha256Hex(`${titleHash}:line`);
    const lineRng = u64FromHash(lineHash);
    const linePick = pickFrom(lineRng, topicPick.picked.lines);

    label = titlePick.picked;
    text = `${linePick.picked} (${topicPick.picked.topic})`;
    contentMd = undefined;
    tags = [topicPick.picked.topic];
  } else if (packKind === "checklist") {
    const pick = pickFrom(contentRng, CHECKLISTS);
    label = pick.picked.title;
    topic = pick.picked.topic;
    tags = pick.picked.tags;
    text = `Checklist: ${pick.picked.topic}`;
    contentMd = [
      `## ${pick.picked.title}`,
      ...pick.picked.bullets.map((b) => `- ${b}`),
    ].join("\n");
  } else if (packKind === "playbook") {
    const pick = pickFrom(contentRng, PLAYBOOKS);
    label = pick.picked.title;
    topic = pick.picked.topic;
    tags = pick.picked.tags;
    text = `Playbook: ${pick.picked.topic}`;
    contentMd = pick.picked.md;
  } else {
    const pick = pickFrom(contentRng, TEMPLATES);
    label = pick.picked.title;
    topic = pick.picked.topic;
    tags = pick.picked.tags;
    text = `Template: ${pick.picked.topic}`;
    contentMd = pick.picked.md;
  }

  const nonce = contentHash.slice(0, 10);
  const code = `insight:${topic}:${packKind}:${rarity}:${nonce}`;

  return {
    outcome: {
      kind: "insight",
      code,
      rarity,
      label,
      metadata: {
        kind: packKind,
        text,
        content_md: contentMd,
        disclaimer: DISCLAIMER,
        topic,
        tags,
      },
    },
    audit: {
      random_hash: contentHash,
      rarity_roll: rarityPick.roll,
      rarity_total: rarityPick.total,
      topic_roll: topicPick.idx,
      topic_total: topicPick.total,
    },
  };
}
