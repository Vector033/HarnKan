import { z } from "zod";
import { ModelSlipSchema, SLIP_SYSTEM_PROMPT, SlipReadError, type VisionModel } from "./read";

// USD per 1M tokens for flash-class models; only used for the eval cost column.
const PRICE = { input: 0.3, output: 2.5 };

function toBase64(bytes: Uint8Array): string {
  // Works in Node, edge runtimes and browsers alike (no Buffer).
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export class GeminiVision implements VisionModel {
  readonly source = "gemini" as const;

  constructor(
    private apiKey: string,
    readonly model = "gemini-flash-latest",
  ) {}

  async read(image: Uint8Array, mimeType: string) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SLIP_SYSTEM_PROMPT }] },
        contents: [
          {
            role: "user",
            parts: [{ inlineData: { mimeType, data: toBase64(image) } }, { text: "Read this slip." }],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseJsonSchema: z.toJSONSchema(ModelSlipSchema, { target: "draft-7" }),
        },
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new SlipReadError(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
    };
    const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    let slip: unknown;
    try {
      slip = JSON.parse(text);
    } catch {
      throw new SlipReadError("Model did not return JSON");
    }
    const inputTokens = body.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = (body.usageMetadata?.candidatesTokenCount ?? 0) + (body.usageMetadata?.thoughtsTokenCount ?? 0);
    return {
      slip,
      usage: {
        inputTokens,
        outputTokens,
        costUsd: (inputTokens * PRICE.input + outputTokens * PRICE.output) / 1e6,
      },
    };
  }
}
