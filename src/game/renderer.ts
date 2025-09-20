import * as PIXI from "pixi.js";
import { Viewport } from "pixi-viewport";
import { GameStateManager } from "./gameState";
import { WorkerManager } from "../workers/WorkerManager";
import { TILE_SIZE, CHUNK_SIZE, ZOOM_CONFIG } from "./schemas";

export class GameRenderer {
  private app: PIXI.Application | null = null;
  private viewport: Viewport | null = null;
  private gameState: GameStateManager;
  private workerManager: WorkerManager;
  private chunkContainers: Map<string, PIXI.Container> = new Map();
  private chunkTextures: Map<string, PIXI.Texture> = new Map();
  private placeholderTexture: PIXI.Texture | null = null;
  private canvas: HTMLCanvasElement;
  private pendingChunks = new Set<string>();
  private lastVisibleBounds: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  } | null = null;

  constructor(canvas: HTMLCanvasElement, gameState: GameStateManager) {
    this.canvas = canvas;
    this.gameState = gameState;
    this.workerManager = new WorkerManager();
  }

  private calculateZoomLimits(
    viewportWidth: number,
    viewportHeight: number,
  ): { minZoom: number; maxZoom: number } {
    const vmin = Math.min(viewportWidth, viewportHeight);
    const vmax = Math.max(viewportWidth, viewportHeight);

    // Max tile size: ZOOM_CONFIG.MAX_TILE_SIZE_FACTOR * vmin (min 10 tiles per min viewport dimension)
    const maxTileSize = ZOOM_CONFIG.MAX_TILE_SIZE_FACTOR * vmin;
    const maxZoom = maxTileSize / TILE_SIZE;

    // Min tile size: vmax / ZOOM_CONFIG.MIN_TILE_SIZE_FACTOR (max 100 tiles per max viewport dimension)
    const minTileSize = vmax / ZOOM_CONFIG.MIN_TILE_SIZE_FACTOR;
    const minZoom = minTileSize / TILE_SIZE;

    // Error if the viewport makes this impossible (minZoom > maxZoom)
    if (minZoom > maxZoom) {
      throw new Error(
        `Viewport dimensions (${viewportWidth}x${viewportHeight}) make zoom configuration impossible. ` +
          `Min zoom (${minZoom.toFixed(3)}) > Max zoom (${maxZoom.toFixed(3)}). ` +
          `Consider adjusting ZOOM_CONFIG values.`,
      );
    }

    return { minZoom, maxZoom };
  }

  private validateAndClampZoom(
    zoom: number,
    viewportWidth: number,
    viewportHeight: number,
  ): number {
    const { minZoom, maxZoom } = this.calculateZoomLimits(
      viewportWidth,
      viewportHeight,
    );
    return Math.max(minZoom, Math.min(maxZoom, zoom));
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

    // Calculate zoom limits for initial viewport size with error handling
    try {
      const { minZoom, maxZoom } = this.calculateZoomLimits(
        window.innerWidth,
        window.innerHeight,
      );

      this.viewport
        .drag()
        .pinch()
        .wheel()
        .decelerate()
        .clampZoom({ minScale: minZoom, maxScale: maxZoom });
    } catch (error) {
      console.error("Error calculating initial zoom limits:", error);
      // Fallback to basic zoom controls without limits
      this.viewport.drag().pinch().wheel().decelerate();
      throw error; // Re-throw to inform the user
    }

    const state = this.gameState.getState();
    // Convert tile coordinates (1x1 units) back to world pixel coordinates for viewport
    const worldPixelX = state.cameraX * TILE_SIZE;
    const worldPixelY = state.cameraY * TILE_SIZE;
    this.viewport.moveCenter(worldPixelX, worldPixelY);

    // Validate and clamp the initial zoom
    try {
      const clampedZoom = this.validateAndClampZoom(
        state.cameraZoom,
        window.innerWidth,
        window.innerHeight,
      );
      this.viewport.setZoom(clampedZoom);
    } catch (error) {
      console.error("Error validating initial zoom:", error);
      // Fallback to default zoom
      this.viewport.setZoom(1);
    }

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

      // Recalculate and apply zoom limits for new viewport size
      try {
        const { minZoom, maxZoom } = this.calculateZoomLimits(
          window.innerWidth,
          window.innerHeight,
        );
        this.viewport.clampZoom({ minScale: minZoom, maxScale: maxZoom });

        // Validate current zoom and clamp if necessary
        const currentZoom = this.viewport.scale.x;
        const clampedZoom = this.validateAndClampZoom(
          currentZoom,
          window.innerWidth,
          window.innerHeight,
        );
        if (Math.abs(currentZoom - clampedZoom) > 0.001) {
          this.viewport.setZoom(clampedZoom);
        }
      } catch (error) {
        console.error("Error updating zoom limits on resize:", error);
      }
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
    if (
      this.lastVisibleBounds &&
      Math.abs(bounds.left - this.lastVisibleBounds.left) <
        (CHUNK_SIZE * TILE_SIZE) / 2 &&
      Math.abs(bounds.right - this.lastVisibleBounds.right) <
        (CHUNK_SIZE * TILE_SIZE) / 2 &&
      Math.abs(bounds.top - this.lastVisibleBounds.top) <
        (CHUNK_SIZE * TILE_SIZE) / 2 &&
      Math.abs(bounds.bottom - this.lastVisibleBounds.bottom) <
        (CHUNK_SIZE * TILE_SIZE) / 2
    ) {
      return;
    }

    this.lastVisibleBounds = {
      left: bounds.left,
      right: bounds.right,
      top: bounds.top,
      bottom: bounds.bottom,
    };

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

    // Remove chunks that are no longer visible (keep textures cached)
    for (const [key, container] of this.chunkContainers) {
      if (!visibleChunks.has(key)) {
        this.viewport.removeChild(container);
        container.destroy({ children: true });
        this.chunkContainers.delete(key);
        // Keep texture in cache for fast re-rendering when chunk comes back into view
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

  private async renderChunkAsync(
    chunkX: number,
    chunkY: number,
  ): Promise<void> {
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

        const chunk = await this.gameState.getOrGenerateChunkAsync(
          chunkX,
          chunkY,
        );
        const imageBitmap =
          await this.workerManager.generateChunkTexture(chunk);
        chunkTexture = PIXI.Texture.from(imageBitmap);
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

  private async initializeTextures(): Promise<void> {
    // Textures are now generated per-chunk, so this is simplified
  }

  destroy(): void {
    this.workerManager.destroy();
    if (this.app) {
      this.app.destroy(true);
    }
  }
}
