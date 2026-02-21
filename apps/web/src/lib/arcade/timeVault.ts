import { sha256Hex, bytesToU64BigInt } from "@/lib/uncertainty/hash";

export type VolatilityProfile = "low" | "medium" | "high";

export type TimeVaultOutcome = {
  kind: "boost";
  code: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  label: string;
  metadata: {
    duration_hours: number;
    effect: {
      type:
        | "fee_discount_bps"
        | "p2p_highlight_credits"
        | "withdrawal_priority_hours";
      value: number;
    };
  };
};

type Weighted<T> = { weight: number; value: T };

function tableFor(profile: VolatilityProfile): Array<Weighted<TimeVaultOutcome>> {
  // These are intentionally utility-like (not direct cash payouts).
  // Volatility changes tail weight, not the mean “guarantee” (everyone gets something).
  const common: Array<Weighted<TimeVaultOutcome>> = [
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
      weight: 320,
      value: {
        kind: "boost",
        code: "p2p_highlight_1",
        rarity: "common",
        label: "P2P Highlight (1)",
        metadata: { duration_hours: 72, effect: { type: "p2p_highlight_credits", value: 1 } },
      },
    },
    {
      weight: 160,
      value: {
        kind: "boost",
        code: "withdraw_priority_12h",
        rarity: "common",
        label: "Withdrawal priority (12h)",
        metadata: { duration_hours: 12, effect: { type: "withdrawal_priority_hours", value: 12 } },
      },
    },
  ];

  const rare: Array<Weighted<TimeVaultOutcome>> = [
    {
      weight: 0,
      value: {
        kind: "boost",
        code: "fee_10bps_48h",
        rarity: "rare",
        label: "Fee -10 bps (48h)",
        metadata: { duration_hours: 48, effect: { type: "fee_discount_bps", value: 10 } },
      },
    },
    {
      weight: 0,
      value: {
        kind: "boost",
        code: "p2p_highlight_3",
        rarity: "rare",
        label: "P2P Highlight (3)",
        metadata: { duration_hours: 168, effect: { type: "p2p_highlight_credits", value: 3 } },
      },
    },
  ];

  const epic: Array<Weighted<TimeVaultOutcome>> = [
    {
      weight: 0,
      value: {
        kind: "boost",
        code: "fee_15bps_72h",
        rarity: "epic",
        label: "Fee -15 bps (72h)",
        metadata: { duration_hours: 72, effect: { type: "fee_discount_bps", value: 15 } },
      },
    },
    {
      weight: 0,
      value: {
        kind: "boost",
        code: "withdraw_priority_72h",
        rarity: "epic",
        label: "Withdrawal priority (72h)",
        metadata: { duration_hours: 72, effect: { type: "withdrawal_priority_hours", value: 72 } },
      },
    },
  ];

  const legendary: Array<Weighted<TimeVaultOutcome>> = [
    {
      weight: 0,
      value: {
        kind: "boost",
        code: "fee_25bps_7d",
        rarity: "legendary",
        label: "Fee -25 bps (7d)",
        metadata: { duration_hours: 168, effect: { type: "fee_discount_bps", value: 25 } },
      },
    },
  ];

  if (profile === "high") {
    rare[0]!.weight = 80;
    rare[1]!.weight = 70;
    epic[0]!.weight = 35;
    epic[1]!.weight = 25;
    legendary[0]!.weight = 10;
  } else if (profile === "medium") {
    rare[0]!.weight = 55;
    rare[1]!.weight = 45;
    epic[0]!.weight = 18;
    epic[1]!.weight = 12;
    legendary[0]!.weight = 3;
  } else {
    rare[0]!.weight = 30;
    rare[1]!.weight = 25;
    epic[0]!.weight = 7;
    epic[1]!.weight = 5;
    legendary[0]!.weight = 1;
  }

  return [...common, ...rare, ...epic, ...legendary].filter((x) => x.weight > 0);
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

export function resolveTimeVault(params: {
  actionId: string;
  userId: string;
  module: string;
  profile: VolatilityProfile;
  serverSeedB64: string;
  clientSeed: string;
  clientCommitHash: string;
  assetId: string;
  amount: string;
  durationHours: number;
}): {
  outcome: TimeVaultOutcome;
  audit: { random_hash: string; roll: number; total: number };
} {
  const table = tableFor(params.profile);

  const randomHash = sha256Hex(
    `${params.serverSeedB64}:${params.clientSeed}:${params.actionId}:${params.userId}:${params.module}:${params.profile}:${params.clientCommitHash}:${params.assetId}:${params.amount}:${params.durationHours}`,
  );
  const rngU64 = bytesToU64BigInt(Buffer.from(randomHash.slice(0, 16), "hex"));
  const { picked, roll, total } = pickWeighted(rngU64, table);

  return {
    outcome: picked,
    audit: { random_hash: randomHash, roll, total },
  };
}
