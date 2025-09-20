import { createNoise2D } from "simplex-noise";
import Prando from "prando";
import { ChunkSchema, CHUNK_SIZE } from "../game/schemas";
import type { Chunk, Tile, ResourceType } from "../game/schemas";
import invariant from "tiny-invariant";
import {
  ChunkWorkerRequestSchema,
  ChunkWorkerResponseSchema,
  type ChunkWorkerResponse,
} from "./workerTypes";

class WorkerWorldGenerator {
  private terrainNoise;
  private resourceNoise;
  private elevationNoise;
  private resourceSpawnNoise;
  private resourceAmountNoise;

  constructor(seed: string) {
    const rng = new Prando(seed);
    this.terrainNoise = createNoise2D(() => rng.next());
    this.resourceNoise = createNoise2D(() => rng.next());
    this.elevationNoise = createNoise2D(() => rng.next());
    this.resourceSpawnNoise = createNoise2D(() => rng.next());
    this.resourceAmountNoise = createNoise2D(() => rng.next());
  }

  generateChunk(chunkX: number, chunkY: number): Chunk {
    const tiles: Tile[][] = [];

    for (let y = 0; y < CHUNK_SIZE; y++) {
      const row: Tile[] = [];
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const tileX = chunkX * CHUNK_SIZE + x;
        const tileY = chunkY * CHUNK_SIZE + y;

        const terrainValue = this.terrainNoise(tileX * 0.015, tileY * 0.015);
        const elevationValue = this.elevationNoise(
          tileX * 0.025,
          tileY * 0.025,
        );
        const resourceValue = this.resourceNoise(tileX * 0.05, tileY * 0.05);
        const resourceSpawnValue = this.resourceSpawnNoise(
          tileX * 0.1,
          tileY * 0.1,
        );
        const resourceAmountValue = this.resourceAmountNoise(
          tileX * 0.08,
          tileY * 0.08,
        );

        const type = terrainValue > -0.1 ? "land" : "water";
        const elevation =
          type === "land"
            ? elevationValue > 0
              ? 1
              : 0
            : elevationValue > 0.2
              ? 0
              : 1;

        let resource: ResourceType | null = null;
        let resourceAmount: number | null = null;

        if (type === "land" && resourceSpawnValue > 0.7) {
          if (resourceValue > 0.6) {
            resource = "iron";
          } else if (resourceValue > 0.3) {
            resource = "copper";
          } else if (resourceValue > 0) {
            resource = "coal";
          } else if (resourceValue > -0.3) {
            resource = "stone";
          } else {
            resource = "wood";
          }
          resourceAmount = Math.floor((resourceAmountValue + 1) * 25) + 50;
        }

        row.push({
          type,
          elevation,
          resource,
          resourceAmount,
        });
      }
      tiles.push(row);
    }

    return {
      x: chunkX,
      y: chunkY,
      tiles,
    };
  }
}

let generator: WorkerWorldGenerator | null = null;
const chunkCache = new Map<string, Chunk>();

self.addEventListener("message", (event: MessageEvent) => {
  // Validate incoming request immediately
  const validationResult = ChunkWorkerRequestSchema.safeParse(event.data);
  invariant(
    validationResult.success,
    `Invalid request: ${validationResult.error?.message}`,
  );

  const { id, chunkX, chunkY, seed } = validationResult.data;
  let response: ChunkWorkerResponse;

  try {
    if (!generator || generator.constructor.name === "WorkerWorldGenerator") {
      generator = new WorkerWorldGenerator(seed);
    }

    const cacheKey = `${chunkX},${chunkY}`;
    let chunk = chunkCache.get(cacheKey);

    if (!chunk) {
      chunk = generator.generateChunk(chunkX, chunkY);

      // Validate generated chunk
      const chunkValidationResult = ChunkSchema.safeParse(chunk);
      invariant(
        chunkValidationResult.success,
        `Invalid chunk data: ${chunkValidationResult.error?.message}`,
      );

      chunkCache.set(cacheKey, chunk);
    }

    response = { id, chunk };

    // Validate outgoing response
    const responseValidationResult =
      ChunkWorkerResponseSchema.safeParse(response);
    invariant(
      responseValidationResult.success,
      `Invalid response format: ${responseValidationResult.error?.message}`,
    );

    self.postMessage(response);
  } catch (error) {
    response = {
      id,
      chunk: { x: 0, y: 0, tiles: [] },
      error: error instanceof Error ? error.message : "Unknown error",
    };
    self.postMessage(response);
  }
});
