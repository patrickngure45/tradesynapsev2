import { sha256Hex, bytesToU64BigInt } from "@/lib/uncertainty/hash";

export type VolatilityProfile = "low" | "medium" | "high";

export type BoostDraftOption = {
  kind: "boost";
  code: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  label: string;
  metadata: {
    duration_hours: number;
    effect:
      | { type: "fee_discount_bps"; value: number }
      | { type: "p2p_highlight_credits"; value: number }
      | { type: "withdrawal_priority_hours"; value: number };
  };
};

type Weighted<T> = { weight: number; value: T };

const BASE: Array<Weighted<BoostDraftOption>> = [
  {
    weight: 520,
    value: {
      kind: "boost",
      code: "fee_5bps_24h",
      rarity: "common",
      label: "Fee -5 bps (24h)",
      metadata: { duration_hours: 24, effect: { type: "fee_discount_bps", value: 5 } },
    },
  },
  {
    weight: 360,
    value: {
      kind: "boost",
      code: "p2p_highlight_1",
      rarity: "common",
      label: "P2P Highlight (1)",
      metadata: { duration_hours: 72, effect: { type: "p2p_highlight_credits", value: 1 } },
    },
  },
  {
    weight: 220,
    value: {
      kind: "boost",
      code: "withdraw_priority_12h",
      rarity: "common",
      label: "Withdrawal priority (12h)",
      metadata: { duration_hours: 12, effect: { type: "withdrawal_priority_hours", value: 12 } },
    },
  },
  {
    weight: 85,
    value: {
      kind: "boost",
      code: "fee_10bps_48h",
      rarity: "rare",
      label: "Fee -10 bps (48h)",
      metadata: { duration_hours: 48, effect: { type: "fee_discount_bps", value: 10 } },
    },
  },
  {
    weight: 65,
    value: {
      kind: "boost",
      code: "p2p_highlight_3",
      rarity: "rare",
      label: "P2P Highlight (3)",
      metadata: { duration_hours: 168, effect: { type: "p2p_highlight_credits", value: 3 } },
    },
  },
  {
    weight: 22,
    value: {
      kind: "boost",
      code: "fee_15bps_72h",
      rarity: "epic",
      label: "Fee -15 bps (72h)",
      metadata: { duration_hours: 72, effect: { type: "fee_discount_bps", value: 15 } },
    },
  },
  {
    weight: 16,
    value: {
      kind: "boost",
      code: "withdraw_priority_72h",
      rarity: "epic",
      label: "Withdrawal priority (72h)",
      metadata: { duration_hours: 72, effect: { type: "withdrawal_priority_hours", value: 72 } },
    },
  },
  {
    weight: 4,
    value: {
      kind: "boost",
      code: "fee_25bps_7d",
      rarity: "legendary",
      label: "Fee -25 bps (7d)",
      metadata: { duration_hours: 168, effect: { type: "fee_discount_bps", value: 25 } },
    },
  },
];

function tableFor(profile: VolatilityProfile): Array<Weighted<BoostDraftOption>> {
  // Volatility shifts weight toward tail outcomes. Same menu.
  const scale = profile === "high" ? 1.25 : profile === "medium" ? 1.1 : 1.0;
  return BASE.map((x) => {
    const tail = x.value.rarity === "common" ? 1.0 / scale : scale;
    return { weight: Math.max(1, Math.round(x.weight * tail)), value: x.value };
  });
}

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

function uniqueByCode(options: BoostDraftOption[]): BoostDraftOption[] {
  const seen = new Set<string>();
  const out: BoostDraftOption[] = [];
  for (const o of options) {
    if (seen.has(o.code)) continue;
    seen.add(o.code);
    out.push(o);
  }
  return out;
}

export function resolveBoostDraftOptions(params: {
  actionId: string;
  userId: string;
  module: string;
  profile: VolatilityProfile;
  serverSeedB64: string;
  clientSeed: string;
  clientCommitHash: string;
}): {
  options: BoostDraftOption[];
  audit: { random_hashes: string[]; rolls: number[]; totals: number[] };
} {
  const table = tableFor(params.profile);

  const options: BoostDraftOption[] = [];
  const hashes: string[] = [];
  const rolls: number[] = [];
  const totals: number[] = [];

  for (let i = 0; i < 6 && uniqueByCode(options).length < 3; i += 1) {
    const h = sha256Hex(
      `${params.serverSeedB64}:${params.clientSeed}:${params.actionId}:${params.userId}:${params.module}:${params.profile}:${params.clientCommitHash}:pick=${i}`,
    );
    hashes.push(h);
    const rngU64 = bytesToU64BigInt(Buffer.from(h.slice(0, 16), "hex"));
    const { picked, roll, total } = pickWeighted(rngU64, table);
    rolls.push(roll);
    totals.push(total);
    options.push(picked);
  }

  return {
    options: uniqueByCode(options).slice(0, 3),
    audit: { random_hashes: hashes.slice(0, 3), rolls: rolls.slice(0, 3), totals: totals.slice(0, 3) },
  };
}
