import invariant from "tiny-invariant";
import { GameStateManager } from "./gameState";
import { GameRenderer } from "./renderer";

export class GameInstance {
  private static instance: GameInstance | null = null;
  private gameState: GameStateManager;
  private renderer: GameRenderer | null = null;

  private constructor() {
    this.gameState = new GameStateManager();
  }

  static getInstance(): GameInstance {
    if (!GameInstance.instance) {
      GameInstance.instance = new GameInstance();
    }
    return GameInstance.instance;
  }

  async initialize(): Promise<void> {
    const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
    invariant(canvas, "Canvas element #game-canvas not found");

    this.renderer = new GameRenderer(canvas, this.gameState);
    await this.renderer.initialize();
  }

  getGameState(): GameStateManager {
    return this.gameState;
  }

  getRenderer(): GameRenderer {
    invariant(
      this.renderer,
      "Game must be initialized before accessing renderer",
    );
    return this.renderer;
  }

  isInitialized(): boolean {
    return this.renderer !== null;
  }
}

// Export for global access
export const game = GameInstance.getInstance();
