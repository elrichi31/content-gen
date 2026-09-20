import { NextResponse } from "next/server";
import { campaignSchema } from "@content-gen/domain/schemas";
import { brandBrief, brandDefaults } from "../../../../lib/brand-prompt";
import { brandOrError } from "../../../../lib/brand-kits";
import { GenerationError, carouselGenerationInputSchema, generateCarousel } from "../../../../lib/carousel-generation";
import { withDatabase } from "../../../../lib/db";
import { trackGeneration } from "../../../../lib/generation-runs";
import { openAiModel } from "../../../../lib/openai";

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
    return NextResponse.json({ document });
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo generar el carrusel." }, { status: error instanceof GenerationError ? error.status : 502 }); }
}
