import { NextResponse } from "next/server";
import { campaignSchema } from "@content-gen/domain/schemas";
import { GenerationError, carouselGenerationInputSchema, generateCarousel } from "../../../../lib/carousel-generation";
import { withDatabase } from "../../../../lib/db";

export async function POST(request: Request) {
  const parsed = carouselGenerationInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "La solicitud de generación no es válida." }, { status: 400 });
  const stored = parsed.data.campaignId ? await withDatabase((db) => db.prepare("SELECT campaign.data_json AS campaign_json, brand.data_json AS brand_json FROM campaigns campaign LEFT JOIN brand_kits brand ON brand.id = campaign.brand_kit_id AND brand.archived_at IS NULL WHERE campaign.id = ? AND campaign.archived_at IS NULL").get(parsed.data.campaignId) as { campaign_json: string; brand_json: string | null } | undefined) : undefined;
  if (parsed.data.campaignId && !stored) return NextResponse.json({ error: "La campaña no existe o está archivada." }, { status: 400 });
  const campaign = stored ? campaignSchema.parse(JSON.parse(stored.campaign_json)) : undefined;
  const brief = campaign && typeof campaign.brief === "object" ? campaign.brief : undefined;
  const brand = stored?.brand_json ? JSON.parse(stored.brand_json) as { name?: string; primaryColor?: string } : undefined;
  try { return NextResponse.json({ document: await generateCarousel({ ...parsed.data, ...brief, brandName: brand?.name, primaryColor: brand?.primaryColor }) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo generar el carrusel." }, { status: error instanceof GenerationError ? error.status : 502 }); }
}
