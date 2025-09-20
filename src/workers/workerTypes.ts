import type { Chunk } from "../game/schemas";

export interface ChunkWorkerRequest {
  id: string;
  chunkX: number;
  chunkY: number;
  seed: string;
}

export interface ChunkWorkerResponse {
  id: string;
  chunk: Chunk;
  error?: string;
}

export interface TextureVariant {
  baseColor: string;
  noiseColor: string;
  noiseOpacity: number;
}

export interface TextureWorkerRequest {
  id: string;
  type: 'tile' | 'resource' | 'chunk';
  variant?: TextureVariant;
  resourceColor?: string;
  chunk?: Chunk;
}

export interface TextureWorkerResponse {
  id: string;
  imageBitmap?: ImageBitmap;
  error?: string;
}

export interface PregenerateRequest {
  type: 'pregenerate';
}

export interface PregenerateResponse {
  type: 'pregenerate-complete' | 'pregenerate-error';
  error?: string;
}