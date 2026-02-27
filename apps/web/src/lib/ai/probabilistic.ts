import { groq } from "@/lib/ai/client";
import { bytesToU64BigInt, sha256Hex } from "@/lib/uncertainty/hash";

export type VolatilityProfile = "low" | "medium" | "high";
export type AiTier = "common" | "rare" | "epic" | "legendary";

type Weighted<T> = { weight: number; value: T };

const TIER_TABLE: Record<VolatilityProfile, Array<Weighted<AiTier>>> = {
  low: [
    { weight: 9200, value: "common" },
    { weight: 700, value: "rare" },
    { weight: 90, value: "epic" },
    { weight: 10, value: "legendary" },
  ],
  medium: [
    { weight: 8600, value: "common" },
    { weight: 1050, value: "rare" },
    { weight: 280, value: "epic" },
    { weight: 70, value: "legendary" },
  ],
  high: [
    { weight: 7800, value: "common" },
    { weight: 1400, value: "rare" },
    { weight: 600, value: "epic" },
    { weight: 200, value: "legendary" },
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

export function resolveAiTier(params: {
  actionId: string;
  userId: string;
  module: string;
  profile: VolatilityProfile;
  serverSeedB64: string;
  clientSeed: string;
  clientCommitHash: string;
  promptHash: string;
}): {
  tier: AiTier;
  audit: { random_hash: string; roll: number; total: number };
} {
  const randomHash = sha256Hex(
    `${params.serverSeedB64}:${params.clientSeed}:${params.actionId}:${params.userId}:${params.module}:${params.profile}:${params.clientCommitHash}:prompt=${params.promptHash}:tier`,
  );
  const rngU64 = bytesToU64BigInt(Buffer.from(randomHash.slice(0, 16), "hex"));
  const picked = pickWeighted(rngU64, TIER_TABLE[params.profile] ?? TIER_TABLE.low);

  return {
    tier: picked.picked,
    audit: { random_hash: randomHash, roll: picked.roll, total: picked.total },
  };
}

function systemPromptForTier(tier: AiTier): string {
  if (tier === "legendary") {
    return [
      "You are the Citadel AI Oracle.",
      "Generate a structured, reusable TEMPLATE the user can copy/paste for future analysis.",
      "Output in Markdown with the following exact sections:",
      "1) Summary (2-3 lines)",
      "2) Checklist (5-9 bullets)",
      "3) Red flags (3-6 bullets)",
      "4) Next steps (3-6 bullets)",
      "Rules:",
      "- Be practical and conservative.",
      "- Do not provide financial advice.",
      "- Do not claim guarantees.",
    ].join("\n");
  }

  if (tier === "epic") {
    return [
      "You are the Citadel AI Oracle.",
      "Provide a detailed playbook-style response.",
      "Output in Markdown with sections and short bullets.",
      "Rules:",
      "- Be practical and conservative.",
      "- Do not provide financial advice.",
      "- Avoid absolute language like 'guaranteed'.",
    ].join("\n");
  }

  if (tier === "rare") {
    return [
      "You are the Citadel AI Oracle.",
      "Provide a concise answer AND include a small reusable checklist template.",
      "Output in Markdown.",
      "Rules:",
      "- Be practical and conservative.",
      "- Do not provide financial advice.",
    ].join("\n");
  }

  return [
    "You are the Citadel AI Oracle.",
    "Provide a short, actionable answer in 4-8 bullets.",
    "Rules:",
    "- Be practical and conservative.",
    "- Do not provide financial advice.",
  ].join("\n");
}

export async function generateTieredAiResponse(params: {
  prompt: string;
  tier: AiTier;
}): Promise<{ text: string }> {
  const apiKey = (process.env.GROQ_API_KEY ?? "").trim();
  if (!apiKey) {
    return { text: "AI offline — configure GROQ_API_KEY to enable AI Oracle." };
  }

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    temperature: 0,
    messages: [
      { role: "system", content: systemPromptForTier(params.tier) },
      {
        role: "user",
        content: params.prompt,
      },
    ],
  });

  const text = completion.choices[0]?.message?.content ?? "";
  return { text: text.trim() || "AI response unavailable." };
}
