import { NextResponse } from "next/server";
import { adDocumentSchema } from "@content-gen/domain/ad";
import { campaignSchema } from "@content-gen/domain/schemas";
import { AdGenerationError, adGenerationInputSchema, generateAd } from "../../../../lib/ad-generation";
import { brandBrief, brandDefaults } from "../../../../lib/brand-prompt";
import { brandOrError } from "../../../../lib/brand-kits";
import { withDatabase } from "../../../../lib/db";
import { trackGeneration } from "../../../../lib/generation-runs";
import { openAiModel } from "../../../../lib/openai";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { action?: unknown; document?: unknown; audience?: unknown; tone?: unknown; topic?: unknown; format?: unknown; layout?: unknown; campaignId?: unknown; brandKitId?: unknown } | null;
  const previous = body?.action === "regenerate" ? adDocumentSchema.safeParse(body.document) : null;
  const stored = typeof body?.campaignId === "string" ? await withDatabase(async (db) => await db.prepare("SELECT campaign.data_json AS campaign_json, brand.data_json AS brand_json FROM campaigns campaign LEFT JOIN brand_kits brand ON brand.id = campaign.brand_kit_id AND brand.archived_at IS NULL WHERE campaign.id = ? AND campaign.archived_at IS NULL").get(body.campaignId) as { campaign_json: string; brand_json: string | null } | undefined) : undefined;
  if (body?.campaignId && !stored) return NextResponse.json({ error: "La campaña no existe o está archivada." }, { status: 400 });
  const campaign = stored ? campaignSchema.parse(JSON.parse(stored.campaign_json)) : undefined;
  const brief = campaign && typeof campaign.brief === "object" ? campaign.brief : undefined;
  // La marca elegida a mano manda sobre la de la campaña; aporta audiencia y tono si la solicitud no los trae.
  const { brand, error: brandError } = await brandOrError(body?.brandKitId, stored?.brand_json);
  if (brandError) return NextResponse.json({ error: brandError }, { status: 400 });
  const defaults = brandDefaults(brand);
  const input = adGenerationInputSchema.safeParse(previous?.success ? { topic: `${previous.data.headline}. ${previous.data.body}`, audience: body?.audience ?? defaults.audience, tone: body?.tone ?? defaults.tone, format: previous.data.format, layout: previous.data.layout, campaignId: body?.campaignId } : { ...defaults, ...body, ...brief });
  if (!input.success || previous && !previous.success) return NextResponse.json({ error: "La solicitud de anuncio no es válida." }, { status: 400 });
  try {
    const document = await trackGeneration({ operation: previous ? "ad-regenerate" : "ad-generate", model: openAiModel("text") }, async () => {
      const generated = await generateAd({ ...input.data, brandName: brand?.name, primaryColor: brand?.primaryColor, brandBrief: brandBrief(brand) });
      return { value: generated.document, usage: generated.usage };
    });
    return NextResponse.json({ document: brand?.primaryColor ? { ...document, accentColor: brand.primaryColor } : document });
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo generar el anuncio." }, { status: error instanceof AdGenerationError ? error.status : 502 }); }
}
