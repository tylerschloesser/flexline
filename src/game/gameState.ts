import type {
  GameState,
  Chunk,
  Inventory,
  ResourceType,
  Entity,
  EntityType,
} from "./schemas";
import { WorldGenerator } from "./worldGenerator";
import { TILE_SIZE, CHUNK_SIZE, ENTITY_DEFINITIONS } from "./schemas";
import { DEFAULT_INVENTORY, SAVE_DEBOUNCE_TIME } from "./config";

export class GameStateManager {
  private state: GameState;
  private worldGenerator: WorldGenerator;
  private listeners: Set<() => void> = new Set();
  private saveTimeout: NodeJS.Timeout | null = null;
  private chunkGenerationPromises = new Map<string, Promise<Chunk>>();

  constructor() {
    this.state = this.loadState() || this.createInitialState();
    this.worldGenerator = new WorldGenerator(this.state.worldSeed);
  }

  private createInitialState(): GameState {
    return {
      chunks: new Map(),
      inventory: { ...DEFAULT_INVENTORY },
      craftedItems: {},
      cameraX: 0,
      cameraY: 0,
      cameraZoom: 1,
      worldSeed: this.generateSeed(),
      entities: new Map(),
      selectedCraftingItem: null,
    };
  }

  private generateSeed(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  getState(): GameState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
    this.debouncedSave();
  }

