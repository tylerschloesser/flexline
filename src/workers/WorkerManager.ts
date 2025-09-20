import {
  ChunkWorkerRequestSchema,
  ChunkWorkerResponseSchema,
  TextureWorkerRequestSchema,
  TextureWorkerResponseSchema,
  PregenerateRequestSchema,
  type ChunkWorkerRequest,
  type TextureWorkerRequest,
  type PregenerateRequest,
  type TextureVariant,
} from "./workerTypes";
import type { Chunk } from "../game/schemas";
import invariant from "tiny-invariant";

export class WorkerManager {
  private chunkWorkers: Worker[] = [];
  private textureWorkers: Worker[] = [];
  private chunkRequestId = 0;
  private textureRequestId = 0;
  private pendingChunkRequests = new Map<
    string,
    {
      resolve: (chunk: Chunk) => void;
      reject: (error: Error) => void;
    }
  >();
  private pendingTextureRequests = new Map<
    string,
    {
      resolve: (imageBitmap: ImageBitmap) => void;
      reject: (error: Error) => void;
    }
  >();

  constructor() {
    this.initializeWorkers();
  }

  private initializeWorkers(): void {
    const numChunkWorkers = Math.max(
      1,
      Math.floor(navigator.hardwareConcurrency / 2),
    );
    const numTextureWorkers = Math.max(
      1,
      Math.floor(navigator.hardwareConcurrency / 4),
    );

    for (let i = 0; i < numChunkWorkers; i++) {
      const worker = new Worker(new URL("./chunkWorker.ts", import.meta.url), {
        type: "module",
      });
      worker.addEventListener(
        "message",
        this.handleChunkWorkerMessage.bind(this),
      );
      worker.addEventListener("error", this.handleChunkWorkerError.bind(this));
      this.chunkWorkers.push(worker);
    }

    for (let i = 0; i < numTextureWorkers; i++) {
      const worker = new Worker(
        new URL("./textureWorker.ts", import.meta.url),
        {
          type: "module",
        },
      );
      worker.addEventListener(
        "message",
        this.handleTextureWorkerMessage.bind(this),
      );
      worker.addEventListener(
        "error",
        this.handleTextureWorkerError.bind(this),
      );
      this.textureWorkers.push(worker);
    }

    this.pregenerateTextures();
  }

  private handleChunkWorkerMessage(event: MessageEvent): void {
    // Validate response immediately
    const validationResult = ChunkWorkerResponseSchema.safeParse(event.data);
    invariant(
      validationResult.success,
      `Invalid chunk worker response: ${validationResult.error?.message}`,
    );

    const { id, chunk, error } = validationResult.data;

    try {
      const request = this.pendingChunkRequests.get(id);
      if (request) {
        this.pendingChunkRequests.delete(id);
        if (error) {
          request.reject(new Error(error));
        } else {
          invariant(
            chunk,
            `Chunk worker returned no chunk data for request ${id}`,
          );
          request.resolve(chunk);
        }
      }
    } catch (error) {
      console.error("Error handling chunk worker message:", error);
      const request = this.pendingChunkRequests.get(id);
      if (request) {
        this.pendingChunkRequests.delete(id);
        request.reject(
          new Error(error instanceof Error ? error.message : "Unknown error"),
        );
      }
    }
  }

  private handleChunkWorkerError(event: ErrorEvent): void {
    console.error("Chunk worker error:", event.error);
  }

  private handleTextureWorkerMessage(event: MessageEvent): void {
    // Validate response immediately using discriminated union
    const validationResult = TextureWorkerResponseSchema.safeParse(event.data);
    invariant(
      validationResult.success,
      `Invalid texture worker response: ${validationResult.error?.message}`,
    );

    const response = validationResult.data;

    // Handle based on discriminated union type
    if (
      response.type === "pregenerate-complete" ||
      response.type === "pregenerate-error"
    ) {
      // Pregenerate responses don't need further handling in WorkerManager
      return;
    }

    // TypeScript now knows this is a TextureResponse
    invariant(
      response.type === "texture",
      `Unexpected response type: ${response.type}`,
    );

    const { id, imageBitmap, error } = response;

    try {
      const request = this.pendingTextureRequests.get(id);
      if (request) {
        this.pendingTextureRequests.delete(id);
        if (error) {
          request.reject(new Error(error));
        } else {
          invariant(
            imageBitmap,
            `Texture worker returned no bitmap for request ${id}`,
          );
          request.resolve(imageBitmap);
        }
      }
    } catch (error) {
      console.error("Error handling texture worker message:", error);
      const request = this.pendingTextureRequests.get(id);
      if (request) {
        this.pendingTextureRequests.delete(id);
        request.reject(
          new Error(error instanceof Error ? error.message : "Unknown error"),
        );
      }
    }
  }

  private handleTextureWorkerError(event: ErrorEvent): void {
    console.error("Texture worker error:", event.error);
  }

  private getAvailableChunkWorker(): Worker {
    return this.chunkWorkers[this.chunkRequestId % this.chunkWorkers.length];
  }

