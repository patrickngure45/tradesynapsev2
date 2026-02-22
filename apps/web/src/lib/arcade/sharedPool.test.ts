import { describe, expect, test } from "vitest";

import { resolveSharedPool } from "@/lib/arcade/sharedPool";

describe("arcade/sharedPool", () => {
  test("deterministic for fixed inputs", () => {
    const a = resolveSharedPool({
      actionId: "00000000-0000-0000-0000-000000000010",
      userId: "00000000-0000-0000-0000-000000000020",
      module: "shared_pool",
      profile: "low",
      serverSeedB64: "c2VydmVyX3NlZWRfZml4ZWQ=",
      clientSeed: "client_seed_fixed_abc",
      clientCommitHash: "0".repeat(64),
      weekStartIso: "2026-02-16",
    });

    const b = resolveSharedPool({
      actionId: "00000000-0000-0000-0000-000000000010",
      userId: "00000000-0000-0000-0000-000000000020",
      module: "shared_pool",
      profile: "low",
      serverSeedB64: "c2VydmVyX3NlZWRfZml4ZWQ=",
      clientSeed: "client_seed_fixed_abc",
      clientCommitHash: "0".repeat(64),
      weekStartIso: "2026-02-16",
    });

    expect(a.audit.random_hash).toBe(b.audit.random_hash);
    expect(a.outcome.baseline.code).toBe("shared_pool_member");
    expect(a.outcome.boost?.code ?? null).toBe(b.outcome.boost?.code ?? null);
  });
});
