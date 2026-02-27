import { describe, expect, it } from "vitest";

import { resolveBlindCreation, resolveFusion, resolveMutation } from "@/lib/arcade/creation";

type R = "common" | "uncommon" | "rare" | "epic" | "legendary";
const ORDER: Record<R, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };

describe("arcade/creation", () => {
  it("resolveBlindCreation is deterministic", () => {
    const a = resolveBlindCreation({
      actionId: "00000000-0000-0000-0000-000000000001",
      userId: "00000000-0000-0000-0000-000000000002",
      module: "blind_creation",
      profile: "medium",
      serverSeedB64: "server_seed_b64_example",
      clientSeed: "client_seed_example",
      clientCommitHash: "client_commit_hash_example",
    });

    const b = resolveBlindCreation({
      actionId: "00000000-0000-0000-0000-000000000001",
      userId: "00000000-0000-0000-0000-000000000002",
      module: "blind_creation",
      profile: "medium",
      serverSeedB64: "server_seed_b64_example",
      clientSeed: "client_seed_example",
      clientCommitHash: "client_commit_hash_example",
    });

    expect(a).toEqual(b);
    expect(a.outcome.kind).toBe("cosmetic");
    expect(a.outcome.code).toContain(":");
    expect(a.audit.random_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("resolveMutation never downgrades rarity", () => {
    const inputRarity: R = "rare";
    const out = resolveMutation({
      actionId: "00000000-0000-0000-0000-000000000010",
      userId: "00000000-0000-0000-0000-000000000020",
      module: "mutation",
      profile: "low",
      serverSeedB64: "s",
      clientSeed: "c",
      clientCommitHash: "h",
      input: { code: "forge_spark:abcd", rarity: inputRarity },
    });

    const outRarity = out.outcome.rarity as R;
    expect(ORDER[outRarity]).toBeGreaterThanOrEqual(ORDER[inputRarity]);
  });

  it("resolveFusion is deterministic", () => {
    const a = resolveFusion({
      actionId: "00000000-0000-0000-0000-000000000100",
      userId: "00000000-0000-0000-0000-000000000200",
      module: "fusion",
      profile: "high",
      serverSeedB64: "server",
      clientSeed: "client",
      clientCommitHash: "commit",
      input: { code_a: "x", rarity_a: "uncommon", code_b: "y", rarity_b: "rare" },
    });

    const b = resolveFusion({
      actionId: "00000000-0000-0000-0000-000000000100",
      userId: "00000000-0000-0000-0000-000000000200",
      module: "fusion",
      profile: "high",
      serverSeedB64: "server",
      clientSeed: "client",
      clientCommitHash: "commit",
      input: { code_a: "x", rarity_a: "uncommon", code_b: "y", rarity_b: "rare" },
    });

    expect(a).toEqual(b);
    expect(a.outcome.kind).toBe("cosmetic");
    expect(a.audit.random_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
