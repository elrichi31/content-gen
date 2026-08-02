import { z } from "zod";
import { openAiRequest } from "./openai.ts";

export const carouselImageInputSchema = z.object({ source: z.enum(["openai", "unsplash"]), prompt: z.string().trim().min(3).max(500), campaignId: z.string().min(1).optional() });
const maxImageBytes = 10 * 1024 * 1024;

export async function limitedImageBytes(response: Response) {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxImageBytes) throw new Error("La imagen supera el límite de 10 MB.");
  const reader = response.body?.getReader(); if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > maxImageBytes) { await reader.cancel(); throw new Error("La imagen supera el límite de 10 MB."); } chunks.push(part.value); }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

export async function createRemoteImage(input: z.infer<typeof carouselImageInputSchema>, request: typeof fetch = fetch) {
  if (input.source === "openai") {
    const key = process.env.OPENAI_API_KEY; const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
    if (!key) throw new Error("Falta configurar OPENAI_API_KEY.");
    const response = await openAiRequest("image", request, "https://api.openai.com/v1/images/generations", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(120_000), body: JSON.stringify({ model, prompt: input.prompt, size: "1024x1536", quality: "low", output_format: "webp" }) });
    const body = await response.json().catch(() => null) as { data?: { b64_json?: unknown }[]; error?: { message?: unknown } } | null;
    const image = body?.data?.[0]?.b64_json;
    if (!response.ok || typeof image !== "string") throw new Error(typeof body?.error?.message === "string" ? `OpenAI: ${body.error.message}` : "OpenAI no devolvió una imagen.");
    const bytes = Buffer.from(image, "base64"); if (bytes.length > maxImageBytes) throw new Error("La imagen supera el límite de 10 MB.");
    return { bytes, mimeType: "image/webp", filename: "openai-image.webp" };
  }
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) throw new Error("Falta configurar UNSPLASH_ACCESS_KEY.");
  const search = await request(`https://api.unsplash.com/search/photos?per_page=1&query=${encodeURIComponent(input.prompt)}`, { headers: { Authorization: `Client-ID ${key}` }, signal: AbortSignal.timeout(30_000) });
  const result = await search.json().catch(() => null) as { results?: { urls?: { regular?: unknown } }[] } | null; const url = result?.results?.[0]?.urls?.regular;
  if (!search.ok || typeof url !== "string" || new URL(url).hostname !== "images.unsplash.com") throw new Error("Unsplash no encontró una imagen segura para esa búsqueda.");
  const image = await request(url, { redirect: "error", signal: AbortSignal.timeout(30_000) }); const mimeType = image.headers.get("content-type")?.split(";")[0] ?? "";
  if (!image.ok || !["image/jpeg", "image/png", "image/webp"].includes(mimeType)) throw new Error("Unsplash devolvió un archivo de imagen no válido.");
  return { bytes: await limitedImageBytes(image), mimeType, filename: "unsplash-image.jpg" };
}
