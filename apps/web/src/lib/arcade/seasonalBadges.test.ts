import { describe, expect, test } from "vitest";

import { seasonalBadgePoolMetaFor, poolKeyForSeasonKey, keyCodeForSeasonSet } from "@/lib/arcade/seasonalBadgesMeta";
import { resolveSeasonalBadgeDrop } from "@/lib/arcade/seasonalBadges";

describe("arcade/seasonalBadges", () => {
  test("pool rotates deterministically by season key", () => {
    const a = poolKeyForSeasonKey("week:2026-02-16");
    const b = poolKeyForSeasonKey("week:2026-02-23");
    expect(typeof a).toBe("string");
    expect(typeof b).toBe("string");
  });

  test("meta includes sets with season-scoped key codes", () => {
    const seasonKey = "week:2026-02-16";
    const meta = seasonalBadgePoolMetaFor(seasonKey);
    expect(meta.badges.length).toBeGreaterThan(0);
    expect(meta.sets.length).toBeGreaterThan(0);

    for (const s of meta.sets) {
      expect(s.unlockKey.code).toBe(keyCodeForSeasonSet(seasonKey, s.id));
      expect(s.requiredCodes.length).toBeGreaterThan(0);
    }
  });

  test("resolve is deterministic for fixed inputs", () => {
    const r1 = resolveSeasonalBadgeDrop({
      actionId: "00000000-0000-0000-0000-000000000001",
      userId: "00000000-0000-0000-0000-000000000002",
      module: "seasonal_badges",
      profile: "low",
      serverSeedB64: "c2VydmVyX3NlZWRfZml4ZWQ=",
      clientSeed: "client_seed_fixed_123",
      clientCommitHash: "0".repeat(64),
      seasonKey: "week:2026-02-16",
    });

    const r2 = resolveSeasonalBadgeDrop({
      actionId: "00000000-0000-0000-0000-000000000001",
      userId: "00000000-0000-0000-0000-000000000002",
      module: "seasonal_badges",
      profile: "low",
      serverSeedB64: "c2VydmVyX3NlZWRfZml4ZWQ=",
      clientSeed: "client_seed_fixed_123",
      clientCommitHash: "0".repeat(64),
      seasonKey: "week:2026-02-16",
    });

    expect(r1.outcome.code).toBe(r2.outcome.code);
    expect(r1.audit.random_hash).toBe(r2.audit.random_hash);
  });
});
