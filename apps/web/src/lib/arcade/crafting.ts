export type InventoryItemKey = {
  kind: string;
  code: string;
  rarity: string;
};

export const SHARD_ITEM: InventoryItemKey = { kind: "shard", code: "arcade_shard", rarity: "common" };

export function shardsPerUnitForSalvage(rarity: string): number {
  switch (String(rarity ?? "").toLowerCase()) {
    case "legendary":
      return 300;
    case "epic":
      return 90;
    case "rare":
      return 30;
    default:
      return 10;
  }
}

export type CraftRecipe = {
  recipe_code: string;
  label: string;
  cost_shards: number;
  grant: {
    kind: "boost";
    code: string;
    rarity: "common" | "rare" | "epic" | "legendary";
    label: string;
    metadata: any;
  };
};

export const CRAFT_RECIPES: CraftRecipe[] = [
  {
    recipe_code: "craft_fee_5bps_24h",
    label: "Fee -5 bps (24h)",
    cost_shards: 60,
    grant: {
      kind: "boost",
      code: "fee_5bps_24h",
      rarity: "common",
      label: "Fee -5 bps (24h)",
      metadata: { duration_hours: 24, effect: { type: "fee_discount_bps", value: 5 } },
    },
  },
  {
    recipe_code: "craft_p2p_highlight_1",
    label: "P2P Highlight (1)",
    cost_shards: 75,
    grant: {
      kind: "boost",
      code: "p2p_highlight_1",
      rarity: "common",
      label: "P2P Highlight (1)",
      metadata: { duration_hours: 72, effect: { type: "p2p_highlight_credits", value: 1 } },
    },
  },
  {
    recipe_code: "craft_fee_10bps_48h",
    label: "Fee -10 bps (48h)",
    cost_shards: 180,
    grant: {
      kind: "boost",
      code: "fee_10bps_48h",
      rarity: "rare",
      label: "Fee -10 bps (48h)",
      metadata: { duration_hours: 48, effect: { type: "fee_discount_bps", value: 10 } },
    },
  },
];

export function findRecipe(recipeCode: string): CraftRecipe | null {
  const rc = String(recipeCode ?? "").trim();
  return CRAFT_RECIPES.find((r) => r.recipe_code === rc) ?? null;
}
