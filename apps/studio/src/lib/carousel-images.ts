import { emptyUsage, imageUsage } from "@content-gen/domain/cost";
import { z } from "zod";
import { openAiRequest } from "./openai.ts";

export const carouselImageInputSchema = z.object({
  source: z.enum(["openai", "unsplash", "illustration"]), prompt: z.string().trim().min(3).max(500), campaignId: z.string().min(1).optional(),
  /** Color principal del carrusel, para que la ilustración salga en la paleta de la marca. */
  color: z.string().trim().max(60).optional(),
  /** Unsplash: qué resultado de la búsqueda usar, para pasar a la siguiente foto si la primera no convence. */
  index: z.number().int().min(0).max(999).optional(),
});

/** Resultados de Unsplash que se piden de una vez: el máximo que la API devuelve por página. */
const unsplashPageSize = 30;

/**
 * Ilustración plana en la paleta de la marca, con fondo transparente para que se asiente sobre el slide.
 * Es la alternativa a unDraw: su licencia no permite buscarlas ni descargarlas desde una aplicación.
 */
export function buildIllustrationPrompt(subject: string, color = "#2f7d40") {
  return `Flat vector illustration, modern minimal style: simple geometric shapes, friendly stylized people with no facial details, clean solid fills, no gradients, no outlines. Limited palette: ${color} as the single accent color, dark charcoal #2f2e41 for hair and details, light gray #e6e6e6 and skin tones. Isolated subject centered with generous empty margin, transparent background, no floor shadow blob, no text, no letters, no logos. Subject: ${subject}`;
}
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
  if (input.source === "openai" || input.source === "illustration") {
    const key = process.env.OPENAI_API_KEY; const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
    if (!key) throw new Error("Falta configurar OPENAI_API_KEY.");
    const illustration = input.source === "illustration";
    const payload = illustration
      ? { model, prompt: buildIllustrationPrompt(input.prompt, input.color), size: "1024x1024", quality: "low", background: "transparent", output_format: "webp" }
      : { model, prompt: input.prompt, size: "1024x1536", quality: "low", output_format: "webp" };
    const response = await openAiRequest("image", request, "https://api.openai.com/v1/images/generations", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(120_000), body: JSON.stringify(payload) });
    const body = await response.json().catch(() => null) as { data?: { b64_json?: unknown }[]; error?: { message?: unknown } } | null;
    const image = body?.data?.[0]?.b64_json;
    if (!response.ok || typeof image !== "string") throw new Error(typeof body?.error?.message === "string" ? `OpenAI: ${body.error.message}` : "OpenAI no devolvió una imagen.");
    const bytes = Buffer.from(image, "base64"); if (bytes.length > maxImageBytes) throw new Error("La imagen supera el límite de 10 MB.");
    return { bytes, mimeType: "image/webp", filename: illustration ? "illustration.webp" : "openai-image.webp", model, usage: imageUsage(1) };
  }
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) throw new Error("Falta configurar UNSPLASH_ACCESS_KEY.");
  const query = input.prompt.trim();
  const simplified = query.split(/\s+/).slice(0, 2).join(" ");
  let url: unknown; let index = 0; let total = 0;
  for (const keywords of [...new Set([query, simplified])]) {
    const search = await request(`https://api.unsplash.com/search/photos?per_page=${unsplashPageSize}&query=${encodeURIComponent(keywords)}`, { headers: { Authorization: `Client-ID ${key}` }, signal: AbortSignal.timeout(30_000) });
    if (!search.ok) {
      if (search.status === 401 || search.status === 403) throw new Error("Unsplash rechazó la credencial o el acceso. Revisa UNSPLASH_ACCESS_KEY y los límites de la aplicación.");
      throw new Error(`Unsplash no pudo buscar imágenes (HTTP ${search.status}).`);
    }
    const result = await search.json().catch(() => null) as { results?: { urls?: { regular?: unknown } }[] } | null;
    if (!result || !Array.isArray(result.results)) throw new Error("Unsplash devolvió una respuesta de búsqueda no válida.");
    if (!result.results.length) continue;
    // Si se pide más allá del último resultado se vuelve al primero, así el botón de siguiente nunca se agota.
    total = result.results.length; index = (input.index ?? 0) % total;
    url = result.results[index]?.urls?.regular;
    break;
  }
  if (typeof url !== "string" || new URL(url).hostname !== "images.unsplash.com" || new URL(url).protocol !== "https:") throw new Error("Unsplash no encontró una imagen segura para esa búsqueda.");
  const image = await request(url, { redirect: "error", signal: AbortSignal.timeout(30_000) }); const mimeType = image.headers.get("content-type")?.split(";")[0] ?? "";
  if (!image.ok || !["image/jpeg", "image/png", "image/webp"].includes(mimeType)) throw new Error("Unsplash devolvió un archivo de imagen no válido.");
  // Unsplash no cobra por imagen: el consumo va vacío para que no aparezca como gasto.
  return { bytes: await limitedImageBytes(image), mimeType, filename: "unsplash-image.jpg", model: null, usage: emptyUsage(), index, total };
}
