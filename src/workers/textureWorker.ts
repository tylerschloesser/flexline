import { TILE_SIZE, CHUNK_SIZE } from "../game/schemas";
import type { Chunk } from "../game/schemas";
import invariant from "tiny-invariant";
import {
  TextureWorkerRequestSchema,
  TextureWorkerResponseSchema,
  PregenerateRequestSchema,
  PregenerateResponseSchema,
  type TextureWorkerResponse,
  type TextureVariant,
  type PregenerateResponse,
} from "./workerTypes";

const TEXTURE_VARIANTS: Record<string, TextureVariant[]> = {
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

const RESOURCE_COLORS: Record<string, string> = {
  iron: "#8C8C8C",
  copper: "#B87333",
  coal: "#2C2C2C",
  wood: "#654321",
  stone: "#696969",
};

const textureCache = new Map<string, ImageBitmap>();

async function createTileTexture(
  variant: TextureVariant,
): Promise<ImageBitmap> {
  const cacheKey = `tile_${variant.baseColor}_${variant.noiseColor}_${variant.noiseOpacity}`;

  if (textureCache.has(cacheKey)) {
    return textureCache.get(cacheKey)!;
  }

  const canvas = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
  const ctx = canvas.getContext("2d");
  invariant(ctx, "Failed to get 2D context for tile texture");

  // Create a simple solid color texture instead of SVG noise for now
  ctx.fillStyle = variant.baseColor;
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

  // Add simple noise pattern using canvas operations
  ctx.fillStyle = variant.noiseColor;
  ctx.globalAlpha = variant.noiseOpacity;

  // Create simple noise pattern
  const imageData = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    if (Math.random() > 0.5) {
      const noise = Math.random() * 50 - 25;
      data[i] = Math.max(0, Math.min(255, data[i] + noise)); // R
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise)); // G
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise)); // B
    }
  }

  ctx.putImageData(imageData, 0, 0);
  ctx.globalAlpha = 1.0;

  const imageBitmap = await createImageBitmap(canvas);
  textureCache.set(cacheKey, imageBitmap);
  return imageBitmap;
}

async function createChunkTexture(chunk: Chunk): Promise<ImageBitmap> {
  const canvas = new OffscreenCanvas(
    CHUNK_SIZE * TILE_SIZE,
    CHUNK_SIZE * TILE_SIZE,
  );
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  invariant(ctx, "Failed to get 2D context for chunk texture");

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
      const imageData = ctx.getImageData(
        x * TILE_SIZE,
        y * TILE_SIZE,
        TILE_SIZE,
        TILE_SIZE,
      );
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        if (Math.random() > 0.7) {
          const noise = Math.random() * 30 - 15;
          data[i] = Math.max(0, Math.min(255, data[i] + noise)); // R
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

  return await createImageBitmap(canvas);
}

async function createResourceTexture(color: string): Promise<ImageBitmap> {
  const cacheKey = `resource_${color}`;

  if (textureCache.has(cacheKey)) {
    return textureCache.get(cacheKey)!;
  }

  const canvas = new OffscreenCanvas(TILE_SIZE / 2, TILE_SIZE / 2);
  const ctx = canvas.getContext("2d");
  invariant(ctx, "Failed to get 2D context for resource texture");

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(TILE_SIZE / 4, TILE_SIZE / 4, TILE_SIZE / 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1;
  ctx.stroke();

  const imageBitmap = await createImageBitmap(canvas);
  textureCache.set(cacheKey, imageBitmap);
  return imageBitmap;
}

self.addEventListener("message", async (event: MessageEvent) => {
  // Check if this is a pregenerate request first
  const pregenerateValidation = PregenerateRequestSchema.safeParse(event.data);
  if (pregenerateValidation.success) {
    await handlePregenerateRequest();
    return;
  }

  // Validate texture request immediately
  const validationResult = TextureWorkerRequestSchema.safeParse(event.data);
  invariant(
    validationResult.success,
    `Invalid request: ${validationResult.error?.message}`,
  );

  const { id, type, variant, resourceColor, chunk } = validationResult.data;
  let response: TextureWorkerResponse;

  try {
    let imageBitmap: ImageBitmap;

    if (type === "tile" && variant) {
      imageBitmap = await createTileTexture(variant);
    } else if (type === "resource" && resourceColor) {
      imageBitmap = await createResourceTexture(resourceColor);
    } else if (type === "chunk" && chunk) {
      imageBitmap = await createChunkTexture(chunk);
    } else {
      invariant(
        false,
        `Invalid texture request parameters: type=${type}, missing required data`,
      );
    }

    response = { id, imageBitmap };

    // Validate outgoing response
    const responseValidationResult =
      TextureWorkerResponseSchema.safeParse(response);
    invariant(
      responseValidationResult.success,
      `Invalid response format: ${responseValidationResult.error?.message}`,
    );

    self.postMessage(response, { transfer: [imageBitmap] });
  } catch (error) {
    response = {
      id,
      error: error instanceof Error ? error.message : "Unknown error",
    };
    self.postMessage(response);
  }
});

async function handlePregenerateRequest(): Promise<void> {
  try {
    for (const [, variants] of Object.entries(TEXTURE_VARIANTS)) {
      for (const variant of variants) {
        await createTileTexture(variant);
      }
    }

    for (const [, color] of Object.entries(RESOURCE_COLORS)) {
      await createResourceTexture(color);
    }

    const response: PregenerateResponse = { type: "pregenerate-complete" };

    // Validate pregenerate response
    const validationResult = PregenerateResponseSchema.safeParse(response);
    invariant(
      validationResult.success,
      `Invalid pregenerate response: ${validationResult.error?.message}`,
    );

    self.postMessage(response);
  } catch (error) {
    const errorResponse: PregenerateResponse = {
      type: "pregenerate-error",
      error:
        error instanceof Error ? error.message : "Unknown pregenerate error",
    };
    self.postMessage(errorResponse);
  }
}