  private getAvailableTextureWorker(): Worker {
    return this.textureWorkers[
      this.textureRequestId % this.textureWorkers.length
    ];
  }

  async generateChunk(
    chunkX: number,
    chunkY: number,
    seed: string,
  ): Promise<Chunk> {
    return new Promise((resolve, reject) => {
      const id = `chunk_${++this.chunkRequestId}`;
      this.pendingChunkRequests.set(id, { resolve, reject });

      const request: ChunkWorkerRequest = {
        id,
        chunkX,
        chunkY,
        seed,
      };

      // Validate outgoing request
      const validationResult = ChunkWorkerRequestSchema.safeParse(request);
      invariant(
        validationResult.success,
        `Invalid chunk request: ${validationResult.error?.message}`,
      );

      const worker = this.getAvailableChunkWorker();
      worker.postMessage(validationResult.data);

      setTimeout(() => {
        if (this.pendingChunkRequests.has(id)) {
          this.pendingChunkRequests.delete(id);
          reject(new Error("Chunk generation timeout"));
        }
      }, 5000);
    });
  }

  async generateTileTexture(variant: TextureVariant): Promise<ImageBitmap> {
    return new Promise((resolve, reject) => {
      const id = `texture_${++this.textureRequestId}`;
      this.pendingTextureRequests.set(id, { resolve, reject });

      const request: TextureWorkerRequest = {
        id,
        type: "tile",
        variant,
      };

      // Validate outgoing request
      const validationResult = TextureWorkerRequestSchema.safeParse(request);
      invariant(
        validationResult.success,
        `Invalid texture request: ${validationResult.error?.message}`,
      );

      const worker = this.getAvailableTextureWorker();
      worker.postMessage(validationResult.data);

      setTimeout(() => {
        if (this.pendingTextureRequests.has(id)) {
          this.pendingTextureRequests.delete(id);
          reject(new Error("Texture generation timeout"));
        }
      }, 3000);
    });
  }

  async generateResourceTexture(resourceColor: string): Promise<ImageBitmap> {
    return new Promise((resolve, reject) => {
      const id = `texture_${++this.textureRequestId}`;
      this.pendingTextureRequests.set(id, { resolve, reject });

      const request: TextureWorkerRequest = {
        id,
        type: "resource",
        resourceColor,
      };

      // Validate outgoing request
      const validationResult = TextureWorkerRequestSchema.safeParse(request);
      invariant(
        validationResult.success,
        `Invalid texture request: ${validationResult.error?.message}`,
      );

      const worker = this.getAvailableTextureWorker();
      worker.postMessage(validationResult.data);

      setTimeout(() => {
        if (this.pendingTextureRequests.has(id)) {
          this.pendingTextureRequests.delete(id);
          reject(new Error("Resource texture generation timeout"));
        }
      }, 3000);
    });
  }

  async generateChunkTexture(chunk: Chunk): Promise<ImageBitmap> {
    return new Promise((resolve, reject) => {
      const id = `texture_${++this.textureRequestId}`;
      this.pendingTextureRequests.set(id, { resolve, reject });

      const request: TextureWorkerRequest = {
        id,
        type: "chunk",
        chunk,
      };

      // Validate outgoing request
      const validationResult = TextureWorkerRequestSchema.safeParse(request);
      invariant(
        validationResult.success,
        `Invalid texture request: ${validationResult.error?.message}`,
      );

      const worker = this.getAvailableTextureWorker();
      worker.postMessage(validationResult.data);

      setTimeout(() => {
        if (this.pendingTextureRequests.has(id)) {
          this.pendingTextureRequests.delete(id);
          reject(new Error("Chunk texture generation timeout"));
        }
      }, 5000); // Longer timeout for chunk textures
    });
  }

  private async pregenerateTextures(): Promise<void> {
    const promises = this.textureWorkers.map((worker) => {
      return new Promise<void>((resolve, reject) => {
        const handler = (event: MessageEvent) => {
          if (event.data.type === "pregenerate-complete") {
            worker.removeEventListener("message", handler);
            resolve();
          } else if (event.data.type === "pregenerate-error") {
            worker.removeEventListener("message", handler);
            reject(new Error(event.data.error));
          }
        };

        worker.addEventListener("message", handler);
        const request: PregenerateRequest = { type: "pregenerate" };

        // Validate outgoing pregenerate request
        const validationResult = PregenerateRequestSchema.safeParse(request);
        invariant(
          validationResult.success,
          `Invalid pregenerate request: ${validationResult.error?.message}`,
        );

        worker.postMessage(validationResult.data);
      });
    });

    await Promise.all(promises);
    console.log("Texture pregeneration completed");
  }

  destroy(): void {
    this.chunkWorkers.forEach((worker) => worker.terminate());
    this.textureWorkers.forEach((worker) => worker.terminate());
    this.chunkWorkers = [];
    this.textureWorkers = [];
    this.pendingChunkRequests.clear();
    this.pendingTextureRequests.clear();
  }
}
