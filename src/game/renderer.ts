import * as PIXI from "pixi.js";
import { Viewport } from "pixi-viewport";
import { GameStateManager } from "./gameState";
import { WorkerManager } from "../workers/WorkerManager";
import { TILE_SIZE, CHUNK_SIZE } from "./schemas";

export class GameRenderer {
  private app: PIXI.Application | null = null;
  private viewport: Viewport | null = null;
  private gameState: GameStateManager;
  private workerManager: WorkerManager;
  private chunkContainers: Map<string, PIXI.Container> = new Map();
  private resourceSprites: Map<string, PIXI.Sprite> = new Map();
  private textureCache: Map<string, PIXI.Texture[]> = new Map();
  private resourceTextureCache: Map<string, PIXI.Texture> = new Map();
  private placeholderTexture: PIXI.Texture | null = null;
  private canvas: HTMLCanvasElement;
  private pendingChunks = new Set<string>();

  constructor(canvas: HTMLCanvasElement, gameState: GameStateManager) {
    this.canvas = canvas;
    this.gameState = gameState;
    this.workerManager = new WorkerManager();
  }

  async initialize(): Promise<void> {
    // Initialize PIXI Application using the constructor
    this.app = new PIXI.Application();
    await this.app.init({
      canvas: this.canvas,
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: 0x1e1e1e,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    // Initialize viewport
    this.viewport = new Viewport({
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      worldWidth: 10000,
      worldHeight: 10000,
      events: this.app.renderer.events,
    });

    this.app.stage.addChild(this.viewport);

    this.viewport.drag().pinch().wheel().decelerate();

    const state = this.gameState.getState();
    // Convert tile coordinates (1x1 units) back to world pixel coordinates for viewport
    const worldPixelX = state.cameraX * TILE_SIZE;
    const worldPixelY = state.cameraY * TILE_SIZE;
    console.log("Restoring camera position:", {
      tileX: state.cameraX, tileY: state.cameraY,
      worldPixelX, worldPixelY, zoom: state.cameraZoom
    });
    this.viewport.moveCenter(worldPixelX, worldPixelY);
    this.viewport.setZoom(state.cameraZoom);

    this.viewport.on("moved", () => {
      if (!this.viewport) return;
      const center = this.viewport.center;
      this.gameState.updateCamera(center.x, center.y, this.viewport.scale.x);
      this.updateVisibleChunks();
    });

    this.viewport.on("zoomed", () => {
      if (!this.viewport) return;
      const center = this.viewport.center;
      this.gameState.updateCamera(center.x, center.y, this.viewport.scale.x);
    });

    window.addEventListener("resize", () => {
      if (!this.app || !this.viewport) return;
      this.app.renderer.resize(window.innerWidth, window.innerHeight);
      this.viewport.resize(window.innerWidth, window.innerHeight);
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.viewport.on("clicked", (event: any) => {
      if (!this.viewport) return;
      const worldPoint = this.viewport.toWorld(event.data.global);
      this.handleClick(worldPoint.x, worldPoint.y);
    });

    // Create placeholder texture and initialize textures
    this.createPlaceholderTexture();
    await this.initializeTextures();
    this.updateVisibleChunks();
  }

  private handleClick(worldPixelX: number, worldPixelY: number): void {
    // Convert world pixel coordinates to tile coordinates (1x1 units)
    const tileX = Math.floor(worldPixelX / TILE_SIZE);
    const tileY = Math.floor(worldPixelY / TILE_SIZE);
    this.gameState.mineResource(tileX, tileY);
  }

  private updateVisibleChunks(): void {
    if (!this.viewport) return;

    const bounds = this.viewport.getVisibleBounds();

    const startChunkX = Math.floor(bounds.left / (CHUNK_SIZE * TILE_SIZE));
    const endChunkX = Math.ceil(bounds.right / (CHUNK_SIZE * TILE_SIZE));
    const startChunkY = Math.floor(bounds.top / (CHUNK_SIZE * TILE_SIZE));
    const endChunkY = Math.ceil(bounds.bottom / (CHUNK_SIZE * TILE_SIZE));

    const visibleChunks = new Set<string>();

    for (let chunkX = startChunkX; chunkX <= endChunkX; chunkX++) {
      for (let chunkY = startChunkY; chunkY <= endChunkY; chunkY++) {
        const key = `${chunkX},${chunkY}`;
        visibleChunks.add(key);

        if (!this.chunkContainers.has(key) && !this.pendingChunks.has(key)) {
          this.renderChunkAsync(chunkX, chunkY);
        }
      }
    }

    this.chunkContainers.forEach((container, key) => {
      if (!visibleChunks.has(key)) {
        if (this.viewport) {
          this.viewport.removeChild(container);
        }
        container.destroy({ children: true });
        this.chunkContainers.delete(key);

        const [chunkX, chunkY] = key.split(",").map(Number);
        for (let y = 0; y < CHUNK_SIZE; y++) {
          for (let x = 0; x < CHUNK_SIZE; x++) {
            const tileX = chunkX * CHUNK_SIZE + x;
            const tileY = chunkY * CHUNK_SIZE + y;
            const resourceKey = `${tileX},${tileY}`;
            const resourceSprite = this.resourceSprites.get(resourceKey);
            if (resourceSprite) {
              resourceSprite.destroy();
              this.resourceSprites.delete(resourceKey);
            }
          }
        }
      }
    });
  }

  private renderPlaceholderChunk(chunkX: number, chunkY: number): void {
    if (!this.viewport || !this.placeholderTexture) return;

    const container = new PIXI.Container();
    container.position.set(
      chunkX * CHUNK_SIZE * TILE_SIZE,
      chunkY * CHUNK_SIZE * TILE_SIZE,
    );

    for (let y = 0; y < CHUNK_SIZE; y++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const sprite = new PIXI.Sprite(this.placeholderTexture);
        sprite.position.set(x * TILE_SIZE, y * TILE_SIZE);
        sprite.alpha = 0.3;
        container.addChild(sprite);
      }
    }

    this.viewport.addChild(container);
    this.chunkContainers.set(`${chunkX},${chunkY}`, container);
  }

  private async renderChunkAsync(chunkX: number, chunkY: number): Promise<void> {
    if (!this.viewport) return;

    const key = `${chunkX},${chunkY}`;
    this.pendingChunks.add(key);

    this.renderPlaceholderChunk(chunkX, chunkY);

    try {
      const chunk = await this.gameState.getOrGenerateChunkAsync(chunkX, chunkY);

      if (this.chunkContainers.has(key)) {
        const oldContainer = this.chunkContainers.get(key)!;
        if (this.viewport) {
          this.viewport.removeChild(oldContainer);
        }
        oldContainer.destroy({ children: true });
      }

      const container = new PIXI.Container();
      container.position.set(
        chunkX * CHUNK_SIZE * TILE_SIZE,
        chunkY * CHUNK_SIZE * TILE_SIZE,
      );

      for (let y = 0; y < CHUNK_SIZE; y++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const tile = chunk.tiles[y][x];
          const tileType =
            tile.type === "land"
              ? tile.elevation > 0
                ? "landHigh"
                : "landLow"
              : tile.elevation > 0
                ? "waterShallow"
                : "waterDeep";

          const texture = this.getRandomTexture(tileType);
          if (texture) {
            const sprite = new PIXI.Sprite(texture);
            sprite.position.set(x * TILE_SIZE, y * TILE_SIZE);
            container.addChild(sprite);
          }

          if (tile.resource && tile.resourceAmount) {
            const resourceTexture = this.getResourceTexture(tile.resource);
            if (resourceTexture) {
              const resourceSprite = new PIXI.Sprite(resourceTexture);
              resourceSprite.position.set(
                x * TILE_SIZE + TILE_SIZE / 4,
                y * TILE_SIZE + TILE_SIZE / 4,
              );
              resourceSprite.interactive = true;
              resourceSprite.cursor = "pointer";
              container.addChild(resourceSprite);

              const tileX = chunkX * CHUNK_SIZE + x;
              const tileY = chunkY * CHUNK_SIZE + y;
              this.resourceSprites.set(`${tileX},${tileY}`, resourceSprite);
            }
          }
        }
      }

      if (this.viewport) {
        this.viewport.addChild(container);
      }
      this.chunkContainers.set(key, container);
    } catch (error) {
      console.error(`Failed to generate chunk ${chunkX},${chunkY}:`, error);
    } finally {
      this.pendingChunks.delete(key);
    }
  }

  private createPlaceholderTexture(): void {
    const canvas = document.createElement("canvas");
    canvas.width = TILE_SIZE;
    canvas.height = TILE_SIZE;
    const ctx = canvas.getContext("2d")!;

    ctx.fillStyle = "#404040";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

    ctx.strokeStyle = "#606060";
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, TILE_SIZE, TILE_SIZE);

    this.placeholderTexture = PIXI.Texture.from(canvas);
  }

  private async initializeTextures(): Promise<void> {
    const TEXTURE_VARIANTS = {
      landHigh: [
        { baseColor: "#8B7355", noiseColor: "#6B5645", noiseOpacity: 0.3 },
        { baseColor: "#9B8365", noiseColor: "#7B6355", noiseOpacity: 0.35 },
        { baseColor: "#8B6F47", noiseColor: "#6B5037", noiseOpacity: 0.4 },
      ],
      landLow: [
        { baseColor: "#5A8C3A", noiseColor: "#4A7C2A", noiseOpacity: 0.3 },
        { baseColor: "#6A9C4A", noiseColor: "#5A8C3A", noiseOpacity: 0.35 },
        { baseColor: "#4F7C2F", noiseColor: "#3F6C1F", noiseOpacity: 0.4 },
      ],
      waterDeep: [
        { baseColor: "#1E5A8C", noiseColor: "#0E4A7C", noiseOpacity: 0.4 },
        { baseColor: "#2E6A9C", noiseColor: "#1E5A8C", noiseOpacity: 0.35 },
        { baseColor: "#0E4A7C", noiseColor: "#003A6C", noiseOpacity: 0.45 },
      ],
      waterShallow: [
        { baseColor: "#3E8AAC", noiseColor: "#2E7A9C", noiseOpacity: 0.3 },
        { baseColor: "#4E9ABC", noiseColor: "#3E8AAC", noiseOpacity: 0.35 },
        { baseColor: "#5EAACC", noiseColor: "#4E9ABC", noiseOpacity: 0.25 },
      ],
    };

    const RESOURCE_COLORS = {
      iron: "#8C8C8C",
      copper: "#B87333",
      coal: "#2C2C2C",
      wood: "#654321",
      stone: "#696969",
    };

    try {
      for (const [type, variants] of Object.entries(TEXTURE_VARIANTS)) {
        const textures: PIXI.Texture[] = [];
        for (const variant of variants) {
          try {
            const imageBitmap = await this.workerManager.generateTileTexture(variant);
            const texture = PIXI.Texture.from(imageBitmap);
            textures.push(texture);
          } catch (error) {
            console.warn(`Failed to generate texture for ${type}:`, error);
            if (this.placeholderTexture) {
              textures.push(this.placeholderTexture);
            }
          }
        }
        this.textureCache.set(type, textures);
      }

      for (const [resource, color] of Object.entries(RESOURCE_COLORS)) {
        try {
          const imageBitmap = await this.workerManager.generateResourceTexture(color);
          const texture = PIXI.Texture.from(imageBitmap);
          this.resourceTextureCache.set(resource, texture);
        } catch (error) {
          console.warn(`Failed to generate resource texture for ${resource}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to initialize textures:', error);
    }
  }

  private getRandomTexture(type: string): PIXI.Texture | undefined {
    const textures = this.textureCache.get(type);
    if (!textures || textures.length === 0) return this.placeholderTexture || undefined;
    return textures[Math.floor(Math.random() * textures.length)];
  }

  private getResourceTexture(resource: string): PIXI.Texture | undefined {
    return this.resourceTextureCache.get(resource);
  }

  destroy(): void {
    this.workerManager.destroy();
    if (this.app) {
      this.app.destroy(true);
    }
  }
}
