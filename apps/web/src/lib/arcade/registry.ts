export type ArcadeModuleKey =
  | "crafting"
  | "boost_draft"
  | "daily_drop"
  | "calendar_daily"
  | "time_vault"
  | "rarity_wheel"
  | "flash_mission"
  | "streak_protector"
  | "progression";

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
  { key: "flash_mission", label: "Flash missions", volatility: true, fairness: true, description: "Complete real actions and claim bounded rewards." },
  { key: "streak_protector", label: "Streak protector", volatility: true, fairness: true, description: "Weekly roll that can save a missed day." },
  { key: "daily_drop", label: "Daily drop", volatility: true, fairness: true, description: "One per day badge claim." },
  { key: "rarity_wheel", label: "Rarity wheel", volatility: true, fairness: true, description: "Spend shards to roll cosmetics with pity." },
  { key: "boost_draft", label: "Boost draft", volatility: true, fairness: true, description: "Reveal 3 boosts, pick 1." },
  { key: "time_vault", label: "Time vault", volatility: true, fairness: true, description: "Lock funds then reveal a bounded bonus." },
  { key: "calendar_daily", label: "Calendar", volatility: true, fairness: true, description: "Daily claim with streak and pity." },
];
