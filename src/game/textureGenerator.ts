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

export class TextureGenerator {
  private textureCache: Map<string, PIXI.Texture[]> = new Map();
  private resourceTextures: Map<string, PIXI.Texture> = new Map();

  generateTextures(): void {
    Object.entries(TEXTURE_VARIANTS).forEach(([type, variants]) => {
      const textures = variants.map((variant) =>
        this.createTileTexture(variant),
      );
      this.textureCache.set(type, textures);
    });

    Object.entries(RESOURCE_COLORS).forEach(([resource, color]) => {
      this.resourceTextures.set(resource, this.createResourceTexture(color));
    });
  }

  private createTileTexture(variant: TextureVariant): PIXI.Texture {
    const canvas = document.createElement("canvas");
    canvas.width = TILE_SIZE;
    canvas.height = TILE_SIZE;
    const ctx = canvas.getContext("2d");
    invariant(ctx, "Failed to get 2D context for tile texture");

    ctx.fillStyle = variant.baseColor;
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

    const svgFilter = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${TILE_SIZE}" height="${TILE_SIZE}">
        <defs>
          <filter id="noise">
            <feTurbulence baseFrequency="0.9" numOctaves="4" seed="${Math.random() * 1000}" />
            <feColorMatrix values="0 0 0 0 0,
                                   0 0 0 0 0,
                                   0 0 0 0 0,
                                   0 0 0 1 0" />
          </filter>
        </defs>
        <rect width="${TILE_SIZE}" height="${TILE_SIZE}" fill="${variant.noiseColor}" filter="url(#noise)" opacity="${variant.noiseOpacity}" />
      </svg>
    `;

    const img = new Image();
    img.src = "data:image/svg+xml;base64," + btoa(svgFilter);

    return new Promise<PIXI.Texture>((resolve) => {
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        resolve(PIXI.Texture.from(canvas));
      };
    }) as unknown as PIXI.Texture;
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

  async initializeTextures(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const [type, variants] of Object.entries(TEXTURE_VARIANTS)) {
      const texturePromises = variants.map(async (variant) => {
        const texture = await this.createTileTextureAsync(variant);
        if (!this.textureCache.has(type)) {
          this.textureCache.set(type, []);
        }
        this.textureCache.get(type)!.push(texture);
      });
      promises.push(...texturePromises.map((p) => p.then(() => {})));
    }

    Object.entries(RESOURCE_COLORS).forEach(([resource, color]) => {
      this.resourceTextures.set(resource, this.createResourceTexture(color));
    });

    await Promise.all(promises);
  }

  private createTileTextureAsync(
    variant: TextureVariant,
  ): Promise<PIXI.Texture> {
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      canvas.width = TILE_SIZE;
      canvas.height = TILE_SIZE;
      const ctx = canvas.getContext("2d");
      invariant(ctx, "Failed to get 2D context for async tile texture");

      ctx.fillStyle = variant.baseColor;
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

      const svgFilter = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${TILE_SIZE}" height="${TILE_SIZE}">
          <defs>
            <filter id="noise">
              <feTurbulence baseFrequency="0.9" numOctaves="4" seed="${Math.random() * 1000}" />
              <feColorMatrix values="0 0 0 0 0,
                                     0 0 0 0 0,
                                     0 0 0 0 0,
                                     0 0 0 1 0" />
            </filter>
          </defs>
          <rect width="${TILE_SIZE}" height="${TILE_SIZE}" fill="${variant.noiseColor}" filter="url(#noise)" opacity="${variant.noiseOpacity}" />
        </svg>
      `;

      const img = new Image();
      img.src = "data:image/svg+xml;base64," + btoa(svgFilter);

      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        resolve(PIXI.Texture.from(canvas));
      };
    });
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
}
