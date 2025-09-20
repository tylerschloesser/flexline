import { z } from "zod";
import { ChunkSchema } from "../game/schemas";

export const ChunkWorkerRequestSchema = z.object({
  id: z.string().min(1),
  chunkX: z.number().int(),
  chunkY: z.number().int(),
  seed: z.string().min(1),
});

export const ChunkWorkerResponseSchema = z.object({
  id: z.string().min(1),
  chunk: ChunkSchema,
  error: z.string().optional(),
});

export const TextureVariantSchema = z.object({
  baseColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid hex color"),
  noiseColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid hex color"),
  noiseOpacity: z.number().min(0).max(1),
});

export const TextureWorkerRequestSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["tile", "resource", "chunk"]),
  variant: TextureVariantSchema.optional(),
  resourceColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid hex color")
    .optional(),
  chunk: ChunkSchema.optional(),
});

export const TextureResponseSchema = z.object({
  type: z.literal("texture"),
  id: z.string().min(1),
  imageBitmap: z.instanceof(ImageBitmap).optional(),
  error: z.string().optional(),
});

export const PregenerateRequestSchema = z.object({
  type: z.literal("pregenerate"),
});

export const PregenerateResponseSchema = z.object({
  type: z.enum(["pregenerate-complete", "pregenerate-error"]),
  error: z.string().optional(),
});

export const TextureWorkerResponseSchema = z.discriminatedUnion("type", [
  TextureResponseSchema,
  PregenerateResponseSchema,
]);

export type ChunkWorkerRequest = z.infer<typeof ChunkWorkerRequestSchema>;
export type ChunkWorkerResponse = z.infer<typeof ChunkWorkerResponseSchema>;
export type TextureVariant = z.infer<typeof TextureVariantSchema>;
export type TextureWorkerRequest = z.infer<typeof TextureWorkerRequestSchema>;
export type TextureWorkerResponse = z.infer<typeof TextureWorkerResponseSchema>;
export type TextureResponse = z.infer<typeof TextureResponseSchema>;
export type PregenerateRequest = z.infer<typeof PregenerateRequestSchema>;
export type PregenerateResponse = z.infer<typeof PregenerateResponseSchema>;
