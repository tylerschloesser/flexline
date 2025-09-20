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
    if (!canvas) {
      throw new Error("Canvas element #game-canvas not found");
    }

    this.renderer = new GameRenderer(canvas, this.gameState);
    await this.renderer.initialize();
  }

  getGameState(): GameStateManager {
    return this.gameState;
  }

  getRenderer(): GameRenderer | null {
    return this.renderer;
  }
}

// Initialize the game when the DOM is ready
if (typeof window !== "undefined") {
  const initGame = async () => {
    try {
      const game = GameInstance.getInstance();
      await game.initialize();
      console.log("Game initialized successfully");
    } catch (error) {
      console.error("Failed to initialize game:", error);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGame);
  } else {
    initGame();
  }
}

// Export for global access
export const game = GameInstance.getInstance();
