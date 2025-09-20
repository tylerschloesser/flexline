import type { GameState, Chunk, Inventory, ResourceType } from "./schemas";
import { WorldGenerator } from "./worldGenerator";

export class GameStateManager {
  private state: GameState;
  private worldGenerator: WorldGenerator;
  private listeners: Set<() => void> = new Set();
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.worldGenerator = new WorldGenerator();
    this.state = this.loadState() || this.createInitialState();
  }

  private createInitialState(): GameState {
    return {
      chunks: new Map(),
      inventory: {
        iron: 0,
        copper: 0,
        coal: 0,
        wood: 0,
        stone: 0,
      },
      craftedItems: {},
      cameraX: 0,
      cameraY: 0,
      cameraZoom: 1,
    };
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
    }, 500);
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

  mineResource(worldX: number, worldY: number): boolean {
    const { chunkX, chunkY } = this.worldGenerator.getChunkCoordinates(
      worldX,
      worldY,
    );
    const chunk = this.getOrGenerateChunk(chunkX, chunkY);

    const tileX = Math.floor(worldX) - chunkX * 32;
    const tileY = Math.floor(worldY) - chunkY * 32;

    if (tileX < 0 || tileX >= 32 || tileY < 0 || tileY >= 32) {
      return false;
    }

    const tile = chunk.tiles[tileY][tileX];

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

  updateCamera(x: number, y: number, zoom: number): void {
    this.state.cameraX = x;
    this.state.cameraY = y;
    this.state.cameraZoom = zoom;
    this.notify();
  }

  getInventory(): Inventory {
    return { ...this.state.inventory };
  }

  getCraftedItems(): Record<string, number> {
    return { ...this.state.craftedItems };
  }

  resetState(): void {
    this.state = this.createInitialState();
    localStorage.removeItem("gameState");
    this.notify();
  }

  private saveState(): void {
    // Only save essential state, not chunk data (chunks will be regenerated)
    const essentialState = {
      inventory: this.state.inventory,
      craftedItems: this.state.craftedItems,
      cameraX: this.state.cameraX,
      cameraY: this.state.cameraY,
      cameraZoom: this.state.cameraZoom,
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
      if (!saved) return null;

      const parsed = JSON.parse(saved);

      // Merge saved essential state with default state structure
      const state = {
        chunks: new Map(), // Start with empty chunks (will be generated on demand)
        inventory: parsed.inventory || {
          iron: 0,
          copper: 0,
          coal: 0,
          wood: 0,
          stone: 0,
        },
        craftedItems: parsed.craftedItems || {},
        cameraX: parsed.cameraX || 0,
        cameraY: parsed.cameraY || 0,
        cameraZoom: parsed.cameraZoom || 1,
      };

      return state;
    } catch (e) {
      console.error("Failed to load state:", e);
      return null;
    }
  }
}
