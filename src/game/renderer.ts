import * as PIXI from "pixi.js";
import { Viewport } from "pixi-viewport";
import { GameStateManager } from "./gameState";
import { TextureGenerator } from "./textureGenerator";
import { TILE_SIZE, CHUNK_SIZE } from "./schemas";

export class GameRenderer {
  private app: PIXI.Application | null = null;
  private viewport: Viewport | null = null;
  private gameState: GameStateManager;
  private textureGenerator: TextureGenerator;
  private chunkContainers: Map<string, PIXI.Container> = new Map();
  private resourceSprites: Map<string, PIXI.Sprite> = new Map();
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, gameState: GameStateManager) {
    this.canvas = canvas;
    this.gameState = gameState;
    this.textureGenerator = new TextureGenerator();
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
    this.viewport.moveCenter(state.cameraX, state.cameraY);
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

    // Initialize textures and render initial chunks
    await this.textureGenerator.initializeTextures();
    this.updateVisibleChunks();
  }

  private handleClick(worldX: number, worldY: number): void {
    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldY / TILE_SIZE);
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

        if (!this.chunkContainers.has(key)) {
          this.renderChunk(chunkX, chunkY);
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
            const resourceKey = `${chunkX * CHUNK_SIZE + x},${chunkY * CHUNK_SIZE + y}`;
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

  private renderChunk(chunkX: number, chunkY: number): void {
    if (!this.viewport) return;

    const chunk = this.gameState.getOrGenerateChunk(chunkX, chunkY);
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

        const texture = this.textureGenerator.getRandomTexture(tileType);
        if (texture) {
          const sprite = new PIXI.Sprite(texture);
          sprite.position.set(x * TILE_SIZE, y * TILE_SIZE);
          container.addChild(sprite);
        }

        if (tile.resource && tile.resourceAmount) {
          const resourceTexture = this.textureGenerator.getResourceTexture(
            tile.resource,
          );
          if (resourceTexture) {
            const resourceSprite = new PIXI.Sprite(resourceTexture);
            resourceSprite.position.set(
              x * TILE_SIZE + TILE_SIZE / 4,
              y * TILE_SIZE + TILE_SIZE / 4,
            );
            resourceSprite.interactive = true;
            resourceSprite.cursor = "pointer";
            container.addChild(resourceSprite);

            const worldX = chunkX * CHUNK_SIZE + x;
            const worldY = chunkY * CHUNK_SIZE + y;
            this.resourceSprites.set(`${worldX},${worldY}`, resourceSprite);
          }
        }
      }
    }

    this.viewport.addChild(container);
    this.chunkContainers.set(`${chunkX},${chunkY}`, container);
  }

  destroy(): void {
    if (this.app) {
      this.app.destroy(true);
    }
  }
}
