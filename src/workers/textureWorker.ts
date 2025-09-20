import { TILE_SIZE } from "../game/schemas";

interface TextureVariant {
  baseColor: string;
  noiseColor: string;
  noiseOpacity: number;
}

interface TextureRequest {
  id: string;
  type: 'tile' | 'resource';
  variant?: TextureVariant;
  resourceColor?: string;
}

interface TextureResponse {
  id: string;
  imageBitmap: ImageBitmap;
  error?: string;
}

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

async function createTileTexture(variant: TextureVariant): Promise<ImageBitmap> {
  const cacheKey = `tile_${variant.baseColor}_${variant.noiseColor}_${variant.noiseOpacity}`;

  if (textureCache.has(cacheKey)) {
    return textureCache.get(cacheKey)!;
  }

  try {
    const canvas = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
    const ctx = canvas.getContext('2d')!;

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
        data[i] = Math.max(0, Math.min(255, data[i] + noise));     // R
        data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise)); // G
        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise)); // B
      }
    }

    ctx.putImageData(imageData, 0, 0);
    ctx.globalAlpha = 1.0;

    const imageBitmap = await createImageBitmap(canvas);
    textureCache.set(cacheKey, imageBitmap);
    return imageBitmap;
  } catch {
    // Create a simple fallback texture
    const canvas = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = variant.baseColor || '#808080';
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

    const imageBitmap = await createImageBitmap(canvas);
    textureCache.set(cacheKey, imageBitmap);
    return imageBitmap;
  }
}

async function createResourceTexture(color: string): Promise<ImageBitmap> {
  const cacheKey = `resource_${color}`;

  if (textureCache.has(cacheKey)) {
    return textureCache.get(cacheKey)!;
  }

  try {
    const canvas = new OffscreenCanvas(TILE_SIZE / 2, TILE_SIZE / 2);
    const ctx = canvas.getContext('2d')!;

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
  } catch {
    // Create a simple fallback texture
    const canvas = new OffscreenCanvas(TILE_SIZE / 2, TILE_SIZE / 2);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = color || '#808080';
    ctx.fillRect(0, 0, TILE_SIZE / 2, TILE_SIZE / 2);

    const imageBitmap = await createImageBitmap(canvas);
    textureCache.set(cacheKey, imageBitmap);
    return imageBitmap;
  }
}

self.addEventListener('message', async (event: MessageEvent<TextureRequest>) => {
  const { id, type, variant, resourceColor } = event.data;

  try {
    let imageBitmap: ImageBitmap;

    if (type === 'tile' && variant) {
      imageBitmap = await createTileTexture(variant);
    } else if (type === 'resource' && resourceColor) {
      imageBitmap = await createResourceTexture(resourceColor);
    } else {
      throw new Error('Invalid texture request parameters');
    }

    const response: TextureResponse = { id, imageBitmap };
    self.postMessage(response, { transfer: [imageBitmap] });
  } catch (error) {
    // Create a simple fallback ImageBitmap
    const fallbackCanvas = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
    const fallbackCtx = fallbackCanvas.getContext('2d')!;
    fallbackCtx.fillStyle = '#808080';
    fallbackCtx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

    try {
      const fallbackBitmap = await createImageBitmap(fallbackCanvas);
      const response: TextureResponse = {
        id,
        imageBitmap: fallbackBitmap,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      self.postMessage(response, { transfer: [fallbackBitmap] });
    } catch (fallbackError) {
      // If even the fallback fails, send error without bitmap
      console.error('Failed to create fallback ImageBitmap:', fallbackError);
    }
  }
});

self.addEventListener('message', async (event) => {
  if (event.data.type === 'pregenerate') {
    try {
      for (const [, variants] of Object.entries(TEXTURE_VARIANTS)) {
        for (const variant of variants) {
          await createTileTexture(variant);
        }
      }

      for (const [, color] of Object.entries(RESOURCE_COLORS)) {
        await createResourceTexture(color);
      }

      self.postMessage({ type: 'pregenerate-complete' });
    } catch (error) {
      self.postMessage({
        type: 'pregenerate-error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});