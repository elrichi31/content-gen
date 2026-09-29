import { NextResponse } from "next/server";
import type { CarouselDocument } from "@content-gen/domain/carousel";
import { storeAsset } from "../../../../lib/asset-storage";
import { createRemoteImage } from "../../../../lib/carousel-images";
import { campaignSchema } from "@content-gen/domain/schemas";
import { brandBrief, brandDefaults } from "../../../../lib/brand-prompt";
import { brandOrError } from "../../../../lib/brand-kits";
import { GenerationError, carouselGenerationInputSchema, generateCarousel } from "../../../../lib/carousel-generation";
import { withDatabase } from "../../../../lib/db";
import { trackGeneration } from "../../../../lib/generation-runs";
import { openAiModel } from "../../../../lib/openai";

export const maxDuration = 300;

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

export async function POST(request: Request) {
  const raw = await request.json().catch(() => null) as { campaignId?: unknown; brandKitId?: unknown } | null;
  const campaignId = typeof raw?.campaignId === "string" ? raw.campaignId : undefined;
  const stored = campaignId ? await withDatabase(async (db) => await db.prepare("SELECT campaign.data_json AS campaign_json, brand.data_json AS brand_json FROM campaigns campaign LEFT JOIN brand_kits brand ON brand.id = campaign.brand_kit_id AND brand.archived_at IS NULL WHERE campaign.id = ? AND campaign.archived_at IS NULL").get(campaignId) as { campaign_json: string; brand_json: string | null } | undefined) : undefined;
  if (campaignId && !stored) return NextResponse.json({ error: "La campaña no existe o está archivada." }, { status: 400 });
  // La marca elegida a mano manda sobre la de la campaña; aporta audiencia y tono si la solicitud no los trae.
  const { brand, error: brandError } = await brandOrError(raw?.brandKitId, stored?.brand_json);
  if (brandError) return NextResponse.json({ error: brandError }, { status: 400 });
  const parsed = carouselGenerationInputSchema.safeParse({ ...brandDefaults(brand), ...raw });
  if (!parsed.success) return NextResponse.json({ error: "La solicitud de generación no es válida." }, { status: 400 });
  const campaign = stored ? campaignSchema.parse(JSON.parse(stored.campaign_json)) : undefined;
  const brief = campaign && typeof campaign.brief === "object" ? campaign.brief : undefined;
  try {
    const document = await trackGeneration({ operation: "carousel-generate", model: openAiModel("text") }, async () => {
      const generated = await generateCarousel({ ...parsed.data, ...brief, brandName: brand?.name, primaryColor: brand?.primaryColor, brandBrief: brandBrief(brand) });
      return { value: generated.document, usage: generated.usage };
    });
    const source = parsed.data.imageSource;
    if (source === "none") return NextResponse.json({ document, missingPhotos: 0 });
    const withPhotos = await attachImages(document, source, parsed.data.campaignId, brand?.primaryColor);
    return NextResponse.json({ document: withPhotos.document, missingPhotos: withPhotos.missing });
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo generar el carrusel." }, { status: error instanceof GenerationError ? error.status : 502 }); }
}
