import { z } from "zod";

export const TileTypeSchema = z.enum(["land", "water"]);
export type TileType = z.infer<typeof TileTypeSchema>;

export const ResourceTypeSchema = z.enum([
  "iron",
  "copper",
  "coal",
  "wood",
  "stone",
]);
export type ResourceType = z.infer<typeof ResourceTypeSchema>;

export const TileSchema = z.object({
  type: TileTypeSchema,
  elevation: z.number(),
  resource: ResourceTypeSchema.nullable(),
  resourceAmount: z.number().nullable(),
});
export type Tile = z.infer<typeof TileSchema>;

export const ChunkSchema = z.object({
  x: z.number(),
  y: z.number(),
  tiles: z.array(z.array(TileSchema)),
});
export type Chunk = z.infer<typeof ChunkSchema>;

export const InventorySchema = z.record(ResourceTypeSchema, z.number());
export type Inventory = z.infer<typeof InventorySchema>;

export const CraftingRecipeSchema = z.object({
  inputs: z.record(z.string(), z.number()),
  output: z.string(),
  outputAmount: z.number(),
});
export type CraftingRecipe = z.infer<typeof CraftingRecipeSchema>;

export const EntityTypeSchema = z.enum(["furnace"]);
export type EntityType = z.infer<typeof EntityTypeSchema>;

export const EntitySchema = z.object({
  id: z.string(),
  type: EntityTypeSchema,
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type Entity = z.infer<typeof EntitySchema>;

export const GameStateSchema = z.object({
  chunks: z.map(z.string(), ChunkSchema),
  inventory: InventorySchema,
  craftedItems: z.record(z.string(), z.number()),
  cameraX: z.number(),
  cameraY: z.number(),
  cameraZoom: z.number(),
  worldSeed: z.string(),
  entities: z.map(z.string(), EntitySchema),
  selectedCraftingItem: EntityTypeSchema.nullable(),
});
export type GameState = z.infer<typeof GameStateSchema>;

// Re-export commonly used constants from config for convenience
export { CHUNK_SIZE, TILE_SIZE, ZOOM_CONFIG } from "./config";

export const CRAFTING_RECIPES: Record<string, CraftingRecipe> = {
  furnace: {
    inputs: { stone: 5 },
    output: "furnace",
    outputAmount: 1,
  },
};

export const ENTITY_DEFINITIONS: Record<
  EntityType,
  { width: number; height: number }
> = {
  furnace: { width: 2, height: 2 },
};
