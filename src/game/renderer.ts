import * as PIXI from "pixi.js";
import { Viewport } from "pixi-viewport";
import invariant from "tiny-invariant";
import { GameStateManager } from "./gameState";
import { WorkerManager } from "../workers/WorkerManager";
import { InputManager } from "./inputManager";
import { TextureGenerator } from "./textureGenerator";
import {
  TILE_SIZE,
  CHUNK_SIZE,
  ZOOM_CONFIG,
  ENTITY_DEFINITIONS,
} from "./schemas";
import type { Entity } from "./schemas";
import {
  CAMERA_MOVE_SPEED,
  MIN_FRAME_TIME,
  CANVAS_BACKGROUND_COLOR,
  WORLD_DIMENSIONS,
} from "./config";

export class GameRenderer {
  private app: PIXI.Application | null = null;
  private viewport: Viewport | null = null;
  private gameState: GameStateManager;
  private workerManager: WorkerManager;
  private inputManager: InputManager;
  private textureGenerator: TextureGenerator;
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
  private cameraMovement = { x: 0, y: 0 };
  private lastFrameTime = 0;
  private mousePosition = { x: 0, y: 0 };
  private lastMouseScreenPosition = { x: 0, y: 0 };
  private placementPreview: PIXI.Container | null = null;
  private entityContainer!: PIXI.Container;
  private hoveredEntity: Entity | null = null;
  private hoverListeners: Set<(entity: Entity | null) => void> = new Set();

  constructor(canvas: HTMLCanvasElement, gameState: GameStateManager) {
    this.canvas = canvas;
    this.gameState = gameState;
    this.workerManager = new WorkerManager();
    this.inputManager = new InputManager();
    this.textureGenerator = new TextureGenerator();
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
    invariant(
      minZoom <= maxZoom,
      `Viewport dimensions (${viewportWidth}x${viewportHeight}) make zoom configuration impossible. ` +
        `Min zoom (${minZoom.toFixed(3)}) > Max zoom (${maxZoom.toFixed(3)}). ` +
        `Consider adjusting ZOOM_CONFIG values.`,
    );

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
      backgroundColor: CANVAS_BACKGROUND_COLOR,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    // Initialize viewport
    this.viewport = new Viewport({
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      worldWidth: WORLD_DIMENSIONS.WIDTH,
      worldHeight: WORLD_DIMENSIONS.HEIGHT,
      events: this.app.renderer.events,
    });

    this.app.stage.addChild(this.viewport);

    // Create entity container for rendering entities and previews
    this.entityContainer = new PIXI.Container();
    this.entityContainer.zIndex = 1000; // Ensure entities are rendered on top
    this.entityContainer.sortableChildren = true;
    this.viewport.addChild(this.entityContainer);
    this.viewport.sortableChildren = true;

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

    this.viewport.on("clicked", (event) => {
      if (!this.viewport) return;
      const worldPoint = this.viewport.toWorld(event.screen);
      this.handleClick(worldPoint.x, worldPoint.y);
    });

    // Track mouse movement for placement preview and entity hover
    this.viewport.on("pointermove", (event) => {
      if (!this.viewport) return;
      // Store screen position for WASD camera movement updates
      this.lastMouseScreenPosition.x = event.global.x;
      this.lastMouseScreenPosition.y = event.global.y;
      // Calculate and store world position
      const worldPoint = this.viewport.toWorld(event.global);
      this.mousePosition.x = worldPoint.x;
      this.mousePosition.y = worldPoint.y;
      this.updatePlacementPreview();
      this.updateHoveredEntity();
    });

    // Clear placement preview and hover when pointer leaves the viewport
    this.viewport.on("pointerleave", () => {
      this.clearPlacementPreview();
      this.setHoveredEntity(null);
    });

    // Initialize input manager and camera movement
    this.initializeCameraControls();

    // Subscribe to game state changes
    this.gameState.subscribe(() => {
      this.renderEntities();
      this.updatePlacementPreview();
    });

    // Create placeholder texture and initialize textures
    this.createPlaceholderTexture();
    await this.initializeTextures();
    this.textureGenerator.generateTextures();
    this.updateVisibleChunks();
    this.renderEntities();
  }