  private debouncedSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.saveState();
      this.saveTimeout = null;
    }, SAVE_DEBOUNCE_TIME);
  }

  getOrGenerateChunk(chunkX: number, chunkY: number): Chunk {
    const key = this.worldGenerator.getChunkKey(chunkX, chunkY);

    if (!this.state.chunks.has(key)) {
      const chunk = this.worldGenerator.generateChunk(chunkX, chunkY);
      this.state.chunks.set(key, chunk);
      this.notify();
    }

    return this.state.chunks.get(key)!;
  }

  async getOrGenerateChunkAsync(
    chunkX: number,
    chunkY: number,
  ): Promise<Chunk> {
    const key = this.worldGenerator.getChunkKey(chunkX, chunkY);

    if (this.state.chunks.has(key)) {
      return this.state.chunks.get(key)!;
    }

    if (this.chunkGenerationPromises.has(key)) {
      return this.chunkGenerationPromises.get(key)!;
    }

    const promise = Promise.resolve().then(() => {
      const chunk = this.worldGenerator.generateChunk(chunkX, chunkY);
      this.state.chunks.set(key, chunk);
      this.chunkGenerationPromises.delete(key);
      this.notify();
      return chunk;
    });

    this.chunkGenerationPromises.set(key, promise);
    return promise;
  }

  mineResource(tileX: number, tileY: number): boolean {
    const { chunkX, chunkY } = this.worldGenerator.getChunkCoordinates(
      tileX,
      tileY,
    );
    const chunk = this.getOrGenerateChunk(chunkX, chunkY);

    const localTileX = Math.floor(tileX) - chunkX * CHUNK_SIZE;
    const localTileY = Math.floor(tileY) - chunkY * CHUNK_SIZE;

    if (
      localTileX < 0 ||
      localTileX >= CHUNK_SIZE ||
      localTileY < 0 ||
      localTileY >= CHUNK_SIZE
    ) {
      return false;
    }

    const tile = chunk.tiles[localTileY][localTileX];

    if (tile.resource && tile.resourceAmount) {
      this.state.inventory[tile.resource] += 1;
      this.notify();
      return true;
    }

    return false;
  }

  craftItem(recipe: string): boolean {
    const recipeData = this.getCraftingRecipe(recipe);
    if (!recipeData) return false;

    for (const [resource, amount] of Object.entries(recipeData.inputs)) {
      if (this.state.inventory[resource as ResourceType] < amount) {
        return false;
      }
    }

    for (const [resource, amount] of Object.entries(recipeData.inputs)) {
      this.state.inventory[resource as ResourceType] -= amount;
    }

    if (!this.state.craftedItems[recipeData.output]) {
      this.state.craftedItems[recipeData.output] = 0;
    }
    this.state.craftedItems[recipeData.output] += recipeData.outputAmount;

    this.notify();
    return true;
  }

  private getCraftingRecipe(recipe: string): {
    inputs: Record<string, number>;
    output: string;
    outputAmount: number;
  } | null {
    const recipes: Record<
      string,
      { inputs: Record<string, number>; output: string; outputAmount: number }
    > = {
      furnace: {
        inputs: { stone: 5 },
        output: "furnace",
        outputAmount: 1,
      },
    };

    return recipes[recipe] || null;
  }

  updateCamera(worldPixelX: number, worldPixelY: number, zoom: number): void {
    // Convert world pixel coordinates to tile coordinates (1x1 unit tiles)
    this.state.cameraX = worldPixelX / TILE_SIZE;
    this.state.cameraY = worldPixelY / TILE_SIZE;
    this.state.cameraZoom = zoom;
    this.notify();
  }

  getInventory(): Inventory {
    return { ...this.state.inventory };
  }

  getCraftedItems(): Record<string, number> {
    return { ...this.state.craftedItems };
  }

  getEntities(): Map<string, Entity> {
    return new Map(this.state.entities);
  }

  getSelectedCraftingItem(): EntityType | null {
    return this.state.selectedCraftingItem;
  }

  setSelectedCraftingItem(entityType: EntityType | null): void {
    this.state.selectedCraftingItem = entityType;
    this.notify();
  }

  canPlaceEntity(
    entityType: EntityType,
    centerX: number,
    centerY: number,
  ): boolean {
    const definition = ENTITY_DEFINITIONS[entityType];
    if (!definition) return false;

    const { width, height } = definition;
    const startX = Math.floor(centerX - width / 2);
    const startY = Math.floor(centerY - height / 2);

    // Check for entity overlaps
    for (const entity of this.state.entities.values()) {
      if (
        this.entitiesOverlap(
          startX,
          startY,
          width,
          height,
          entity.x,
          entity.y,
          entity.width,
          entity.height,
        )
      ) {
        return false;
      }
    }

    // Check if any tiles under the entity are water
    for (let y = startY; y < startY + height; y++) {
      for (let x = startX; x < startX + width; x++) {
        const { chunkX, chunkY } = this.worldGenerator.getChunkCoordinates(
          x,
          y,
        );
        const chunk = this.getOrGenerateChunk(chunkX, chunkY);

        const localTileX = x - chunkX * CHUNK_SIZE;
        const localTileY = y - chunkY * CHUNK_SIZE;

        if (
          localTileX < 0 ||
          localTileX >= CHUNK_SIZE ||
          localTileY < 0 ||
          localTileY >= CHUNK_SIZE
        ) {
          return false; // Out of bounds
        }

        const tile = chunk.tiles[localTileY][localTileX];
        if (tile.type === "water") {
          return false; // Cannot place on water
        }
      }
    }

    return true;
  }

  private entitiesOverlap(
    x1: number,
    y1: number,
    w1: number,
    h1: number,
    x2: number,
    y2: number,
    w2: number,
    h2: number,
  ): boolean {
    return !(x1 + w1 <= x2 || x2 + w2 <= x1 || y1 + h1 <= y2 || y2 + h2 <= y1);
  }

  placeEntity(
    entityType: EntityType,
    centerX: number,
    centerY: number,
  ): boolean {
    if (!this.canPlaceEntity(entityType, centerX, centerY)) {
      return false;
    }

    const definition = ENTITY_DEFINITIONS[entityType];
    const { width, height } = definition;
    const startX = Math.floor(centerX - width / 2);
    const startY = Math.floor(centerY - height / 2);

    const entity: Entity = {
      id: this.generateEntityId(),
      type: entityType,
      x: startX,
      y: startY,
      width,
      height,
    };

    this.state.entities.set(entity.id, entity);
    this.notify();
    return true;
  }

  private generateEntityId(): string {
    return `entity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getEntitiesInChunk(chunkX: number, chunkY: number): Entity[] {
    const chunkStartX = chunkX * CHUNK_SIZE;
    const chunkEndX = chunkStartX + CHUNK_SIZE;
    const chunkStartY = chunkY * CHUNK_SIZE;
    const chunkEndY = chunkStartY + CHUNK_SIZE;

    const entitiesInChunk: Entity[] = [];

    for (const entity of this.state.entities.values()) {
      if (
        this.entityIntersectsChunk(
          entity,
          chunkStartX,
          chunkStartY,
          chunkEndX,
          chunkEndY,
        )
      ) {
        entitiesInChunk.push(entity);
      }
    }

    return entitiesInChunk;
  }

  private entityIntersectsChunk(
    entity: Entity,
    chunkStartX: number,
    chunkStartY: number,
    chunkEndX: number,
    chunkEndY: number,
  ): boolean {
    const entityEndX = entity.x + entity.width;
    const entityEndY = entity.y + entity.height;

    return !(
      entityEndX <= chunkStartX ||
      entity.x >= chunkEndX ||
      entityEndY <= chunkStartY ||
      entity.y >= chunkEndY
    );
  }

  resetState(): void {
    this.state = this.createInitialState();
    this.worldGenerator = new WorldGenerator(this.state.worldSeed);
    this.chunkGenerationPromises.clear();
    localStorage.removeItem("gameState");
    this.notify();
  }

  destroy(): void {
    this.chunkGenerationPromises.clear();
  }

  private saveState(): void {
    // Only save essential state, not chunk data (chunks will be regenerated)
    const essentialState = {
      inventory: this.state.inventory,
      craftedItems: this.state.craftedItems,
      cameraX: this.state.cameraX,
      cameraY: this.state.cameraY,
      cameraZoom: this.state.cameraZoom,
      worldSeed: this.state.worldSeed,
      entities: Array.from(this.state.entities.entries()),
      selectedCraftingItem: this.state.selectedCraftingItem,
    };

    try {
      localStorage.setItem("gameState", JSON.stringify(essentialState));
    } catch (e) {
      console.error("Failed to save state:", e);
      // If saving fails, try to clear old data and save again
      try {
        localStorage.removeItem("gameState");
        localStorage.setItem("gameState", JSON.stringify(essentialState));
      } catch (e2) {
        console.error("Failed to save state even after clearing:", e2);
      }
    }
  }

  private loadState(): GameState | null {
    try {
      const saved = localStorage.getItem("gameState");
      if (!saved) {
        console.log("No saved game state found");
        return null;
      }

      const parsed = JSON.parse(saved);
      console.log("Loading saved state:", parsed);

      // Merge saved essential state with default state structure
      const state = {
        chunks: new Map(), // Start with empty chunks (will be generated on demand)
        inventory: parsed.inventory || { ...DEFAULT_INVENTORY },
        craftedItems: parsed.craftedItems || {},
        cameraX: parsed.cameraX || 0,
        cameraY: parsed.cameraY || 0,
        cameraZoom: parsed.cameraZoom || 1,
        worldSeed: parsed.worldSeed || this.generateSeed(),
        entities: new Map<string, Entity>(parsed.entities || []),
        selectedCraftingItem: parsed.selectedCraftingItem || null,
      };

      return state;
    } catch (e) {
      console.error("Failed to load state:", e);
      return null;
    }
  }
}
