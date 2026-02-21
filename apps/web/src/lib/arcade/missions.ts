import { bytesToU64BigInt, sha256Hex } from "@/lib/uncertainty/hash";

export type MissionCode = "convert_once" | "transfer_once" | "create_p2p_ad";

export type MissionDef = {
  code: MissionCode;
  title: string;
  description: string;
};

export const ALL_MISSIONS: MissionDef[] = [
  {
    code: "convert_once",
    title: "Quick convert",
    description: "Complete 1 conversion in Wallet (any pair).",
  },
  {
    code: "transfer_once",
    title: "Send a transfer",
    description: "Complete 1 internal transfer to another user.",
  },
  {
    code: "create_p2p_ad",
    title: "Post a P2P ad",
    description: "Create 1 P2P marketplace ad.",
  },
];

export function pickDailyMissions(params: { userId: string; todayIso: string; count: number }): MissionDef[] {
  const count = Math.max(1, Math.min(3, Math.floor(params.count)));
  const h = sha256Hex(`${params.userId}:${params.todayIso}:flash_missions:v1`);
  const rng = bytesToU64BigInt(Buffer.from(h.slice(0, 16), "hex"));

  const pool = ALL_MISSIONS.slice();
  const out: MissionDef[] = [];
  let x = rng;

  while (out.length < count && pool.length > 0) {
    const idx = Number(x % BigInt(pool.length));
    out.push(pool.splice(idx, 1)[0]!);
    x = bytesToU64BigInt(Buffer.from(sha256Hex(`${h}:${out.length}`).slice(0, 16), "hex"));
  }

  return out;
}

export type MissionReward =
  | { kind: "shard"; code: "arcade_shard"; rarity: "common"; quantity: number; label: string }
  | { kind: "boost"; code: "fee_5bps_24h" | "p2p_highlight_1"; rarity: "common"; quantity: number; label: string };

type Weighted<T> = { weight: number; value: T };

const REWARD_TABLE: Array<Weighted<MissionReward>> = [
  { weight: 650, value: { kind: "shard", code: "arcade_shard", rarity: "common", quantity: 25, label: "25 Arcade Shards" } },
  { weight: 250, value: { kind: "shard", code: "arcade_shard", rarity: "common", quantity: 50, label: "50 Arcade Shards" } },
  { weight: 70, value: { kind: "boost", code: "p2p_highlight_1", rarity: "common", quantity: 1, label: "P2P Highlight (1)" } },
  { weight: 30, value: { kind: "boost", code: "fee_5bps_24h", rarity: "common", quantity: 1, label: "Fee discount (-5bps, 24h)" } },
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

export function resolveMissionReward(params: {
  actionId: string;
  userId: string;
  module: string;
  profile: "low" | "medium" | "high";
  serverSeedB64: string;
  clientSeed: string;
  clientCommitHash: string;
  todayIso: string;
  missionCode: string;
}): { reward: MissionReward; audit: { random_hash: string; roll: number; total: number } } {
  const randomHash = sha256Hex(
    `${params.serverSeedB64}:${params.clientSeed}:${params.actionId}:${params.userId}:${params.module}:${params.profile}:${params.clientCommitHash}:${params.todayIso}:${params.missionCode}:reward`,
  );
  const rngU64 = bytesToU64BigInt(Buffer.from(randomHash.slice(0, 16), "hex"));
  const picked = pickWeighted(rngU64, REWARD_TABLE);
  return { reward: picked.picked, audit: { random_hash: randomHash, roll: picked.roll, total: picked.total } };
}