  private handleClick(worldPixelX: number, worldPixelY: number): void {
    const selectedItem = this.gameState.getSelectedItem();
    const tileX = Math.floor(worldPixelX / TILE_SIZE);
    const tileY = Math.floor(worldPixelY / TILE_SIZE);

    if (selectedItem?.type === "crafted") {
      // Placing a crafted entity
      const entityType = selectedItem.itemId;
      const definition = ENTITY_DEFINITIONS[entityType];
      const { width, height } = definition;

      // Convert click position (world pixels) to tile coordinates, treating click as entity center
      const clickTileX = worldPixelX / TILE_SIZE;
      const clickTileY = worldPixelY / TILE_SIZE;

      // For even-sized entities, round to nearest integer (grid intersections)
      // For odd-sized entities, round to nearest half-integer (tile centers)
      const centerX =
        width % 2 === 0
          ? Math.round(clickTileX)
          : Math.round(clickTileX - 0.5) + 0.5;
      const centerY =
        height % 2 === 0
          ? Math.round(clickTileY)
          : Math.round(clickTileY - 0.5) + 0.5;

      // Try to place entity
      const success = this.gameState.placeEntity(entityType, centerX, centerY);
      if (success) {
        this.renderEntities();
      }
    } else if (selectedItem?.type === "inventory") {
      // Inserting inventory item into entity
      const resourceType = selectedItem.itemId;
      const entity = this.gameState.getEntityAt(tileX, tileY);

      if (entity) {
        const success = this.gameState.insertItemIntoEntity(
          entity.id,
          resourceType,
          1,
        );
        if (success) {
          // Auto-deselect if we have no more of this item
          const inventory = this.gameState.getInventory();
          if (inventory[resourceType] <= 0) {
            this.gameState.setSelectedItem(null);
          }
        }
      }
    } else {
      // No item selected - mine resource
      this.gameState.mineResource(tileX, tileY);
    }
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

  private initializeCameraControls(): void {
    this.inputManager.initialize();

    // Subscribe to movement input
    this.inputManager.onMovement((direction) => {
      this.cameraMovement = direction;
    });

    // Subscribe to key press events
    this.inputManager.onKeyPress((key) => {
      if (key === "q") {
        // Clear selected crafting item when Q is pressed
        this.gameState.setSelectedCraftingItem(null);
      }
    });

    // Start the camera movement update loop
    this.lastFrameTime = performance.now();
    this.startCameraUpdateLoop();
  }

  private startCameraUpdateLoop(): void {
    const updateCamera = (currentTime: number) => {
      if (!this.viewport) {
        requestAnimationFrame(updateCamera);
        return;
      }

      const deltaTime = Math.min(
        currentTime - this.lastFrameTime,
        MIN_FRAME_TIME,
      );
      this.lastFrameTime = currentTime;

      // Only move camera if there's input
      if (this.cameraMovement.x !== 0 || this.cameraMovement.y !== 0) {
        // Adjust speed based on zoom level (faster when zoomed out)
        const zoomAdjustedSpeed = CAMERA_MOVE_SPEED / this.viewport.scale.x;
        const moveDistance = (zoomAdjustedSpeed * deltaTime) / 1000;

        const currentCenter = this.viewport.center;
        const newX = currentCenter.x + this.cameraMovement.x * moveDistance;
        const newY = currentCenter.y + this.cameraMovement.y * moveDistance;

        this.viewport.moveCenter(newX, newY);

        // Manually trigger updates since moveCenter doesn't emit "moved" event
        const center = this.viewport.center;
        this.gameState.updateCamera(center.x, center.y, this.viewport.scale.x);
        this.updateVisibleChunks();

        // Update world mouse position and placement preview after camera movement
        this.updateMouseWorldPosition();
        this.updatePlacementPreview();
        this.updateHoveredEntity();
      }

      requestAnimationFrame(updateCamera);
    };

    requestAnimationFrame(updateCamera);
  }

  private updateMouseWorldPosition(): void {
    if (!this.viewport) return;
    // Recalculate world position from stored screen position
    const worldPoint = this.viewport.toWorld({
      x: this.lastMouseScreenPosition.x,
      y: this.lastMouseScreenPosition.y,
    });
    this.mousePosition.x = worldPoint.x;
    this.mousePosition.y = worldPoint.y;
  }

  private clearPlacementPreview(): void {
    if (this.placementPreview) {
      this.entityContainer.removeChild(this.placementPreview);
      this.placementPreview.destroy();
      this.placementPreview = null;
    }
  }

  private updatePlacementPreview(): void {
    if (!this.viewport) return;

    // Clear existing preview
    this.clearPlacementPreview();

    const selectedItem = this.gameState.getSelectedItem();
    if (!selectedItem) return;

    if (selectedItem.type === "crafted") {
      // Entity placement preview
      const entityType = selectedItem.itemId;
      const definition = ENTITY_DEFINITIONS[entityType];
      const { width, height } = definition;

      // Use current mouse position in world coordinates
      const mouseTileX = this.mousePosition.x / TILE_SIZE;
      const mouseTileY = this.mousePosition.y / TILE_SIZE;

      // For even-sized entities, round to nearest integer (grid intersections)
      // For odd-sized entities, round to nearest half-integer (tile centers)
      const centerX =
        width % 2 === 0
          ? Math.round(mouseTileX)
          : Math.round(mouseTileX - 0.5) + 0.5;
      const centerY =
        height % 2 === 0
          ? Math.round(mouseTileY)
          : Math.round(mouseTileY - 0.5) + 0.5;

      // Check if placement is valid
      const canPlace = this.gameState.canPlaceEntity(
        entityType,
        centerX,
        centerY,
      );

      // Create preview
      this.placementPreview = this.createEntitySprite(
        entityType,
        centerX,
        centerY,
      );
      this.placementPreview.alpha = 0.6;

      // Apply color tint based on validity
      if (canPlace) {
        this.placementPreview.tint = 0x00ff00; // Green tint for valid placement
      } else {
        this.placementPreview.tint = 0xff0000; // Red tint for invalid placement
      }

      this.entityContainer.addChild(this.placementPreview);
    }
    // Note: For inventory items, we don't show a placement preview since they're inserted into entities on hover
  }

  private renderEntities(): void {
    // Clear existing entities
    for (const child of this.entityContainer.children.slice()) {
      if (child !== this.placementPreview) {
        this.entityContainer.removeChild(child);
        child.destroy();
      }
    }

    // Render all entities
    const entities = this.gameState.getEntities();
    for (const entity of entities.values()) {
      const centerX = entity.x + entity.width / 2;
      const centerY = entity.y + entity.height / 2;
      const sprite = this.createEntitySprite(entity.type, centerX, centerY);
      this.entityContainer.addChild(sprite);
    }
  }

  private createEntitySprite(
    entityType: string,
    centerX: number,
    centerY: number,
  ): PIXI.Container {
    const container = new PIXI.Container();

    const texture = this.textureGenerator.getEntityTexture(entityType);
    const sprite = new PIXI.Sprite(texture);

    // Position sprite relative to center
    sprite.anchor.set(0.5, 0.5);
    container.addChild(sprite);

    container.position.set(centerX * TILE_SIZE, centerY * TILE_SIZE);
    return container;
  }

  private updateHoveredEntity(): void {
    const tileX = Math.floor(this.mousePosition.x / TILE_SIZE);
    const tileY = Math.floor(this.mousePosition.y / TILE_SIZE);
    const entity = this.gameState.getEntityAt(tileX, tileY);
    this.setHoveredEntity(entity);
  }

  private setHoveredEntity(entity: Entity | null): void {
    if (this.hoveredEntity !== entity) {
      this.hoveredEntity = entity;
      this.notifyHoverListeners(entity);
    }
  }

  private notifyHoverListeners(entity: Entity | null): void {
    this.hoverListeners.forEach((listener) => listener(entity));
  }

  onEntityHover(callback: (entity: Entity | null) => void): () => void {
    this.hoverListeners.add(callback);
    return () => {
      this.hoverListeners.delete(callback);
    };
  }

  destroy(): void {
    this.inputManager.destroy();
    this.workerManager.destroy();
    this.hoverListeners.clear();
    if (this.app) {
      this.app.destroy(true);
    }
  }
}
