import { describe, expect, test } from "vitest";

import { resolveAiTier } from "@/lib/ai/probabilistic";

describe("ai/probabilistic", () => {
  test("tier resolution is deterministic", () => {
    const a = resolveAiTier({
      actionId: "00000000-0000-0000-0000-000000000111",
      userId: "00000000-0000-0000-0000-000000000222",
      module: "ai_oracle",
      profile: "low",
      serverSeedB64: "c2VydmVyX3NlZWRfZml4ZWQ=",
      clientSeed: "client_seed_fixed_999",
      clientCommitHash: "0".repeat(64),
      promptHash: "f".repeat(64),
    });

    const b = resolveAiTier({
      actionId: "00000000-0000-0000-0000-000000000111",
      userId: "00000000-0000-0000-0000-000000000222",
      module: "ai_oracle",
      profile: "low",
      serverSeedB64: "c2VydmVyX3NlZWRfZml4ZWQ=",
      clientSeed: "client_seed_fixed_999",
      clientCommitHash: "0".repeat(64),
      promptHash: "f".repeat(64),
    });

    expect(a.tier).toBe(b.tier);
    expect(a.audit.random_hash).toBe(b.audit.random_hash);
  });
});
