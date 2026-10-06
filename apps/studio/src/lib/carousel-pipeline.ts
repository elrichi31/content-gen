import type { CarouselDocument } from "@content-gen/domain/carousel";
import { imageUsage } from "@content-gen/domain/cost";
import { campaignSchema } from "@content-gen/domain/schemas";
import type { BrandKit } from "@content-gen/domain/schemas";
import { aiCarouselInputSchema, buildPlanPrompt, buildSlidePrompt, parsePlan, type AiCarouselInput } from "./ai-carousel.ts";
import { readAsset, storeAsset } from "./asset-storage.ts";
import { brandOrError } from "./brand-kits.ts";
import { brandBrief, brandDefaults } from "./brand-prompt.ts";
import { createRemoteImage } from "./carousel-images.ts";
import { GenerationError, carouselGenerationInputSchema, generateCarousel } from "./carousel-generation.ts";
import { withDatabase } from "./db.ts";
import { generateGeminiImage, geminiImageModel, type ReferenceImage } from "./gemini.ts";
import { trackGeneration } from "./generation-runs.ts";
import { generateOpenAiImage, generateOpenAiJson, openAiModel } from "./openai.ts";

/*
 * Los dos caminos para crear un carrusel con IA, fuera de sus rutas para que también los use la
 * automatización: el editable (guion + layouts + fotos) y el dibujado entero como imágenes.
 */

const PHOTO_LAYOUTS = new Set(["split", "imageOverlay"]);
/** Cómo queda anotado en el documento de dónde salió la imagen. */
const SOURCE_TAG = { openai: "dalle", unsplash: "unsplash", illustration: "illustration" } as const;
/** Si la foto de un slide no llega, el slide cambia a un layout que no la necesita en vez de quedar con un hueco. */
const WITHOUT_PHOTO = { split: "content", imageOverlay: "cover" } as const;

/** Pone las fotos en los slides que las llevan, en paralelo; una que falla no tumba el carrusel. */
async function attachImages(document: CarouselDocument, source: "unsplash" | "openai" | "illustration", campaignId?: string, color?: string) {
  let missing = 0;
  const slides = await Promise.all(document.slides.map(async (slide) => {
    if (!PHOTO_LAYOUTS.has(slide.layout)) return slide;
    try {
      const prompt = slide.imagePrompt || slide.title || document.topic;
      const image = await trackGeneration({ operation: "carousel-image", provider: source === "illustration" ? "openai" : source, model: source === "unsplash" ? null : openAiModel("image") }, async () => {
        const created = await createRemoteImage({ source, prompt, color });
        return { value: created, usage: created.usage };
      });
      const asset = await storeAsset({ ...image, campaignId: campaignId ?? null });
      return { ...slide, imageUrl: `/api/assets/${asset.id}`, imageSource: SOURCE_TAG[source], imagePosition: slide.layout === "imageOverlay" ? "background" as const : slide.imagePosition ?? "right" as const };
    }
    catch { missing++; return { ...slide, layout: WITHOUT_PHOTO[slide.layout as keyof typeof WITHOUT_PHOTO], layoutVariant: undefined }; }
  }));
  return { missing, document: { ...document, slides, generation: document.generation ? { ...document.generation, withImages: true, imageSource: SOURCE_TAG[source] } : undefined } };
}

/** Lee la campaña y su marca. `undefined` sin campaña; lanza si la campaña no existe. */
async function campaignWithBrand(campaignId: string | undefined) {
  if (!campaignId) return undefined;
  const stored = await withDatabase(async (db) => await db.prepare("SELECT campaign.data_json AS campaign_json, brand.data_json AS brand_json FROM campaigns campaign LEFT JOIN brand_kits brand ON brand.id = campaign.brand_kit_id AND brand.archived_at IS NULL WHERE campaign.id = ? AND campaign.archived_at IS NULL").get(campaignId) as { campaign_json: string; brand_json: string | null } | undefined);
  if (!stored) throw new GenerationError("La campaña no existe o está archivada.", 400);
  return stored;
}

/** Carrusel editable: guion con layouts y, si se pide, fotos. `raw` es la misma solicitud que recibe la API. */
export async function createEditableCarousel(raw: Record<string, unknown> | null) {
  const campaignId = typeof raw?.campaignId === "string" ? raw.campaignId : undefined;
  const stored = await campaignWithBrand(campaignId);
  // La marca elegida a mano manda sobre la de la campaña; aporta audiencia y tono si la solicitud no los trae.
  const { brand, error: brandError } = await brandOrError(raw?.brandKitId, stored?.brand_json);
  if (brandError) throw new GenerationError(brandError, 400);
  const campaign = stored ? campaignSchema.parse(JSON.parse(stored.campaign_json)) : undefined;
  const brief = campaign && typeof campaign.brief === "object" ? campaign.brief : undefined;
  // Lo que pide la solicitud manda sobre el brief de la campaña, y este sobre la marca. Antes el
  // brief iba al final y su tema pisaba el pedido: el carrusel salía sobre la campaña, no sobre el tema.
  const parsed = carouselGenerationInputSchema.safeParse({ ...brandDefaults(brand), ...brief, ...raw });
  if (!parsed.success) throw new GenerationError("La solicitud de generación no es válida.", 400);
  const document = await trackGeneration({ operation: "carousel-generate", model: openAiModel("text") }, async () => {
    const generated = await generateCarousel({ ...parsed.data, brandName: brand?.name, primaryColor: brand?.primaryColor, brandBrief: brandBrief(brand) });
    return { value: generated.document, usage: generated.usage };
  });
  const source = parsed.data.imageSource;
  if (source === "none") return { document, missingPhotos: 0 };
  const withPhotos = await attachImages(document, source, parsed.data.campaignId, brand?.primaryColor);
  return { document: withPhotos.document, missingPhotos: withPhotos.missing };
}

