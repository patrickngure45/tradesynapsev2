import { describe, expect, it } from "vitest";

import { resolveInsightPack } from "@/lib/arcade/insightPacks";

describe("arcade/insightPacks", () => {
  it("resolveInsightPack is deterministic and includes disclaimer", () => {
    const a = resolveInsightPack({
      actionId: "00000000-0000-0000-0000-000000000abc",
      userId: "00000000-0000-0000-0000-000000000def",
      module: "insight_pack",
      profile: "low",
      serverSeedB64: "server",
      clientSeed: "client",
      clientCommitHash: "commit",
    });

    const b = resolveInsightPack({
      actionId: "00000000-0000-0000-0000-000000000abc",
      userId: "00000000-0000-0000-0000-000000000def",
      module: "insight_pack",
      profile: "low",
      serverSeedB64: "server",
      clientSeed: "client",
      clientCommitHash: "commit",
    });

    expect(a).toEqual(b);
    expect(a.outcome.kind).toBe("insight");
    expect(a.outcome.code).toMatch(/^insight:/);
    expect(a.outcome.metadata.disclaimer.toLowerCase()).toContain("not financial advice");
    expect(a.audit.random_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
