import { GeminiVision } from "./gemini";
import { readSlipWith, SlipReadError, type ModelSlip, type VisionModel } from "./read";
import type { SlipReadResult } from "./types";

export * from "./types";
export * from "./normalize";
export { finalize, readSlipWith, ModelSlipSchema, SlipReadError, REVIEW_THRESHOLD, type ModelSlip, type VisionModel } from "./read";
export { GeminiVision } from "./gemini";

/** Returns a fixed model answer; for tests and for running the app without an API key. */
export class FakeVision implements VisionModel {
  readonly source = "fake" as const;
  constructor(private answer: ModelSlip | ((image: Uint8Array) => ModelSlip)) {}
  async read(image: Uint8Array) {
    return { slip: typeof this.answer === "function" ? this.answer(image) : this.answer };
  }
}

export const ACCEPTED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

/**
 * Reads one slip image. The image is only held in memory for the duration of
 * the call and is never written anywhere by this package.
 */
export async function readSlip(
  image: Uint8Array,
  mimeType: string,
  opts: { provider?: "auto" | "gemini"; apiKey?: string; model?: string; vision?: VisionModel } = {},
): Promise<SlipReadResult> {
  if (!ACCEPTED_MIME_TYPES.includes(mimeType)) throw new SlipReadError(`Unsupported image type ${mimeType}`);
  if (image.byteLength > MAX_IMAGE_BYTES) throw new SlipReadError("Image is too large");
  let vision = opts.vision;
  if (!vision) {
    const key = opts.apiKey ?? globalThis.process?.env?.GEMINI_API_KEY;
    if (!key) throw new SlipReadError("No vision provider configured (set GEMINI_API_KEY)");
    vision = new GeminiVision(key, opts.model ?? globalThis.process?.env?.GEMINI_MODEL ?? undefined);
  }
  return readSlipWith(vision, image, mimeType);
}