/**
 * Nano Banana suele tardar ~10 s, pero a veces una llamada se cuelga sin responder: se corta a los 45 s
 * y se reintenta una vez. GPT Image 2 en high es más lento de por sí. Dos intentos caben en maxDuration.
 */
const TIMEOUT = { gemini: 45_000, openai: 120_000 } as const;

async function drawSlide(provider: "gemini" | "openai", prompt: string, images: ReferenceImage[]) {
  if (provider === "gemini") {
    const image = await generateGeminiImage({ prompt: `${prompt}\nAspect ratio 4:5.`, aspectRatio: "4:5", images, timeoutMs: TIMEOUT.gemini });
    return { bytes: image.bytes, mimeType: image.mimeType, usage: image.usage };
  }
  // GPT Image 2 no tiene 4:5: se pide 2:3 vertical, lo más cercano.
  const image = await generateOpenAiImage({ prompt: `${prompt}\nAspect ratio 2:3.`, size: "1024x1536", quality: "high", images, timeoutMs: TIMEOUT.openai });
  return { bytes: Buffer.from(image.base64, "base64"), mimeType: "image/webp", usage: imageUsage(1) };
}

async function withRetry<T>(work: () => Promise<T>) {
  try { return await work(); }
  catch { return await work(); }
}

export type AiCarouselSlide = { headline: string; body: string; url: string | null; error: string | null };

/** Valida la solicitud y resuelve la marca: la elegida a mano o, si no, la de la campaña. */
export async function prepareAiCarousel(raw: unknown, campaignId?: string) {
  const input = aiCarouselInputSchema.safeParse(raw);
  if (!input.success) throw new GenerationError("La solicitud de carrusel no es válida.", 400);
  const stored = await campaignWithBrand(campaignId);
  const { brand, error } = await brandOrError(input.data.brandKitId, stored?.brand_json);
  if (error) throw new GenerationError(error, 400);
  return { input: input.data, brand };
}

/**
 * Carrusel dibujado entero por IA: se escribe el guion y cada slide sale como imagen final, con la marca.
 * `onStep` avisa de cada paso terminado (el guion y luego una imagen por slide). Una slide que falla dos
 * veces llega con `error` en vez de tirar el carrusel entero.
 */
export async function drawAiCarousel(input: AiCarouselInput, brand: BrandKit | undefined, { campaignId, onStep }: { campaignId?: string; onStep?: () => void } = {}) {
  const logo = brand?.logoAssetId ? await readAsset(brand.logoAssetId).catch(() => null) : null;
  const provider = input.provider;
  const plan = await trackGeneration({ operation: "ai-carousel-plan", model: openAiModel("text") }, async () => {
    const created = await generateOpenAiJson({ system: "Eres director de arte y copywriter de carruseles. Responde solo JSON válido.", prompt: buildPlanPrompt(input, brandBrief(brand)) });
    return { value: parsePlan(created.value, input.slides), usage: created.usage };
  });
  onStep?.();
  const brandInfo = brand ? { name: brand.name, primaryColor: brand.primaryColor, hasLogo: Boolean(logo) } : undefined;
  // El modelo registrado lleva la calidad: gpt-image-2 en high tiene su propio precio en config/pricing.json.
  const model = provider === "gemini" ? geminiImageModel() : `${openAiModel("image")}-high`;
  // ponytail: todas en paralelo; si el proveedor empieza a devolver 429, pasar a lotes de 2-3.
  const slides = await Promise.all(plan.slides.map(async (slide, index): Promise<AiCarouselSlide> => {
    try {
      return await withRetry(() => trackGeneration({ operation: "ai-carousel-slide", provider, model }, async () => {
        const image = await drawSlide(provider, buildSlidePrompt(plan, index, brandInfo), logo ? [logo] : []);
        const asset = await storeAsset({ bytes: image.bytes, mimeType: image.mimeType, filename: `ai-carousel-${index + 1}.${image.mimeType.split("/")[1].replace("jpeg", "jpg")}`, campaignId: campaignId ?? null });
        return { value: { ...slide, url: `/api/assets/${asset.id}` as string | null, error: null as string | null }, usage: image.usage };
      }));
    }
    catch (error) { return { ...slide, url: null, error: error instanceof Error ? error.message : "No se pudo dibujar esta slide." }; }
    finally { onStep?.(); }
  }));
  return { style: plan.style, slides };
}
