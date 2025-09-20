import * as PIXI from "pixi.js";
import { TILE_SIZE } from "./schemas";
import invariant from "tiny-invariant";

type TextureVariant = {
  baseColor: string;
  noiseColor: string;
  noiseOpacity: number;
};

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

type EntityTextureVariant = {
  baseColor: string;
  outlineColor: string;
  noiseColor: string;
  noiseOpacity: number;
  width: number;
  height: number;
};

const ENTITY_TEXTURE_VARIANTS: Record<string, EntityTextureVariant> = {
  furnace: {
    baseColor: "#808080", // Gray
    outlineColor: "#404040", // Dark gray
    noiseColor: "#606060", // Medium gray for noise
    noiseOpacity: 0.4,
    width: 2,
    height: 2,
  },
};

export class TextureGenerator {
  private textureCache: Map<string, PIXI.Texture[]> = new Map();
  private resourceTextures: Map<string, PIXI.Texture> = new Map();
  private entityTextures: Map<string, PIXI.Texture> = new Map();

  generateTextures(): void {
    // Generate tile textures
    Object.entries(TEXTURE_VARIANTS).forEach(([type, variants]) => {
      const textures = variants.map((variant) =>
        this.createTileTexture(variant),
      );
      this.textureCache.set(type, textures);
    });

    // Generate resource textures
    Object.entries(RESOURCE_COLORS).forEach(([resource, color]) => {
      this.resourceTextures.set(resource, this.createResourceTexture(color));
    });

    // Generate entity textures
    Object.entries(ENTITY_TEXTURE_VARIANTS).forEach(([entity, variant]) => {
      this.entityTextures.set(entity, this.createEntityTexture(variant));
    });
  }

  private createTileTexture(variant: TextureVariant): PIXI.Texture {
    const canvas = document.createElement("canvas");
    canvas.width = TILE_SIZE;
    canvas.height = TILE_SIZE;
    const ctx = canvas.getContext("2d");
    invariant(ctx, "Failed to get 2D context for tile texture");

    // Fill with base color
    ctx.fillStyle = variant.baseColor;
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

    // Add simple noise overlay
    this.addCanvasNoise(
      ctx,
      TILE_SIZE,
      TILE_SIZE,
      variant.noiseColor,
      variant.noiseOpacity,
    );

    return PIXI.Texture.from(canvas);
  }

  private createResourceTexture(color: string): PIXI.Texture {
    const canvas = document.createElement("canvas");
    canvas.width = TILE_SIZE / 2;
    canvas.height = TILE_SIZE / 2;
    const ctx = canvas.getContext("2d");
    invariant(ctx, "Failed to get 2D context for resource texture");

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(TILE_SIZE / 4, TILE_SIZE / 4, TILE_SIZE / 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1;
    ctx.stroke();

    return PIXI.Texture.from(canvas);
  }

  private createEntityTexture(variant: EntityTextureVariant): PIXI.Texture {
    const canvas = document.createElement("canvas");
    canvas.width = TILE_SIZE * variant.width;
    canvas.height = TILE_SIZE * variant.height;
    const ctx = canvas.getContext("2d");
    invariant(ctx, "Failed to get 2D context for entity texture");

    // Fill with base color
    ctx.fillStyle = variant.baseColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Add dark gray outline
    ctx.strokeStyle = variant.outlineColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

    // Add simple noise overlay
    this.addCanvasNoise(
      ctx,
      canvas.width,
      canvas.height,
      variant.noiseColor,
      variant.noiseOpacity,
    );

    return PIXI.Texture.from(canvas);
  }

  private addCanvasNoise(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    noiseColor: string,
    opacity: number,
  ): void {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Parse noise color
    const noiseRgb = this.hexToRgb(noiseColor);

    // Add random noise
    for (let i = 0; i < data.length; i += 4) {
      if (Math.random() < opacity) {
        const noise = Math.random() * 0.5 + 0.5; // 0.5 to 1.0
        data[i] = Math.floor(
          data[i] * (1 - opacity) + noiseRgb.r * opacity * noise,
        ); // R
        data[i + 1] = Math.floor(
          data[i + 1] * (1 - opacity) + noiseRgb.g * opacity * noise,
        ); // G
        data[i + 2] = Math.floor(
          data[i + 2] * (1 - opacity) + noiseRgb.b * opacity * noise,
        ); // B
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    invariant(result, `Invalid hex color: ${hex}`);
    return {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    };
  }

  getRandomTexture(type: string): PIXI.Texture {
    const textures = this.textureCache.get(type);
    invariant(
      textures && textures.length > 0,
      `No textures available for type: ${type}`,
    );
    return textures[Math.floor(Math.random() * textures.length)];
  }

  getResourceTexture(resource: string): PIXI.Texture {
    const texture = this.resourceTextures.get(resource);
    invariant(texture, `No texture available for resource: ${resource}`);
    return texture;
  }

  getEntityTexture(entity: string): PIXI.Texture {
    const texture = this.entityTextures.get(entity);
    invariant(texture, `No texture available for entity: ${entity}`);
    return texture;
  }
}
