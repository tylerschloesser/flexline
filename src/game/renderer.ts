import * as PIXI from "pixi.js";
import { Viewport } from "pixi-viewport";
import { GameStateManager } from "./gameState";
import { TILE_SIZE, CHUNK_SIZE } from "./schemas";
import type { Chunk } from "./schemas";

export class GameRenderer {
  private app: PIXI.Application | null = null;
  private viewport: Viewport | null = null;
  private gameState: GameStateManager;
  private chunkContainers: Map<string, PIXI.Container> = new Map();
  private chunkTextures: Map<string, PIXI.Texture> = new Map();
  private placeholderTexture: PIXI.Texture | null = null;
  private canvas: HTMLCanvasElement;
  private pendingChunks = new Set<string>();
  private lastVisibleBounds: { left: number; right: number; top: number; bottom: number } | null = null;

  constructor(canvas: HTMLCanvasElement, gameState: GameStateManager) {
    this.canvas = canvas;
    this.gameState = gameState;
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

    // Mine resource (resources are infinite, no chunk regeneration needed)
    this.gameState.mineResource(tileX, tileY);
  }

  private updateVisibleChunks(): void {
    if (!this.viewport) return;

    const bounds = this.viewport.getVisibleBounds();

    // Skip if bounds haven't changed significantly
    if (this.lastVisibleBounds &&
        Math.abs(bounds.left - this.lastVisibleBounds.left) < CHUNK_SIZE * TILE_SIZE / 2 &&
        Math.abs(bounds.right - this.lastVisibleBounds.right) < CHUNK_SIZE * TILE_SIZE / 2 &&
        Math.abs(bounds.top - this.lastVisibleBounds.top) < CHUNK_SIZE * TILE_SIZE / 2 &&
        Math.abs(bounds.bottom - this.lastVisibleBounds.bottom) < CHUNK_SIZE * TILE_SIZE / 2) {
      return;
    }

    this.lastVisibleBounds = { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom };

    const startChunkX = Math.floor(bounds.left / (CHUNK_SIZE * TILE_SIZE));
    const endChunkX = Math.ceil(bounds.right / (CHUNK_SIZE * TILE_SIZE));
    const startChunkY = Math.floor(bounds.top / (CHUNK_SIZE * TILE_SIZE));
    const endChunkY = Math.ceil(bounds.bottom / (CHUNK_SIZE * TILE_SIZE));

    const visibleChunks = new Set<string>();

    // Add visible chunks
    for (let chunkX = startChunkX; chunkX <= endChunkX; chunkX++) {
      for (let chunkY = startChunkY; chunkY <= endChunkY; chunkY++) {
        const key = `${chunkX},${chunkY}`;
        visibleChunks.add(key);

        if (!this.chunkContainers.has(key) && !this.pendingChunks.has(key)) {
          this.renderChunkAsync(chunkX, chunkY);
        }
      }
    }

    // Remove chunks that are no longer visible (simplified cleanup)
    for (const [key, container] of this.chunkContainers) {
      if (!visibleChunks.has(key)) {
        this.viewport.removeChild(container);
        container.destroy({ children: true });
        this.chunkContainers.delete(key);
        this.chunkTextures.delete(key);
      }
    }
  }

  private renderPlaceholderChunk(chunkX: number, chunkY: number): void {
    if (!this.viewport || !this.placeholderTexture) return;

    const key = `${chunkX},${chunkY}`;

    // Don't render placeholder if chunk already exists
    if (this.chunkContainers.has(key)) return;

    const sprite = new PIXI.Sprite(this.placeholderTexture);
    sprite.position.set(
      chunkX * CHUNK_SIZE * TILE_SIZE,
      chunkY * CHUNK_SIZE * TILE_SIZE,
    );
    sprite.width = CHUNK_SIZE * TILE_SIZE;
    sprite.height = CHUNK_SIZE * TILE_SIZE;
    sprite.alpha = 0.3;

    this.viewport.addChild(sprite);
    this.chunkContainers.set(key, sprite);
  }

