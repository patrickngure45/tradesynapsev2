export type ArcadeModuleKey =
  | "crafting"
  | "blind_creation"
  | "mutation"
  | "fusion"
  | "community_event"
  | "ai_oracle"
  | "insight_pack"
  | "boost_draft"
  | "daily_drop"
  | "calendar_daily"
  | "time_vault"
  | "rarity_wheel"
  | "flash_mission"
  | "streak_protector"
  | "progression"
  | "seasonal_badges"
  | "shared_pool";

export type ArcadeModuleMeta = {
  key: ArcadeModuleKey;
  label: string;
  volatility?: boolean;
  fairness?: boolean;
  description: string;
};

export const ARCADE_MODULES: ArcadeModuleMeta[] = [
  { key: "progression", label: "Progression", volatility: false, fairness: false, description: "XP, tiers, prestige, and cosmetics." },
  { key: "crafting", label: "Crafting", volatility: false, fairness: false, description: "Deterministic shards and recipes." },
  { key: "blind_creation", label: "Blind creation", volatility: true, fairness: true, description: "Spend shards to forge now, reveal later." },
  { key: "mutation", label: "Mutation", volatility: true, fairness: true, description: "Transform a cosmetic into a new one (may upgrade)." },
  { key: "fusion", label: "Fusion", volatility: true, fairness: true, description: "Combine two cosmetics into one (bounded upgrade chance)." },
  { key: "community_event", label: "Community event", volatility: false, fairness: false, description: "Global progress unlocks a weekly claim." },
  { key: "shared_pool", label: "Shared pool", volatility: true, fairness: true, description: "Weekly pool: everyone gets baseline, some get boosted." },
  { key: "ai_oracle", label: "AI Oracle", volatility: true, fairness: true, description: "Tiered AI responses; rare outputs become collectible templates." },
  { key: "insight_pack", label: "Insight packs", volatility: true, fairness: true, description: "Collectible informational cards (not advice)." },
  { key: "flash_mission", label: "Flash missions", volatility: true, fairness: true, description: "Complete real actions and claim bounded rewards." },
  { key: "streak_protector", label: "Streak protector", volatility: true, fairness: true, description: "Weekly roll that can save a missed day." },
  { key: "daily_drop", label: "Daily drop", volatility: true, fairness: true, description: "One per day badge claim." },
  { key: "seasonal_badges", label: "Badge pools", volatility: true, fairness: true, description: "Seasonal badge pools and set unlock keys." },
  { key: "rarity_wheel", label: "Rarity wheel", volatility: true, fairness: true, description: "Spend shards to roll cosmetics with pity." },
  { key: "boost_draft", label: "Boost draft", volatility: true, fairness: true, description: "Reveal 3 boosts, pick 1." },
  { key: "time_vault", label: "Time vault", volatility: true, fairness: true, description: "Lock funds then reveal a bounded bonus." },
  { key: "calendar_daily", label: "Calendar", volatility: true, fairness: true, description: "Daily claim with streak and pity." },
];
