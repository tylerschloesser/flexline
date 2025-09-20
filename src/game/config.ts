/**
 * Game Configuration
 *
 * Centralized configuration for easy tweaking of game parameters.
 * All values that affect gameplay, performance, or user experience should be here.
 *
 * 🎮 EASY TWEAKING: Simply modify values below to adjust game behavior!
 */

// =============================================================================
// WORLD GENERATION
// =============================================================================

/** Size of each chunk in tiles */
export const CHUNK_SIZE = 32;

/** Size of each tile in pixels */
export const TILE_SIZE = 32;

// =============================================================================
// CAMERA & VIEWPORT
// =============================================================================

/** Camera movement speed in pixels per second */
export const CAMERA_MOVE_SPEED = 1000;

/** Zoom configuration for viewport limits */
export const ZOOM_CONFIG = {
  /** Max tile size: 0.1 * vmin (min 10 tiles per min viewport dimension) */
  MAX_TILE_SIZE_FACTOR: 0.1,
  /** Min tile size: vmax / 100 (max 100 tiles per max viewport dimension) */
  MIN_TILE_SIZE_FACTOR: 100,
} as const;

// =============================================================================
// INPUT & CONTROLS
// =============================================================================

/** Keys used for camera movement (easily customizable!) */
export const MOVEMENT_KEYS = {
  UP: "w",
  DOWN: "s",
  LEFT: "a",
  RIGHT: "d",
} as const;

// =============================================================================
// RENDERING & PERFORMANCE
// =============================================================================

/** Minimum frame time in milliseconds for camera updates (caps at ~30fps) */
export const MIN_FRAME_TIME = 33;

/** Background color for the game canvas */
export const CANVAS_BACKGROUND_COLOR = 0x1e1e1e;

/** World dimensions for the viewport (should be large enough for the game world) */
export const WORLD_DIMENSIONS = {
  WIDTH: 10000,
  HEIGHT: 10000,
} as const;

// =============================================================================
// GAME MECHANICS
// =============================================================================

/** Default inventory amounts */
export const DEFAULT_INVENTORY = {
  iron: 0,
  copper: 0,
  coal: 0,
  wood: 0,
  stone: 0,
} as const;

/** Debounce time for saving game state in milliseconds */
export const SAVE_DEBOUNCE_TIME = 500;
