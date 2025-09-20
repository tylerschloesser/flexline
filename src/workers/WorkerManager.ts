import type {
  ChunkWorkerRequest,
  ChunkWorkerResponse,
  TextureWorkerRequest,
  TextureWorkerResponse,
  PregenerateRequest,
  TextureVariant,
} from "./workerTypes";
import type { Chunk } from "../game/schemas";

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

  private handleChunkWorkerMessage(
    event: MessageEvent<ChunkWorkerResponse>,
  ): void {
    const { id, chunk, error } = event.data;
    const request = this.pendingChunkRequests.get(id);

    if (request) {
      this.pendingChunkRequests.delete(id);
      if (error) {
        request.reject(new Error(error));
      } else {
        request.resolve(chunk);
      }
    }
  }

  private handleChunkWorkerError(event: ErrorEvent): void {
    console.error("Chunk worker error:", event.error);
  }

  private handleTextureWorkerMessage(
    event: MessageEvent<TextureWorkerResponse>,
  ): void {
    const { id, imageBitmap, error } = event.data;
    const request = this.pendingTextureRequests.get(id);

    if (request) {
      this.pendingTextureRequests.delete(id);
      if (error || !imageBitmap) {
        request.reject(new Error(error || "Failed to create texture"));
      } else {
        request.resolve(imageBitmap);
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

      const worker = this.getAvailableChunkWorker();
      worker.postMessage(request);

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

      const worker = this.getAvailableTextureWorker();
      worker.postMessage(request);

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

      const worker = this.getAvailableTextureWorker();
      worker.postMessage(request);

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

      const worker = this.getAvailableTextureWorker();
      worker.postMessage(request);

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
        worker.postMessage(request);
      });
    });

    try {
      await Promise.all(promises);
      console.log("Texture pregeneration completed");
    } catch (error) {
      console.error("Texture pregeneration failed:", error);
    }
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
