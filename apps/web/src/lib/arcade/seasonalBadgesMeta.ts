export type SeasonalBadgePoolKey = "aurora" | "ember" | "tidal" | "zenith";

export type SeasonalBadge = {
  kind: "badge";
  code: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  label: string;
};

export type SeasonalBadgeSet = {
  id: "starter" | "collector";
  label: string;
  requiredCodes: string[];
  unlockKey: { kind: "key"; code: string; rarity: "legendary"; label: string };
};

export type SeasonalBadgePoolMeta = {
  poolKey: SeasonalBadgePoolKey;
  label: string;
  badges: SeasonalBadge[];
  sets: SeasonalBadgeSet[];
};

const POOL_KEYS: SeasonalBadgePoolKey[] = ["aurora", "ember", "tidal", "zenith"];

function weekIndexFromSeasonKey(seasonKey: string): number {
  // seasonKey format used by /api/arcade/season: "week:YYYY-MM-DD"
  const raw = String(seasonKey ?? "").trim();
  const datePart = raw.startsWith("week:") ? raw.slice(5) : raw;
  const t = Date.parse(`${datePart}T00:00:00Z`);
  if (!Number.isFinite(t)) return 0;
  const weekMs = 7 * 24 * 3600_000;
  return Math.floor(t / weekMs);
}

export function poolKeyForSeasonKey(seasonKey: string): SeasonalBadgePoolKey {
  const idx = weekIndexFromSeasonKey(seasonKey);
  const pool = POOL_KEYS[((idx % POOL_KEYS.length) + POOL_KEYS.length) % POOL_KEYS.length];
  return pool ?? "aurora";
}

function seasonDatePart(seasonKey: string): string {
  const raw = String(seasonKey ?? "").trim();
  const datePart = raw.startsWith("week:") ? raw.slice(5) : raw;
  // Keep it filename/code safe.
  return datePart.replace(/[^0-9-]/g, "");
}

export function keyCodeForSeasonSet(seasonKey: string, setId: SeasonalBadgeSet["id"]): string {
  const d = seasonDatePart(seasonKey) || "unknown";
  return `season_${d}_set_${setId}_key`;
}

export function seasonalBadgePoolMetaFor(seasonKey: string): SeasonalBadgePoolMeta {
  const poolKey = poolKeyForSeasonKey(seasonKey);

  const baseBadges: Record<SeasonalBadgePoolKey, { label: string; badges: SeasonalBadge[] }> = {
    aurora: {
      label: "Aurora",
      badges: [
        { kind: "badge", code: "aurora_spark", rarity: "common", label: "Aurora Spark" },
        { kind: "badge", code: "aurora_shard", rarity: "common", label: "Aurora Shard" },
        { kind: "badge", code: "aurora_ribbon", rarity: "common", label: "Aurora Ribbon" },
        { kind: "badge", code: "aurora_glint", rarity: "rare", label: "Aurora Glint" },
        { kind: "badge", code: "aurora_arc", rarity: "rare", label: "Aurora Arc" },
        { kind: "badge", code: "aurora_aura", rarity: "epic", label: "Aurora Aura" },
        { kind: "badge", code: "aurora_crown", rarity: "legendary", label: "Aurora Crown" },
      ],
    },
    ember: {
      label: "Ember",
      badges: [
        { kind: "badge", code: "ember_spark", rarity: "common", label: "Ember Spark" },
        { kind: "badge", code: "ember_ash", rarity: "common", label: "Ember Ash" },
        { kind: "badge", code: "ember_ribbon", rarity: "common", label: "Ember Ribbon" },
        { kind: "badge", code: "ember_glint", rarity: "rare", label: "Ember Glint" },
        { kind: "badge", code: "ember_flare", rarity: "rare", label: "Ember Flare" },
        { kind: "badge", code: "ember_aura", rarity: "epic", label: "Ember Aura" },
        { kind: "badge", code: "ember_crown", rarity: "legendary", label: "Ember Crown" },
      ],
    },
    tidal: {
      label: "Tidal",
      badges: [
        { kind: "badge", code: "tidal_spark", rarity: "common", label: "Tidal Spark" },
        { kind: "badge", code: "tidal_shell", rarity: "common", label: "Tidal Shell" },
        { kind: "badge", code: "tidal_ribbon", rarity: "common", label: "Tidal Ribbon" },
        { kind: "badge", code: "tidal_glint", rarity: "rare", label: "Tidal Glint" },
        { kind: "badge", code: "tidal_current", rarity: "rare", label: "Tidal Current" },
        { kind: "badge", code: "tidal_aura", rarity: "epic", label: "Tidal Aura" },
        { kind: "badge", code: "tidal_crown", rarity: "legendary", label: "Tidal Crown" },
      ],
    },
    zenith: {
      label: "Zenith",
      badges: [
        { kind: "badge", code: "zenith_spark", rarity: "common", label: "Zenith Spark" },
        { kind: "badge", code: "zenith_shard", rarity: "common", label: "Zenith Shard" },
        { kind: "badge", code: "zenith_ribbon", rarity: "common", label: "Zenith Ribbon" },
        { kind: "badge", code: "zenith_glint", rarity: "rare", label: "Zenith Glint" },
        { kind: "badge", code: "zenith_ray", rarity: "rare", label: "Zenith Ray" },
        { kind: "badge", code: "zenith_aura", rarity: "epic", label: "Zenith Aura" },
        { kind: "badge", code: "zenith_crown", rarity: "legendary", label: "Zenith Crown" },
      ],
    },
  };

  const meta = baseBadges[poolKey];
  const badges = meta?.badges ?? baseBadges.aurora.badges;

  const starterCodes = badges.filter((b) => b.rarity === "common" || b.rarity === "rare").map((b) => b.code);
  const collectorCodes = badges.map((b) => b.code);

  const sets: SeasonalBadgeSet[] = [
    {
      id: "starter",
      label: "Starter set",
      requiredCodes: starterCodes,
      unlockKey: {
        kind: "key",
        code: keyCodeForSeasonSet(seasonKey, "starter"),
        rarity: "legendary",
        label: "Starter Gate Key",
      },
    },
    {
      id: "collector",
      label: "Collector set",
      requiredCodes: collectorCodes,
      unlockKey: {
        kind: "key",
        code: keyCodeForSeasonSet(seasonKey, "collector"),
        rarity: "legendary",
        label: "Collector Gate Key",
      },
    },
  ];

  return {
    poolKey,
    label: meta?.label ?? "Aurora",
    badges,
    sets,
  };
}
