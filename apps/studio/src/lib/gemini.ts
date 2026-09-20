import { imageUsage } from "@content-gen/domain/cost";

export class GeminiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

/** Nano Banana 2. `gemini-2.5-flash-image` (el Nano Banana original) deja de existir el 2026-10-02. */
export const geminiImageModel = () => process.env.GEMINI_IMAGE_MODEL?.trim() || "gemini-3.1-flash-image";

export type GeminiAspectRatio = "1:1" | "9:16" | "16:9";

type ImagePart = { type?: unknown; data?: unknown; mime_type?: unknown };

/** La API de Interactions devuelve la imagen como un bloque `image` dentro de un paso `model_output`. */
function imageOf(body: unknown) {
  const response = body as { steps?: { type?: unknown; content?: ImagePart[] }[]; output_image?: ImagePart } | null;
  for (const step of response?.steps ?? []) {
    if (step.type !== "model_output") continue;
    for (const part of step.content ?? []) if (part.type === "image" && typeof part.data === "string") return part;
  }
  return typeof response?.output_image?.data === "string" ? response.output_image : null;
}

export async function generateGeminiImage({ prompt, aspectRatio, request = fetch }: { prompt: string; aspectRatio: GeminiAspectRatio; request?: typeof fetch }) {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new GeminiError("Falta configurar GEMINI_API_KEY.", 503);
  const model = geminiImageModel();
  const response = await request("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({ model, input: prompt, response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: aspectRatio, image_size: "1K" } }),
  });
  const body = await response.json().catch(() => null) as { error?: { message?: unknown } } | null;
  const image = imageOf(body);
  if (!response.ok || !image) throw new GeminiError(typeof body?.error?.message === "string" ? `Gemini: ${body.error.message}` : "Gemini no devolvió una imagen.", 502);
  const mimeType = typeof image.mime_type === "string" ? image.mime_type : "image/jpeg";
  return { bytes: Buffer.from(image.data as string, "base64"), mimeType, filename: `nano-banana-ad.${mimeType === "image/jpeg" ? "jpg" : "png"}`, model, usage: imageUsage(1) };
}