  private async renderChunkAsync(chunkX: number, chunkY: number): Promise<void> {
    if (!this.viewport) return;

    const key = `${chunkX},${chunkY}`;

    // Early exit if chunk is already fully rendered
    if (this.chunkContainers.has(key) && this.chunkTextures.has(key)) {
      return;
    }

    // Skip if already generating this chunk
    if (this.pendingChunks.has(key)) {
      return;
    }

    this.pendingChunks.add(key);

    try {
      // Check if we already have a generated texture for this chunk
      let chunkTexture = this.chunkTextures.get(key);

      if (!chunkTexture) {
        // Only render placeholder if we don't have container yet
        if (!this.chunkContainers.has(key)) {
          this.renderPlaceholderChunk(chunkX, chunkY);
        }

        const chunk = await this.gameState.getOrGenerateChunkAsync(chunkX, chunkY);
        chunkTexture = this.generateChunkTexture(chunk);
        this.chunkTextures.set(key, chunkTexture);
      }

      // Replace placeholder with real chunk texture
      const existingSprite = this.chunkContainers.get(key);
      if (existingSprite) {
        this.viewport.removeChild(existingSprite);
        existingSprite.destroy();
      }

      const chunkSprite = new PIXI.Sprite(chunkTexture);
      chunkSprite.position.set(
        chunkX * CHUNK_SIZE * TILE_SIZE,
        chunkY * CHUNK_SIZE * TILE_SIZE,
      );

      this.viewport.addChild(chunkSprite);
      this.chunkContainers.set(key, chunkSprite);
    } catch (error) {
      console.error(`Failed to generate chunk ${chunkX},${chunkY}:`, error);
    } finally {
      this.pendingChunks.delete(key);
    }
  }

  private createPlaceholderTexture(): void {
    const canvas = document.createElement("canvas");
    canvas.width = CHUNK_SIZE * TILE_SIZE;
    canvas.height = CHUNK_SIZE * TILE_SIZE;
    const ctx = canvas.getContext("2d")!;

    ctx.fillStyle = "#404040";
    ctx.fillRect(0, 0, CHUNK_SIZE * TILE_SIZE, CHUNK_SIZE * TILE_SIZE);

    ctx.strokeStyle = "#606060";
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, CHUNK_SIZE * TILE_SIZE, CHUNK_SIZE * TILE_SIZE);

    // Add grid pattern
    ctx.strokeStyle = "#505050";
    ctx.lineWidth = 1;
    for (let i = 0; i <= CHUNK_SIZE; i++) {
      const pos = i * TILE_SIZE;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, CHUNK_SIZE * TILE_SIZE);
      ctx.moveTo(0, pos);
      ctx.lineTo(CHUNK_SIZE * TILE_SIZE, pos);
      ctx.stroke();
    }

    this.placeholderTexture = PIXI.Texture.from(canvas);
  }

  private generateChunkTexture(chunk: Chunk): PIXI.Texture {
    const canvas = document.createElement("canvas");
    canvas.width = CHUNK_SIZE * TILE_SIZE;
    canvas.height = CHUNK_SIZE * TILE_SIZE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

    const TEXTURE_VARIANTS = {
      landHigh: ["#8B7355", "#9B8365", "#8B6F47"],
      landLow: ["#5A8C3A", "#6A9C4A", "#4F7C2F"],
      waterDeep: ["#1E5A8C", "#2E6A9C", "#0E4A7C"],
      waterShallow: ["#3E8AAC", "#4E9ABC", "#5EAACC"],
    };

    const RESOURCE_COLORS = {
      iron: "#8C8C8C",
      copper: "#B87333",
      coal: "#2C2C2C",
      wood: "#654321",
      stone: "#696969",
    };

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

        // Pick random color variant for this tile
        const colors = TEXTURE_VARIANTS[tileType];
        const baseColor = colors[Math.floor(Math.random() * colors.length)];
        ctx.fillStyle = baseColor;
        ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);

        // Add noise to this tile
        const imageData = ctx.getImageData(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          if (Math.random() > 0.7) {
            const noise = Math.random() * 30 - 15;
            data[i] = Math.max(0, Math.min(255, data[i] + noise));     // R
            data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise)); // G
            data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise)); // B
          }
        }
        ctx.putImageData(imageData, x * TILE_SIZE, y * TILE_SIZE);

        // Draw resources as circles with proper colors
        if (tile.resource && tile.resourceAmount) {
          const resourceColor = RESOURCE_COLORS[tile.resource] || "#FFD700";
          ctx.fillStyle = resourceColor;
          ctx.beginPath();
          const centerX = x * TILE_SIZE + TILE_SIZE / 2;
          const centerY = y * TILE_SIZE + TILE_SIZE / 2;
          ctx.arc(centerX, centerY, TILE_SIZE / 6, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = "#000000";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

    return PIXI.Texture.from(canvas);
  }

  private async initializeTextures(): Promise<void> {
    // Textures are now generated per-chunk, so this is simplified
  }

  destroy(): void {
    if (this.app) {
      this.app.destroy(true);
    }
  }
}
