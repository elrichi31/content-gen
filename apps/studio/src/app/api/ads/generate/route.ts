import { NextResponse } from "next/server";
import { adDocumentSchema } from "@content-gen/domain/ad";
import { campaignSchema } from "@content-gen/domain/schemas";
import { AdGenerationError, adGenerationInputSchema, generateAd } from "../../../../lib/ad-generation";
import { withDatabase } from "../../../../lib/db";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { action?: unknown; document?: unknown; audience?: unknown; tone?: unknown; topic?: unknown; format?: unknown; layout?: unknown; campaignId?: unknown } | null;
  const previous = body?.action === "regenerate" ? adDocumentSchema.safeParse(body.document) : null;
  const stored = typeof body?.campaignId === "string" ? await withDatabase((db) => db.prepare("SELECT campaign.data_json AS campaign_json, brand.data_json AS brand_json FROM campaigns campaign LEFT JOIN brand_kits brand ON brand.id = campaign.brand_kit_id AND brand.archived_at IS NULL WHERE campaign.id = ? AND campaign.archived_at IS NULL").get(body.campaignId) as { campaign_json: string; brand_json: string | null } | undefined) : undefined;
  if (body?.campaignId && !stored) return NextResponse.json({ error: "La campaña no existe o está archivada." }, { status: 400 });
  const campaign = stored ? campaignSchema.parse(JSON.parse(stored.campaign_json)) : undefined;
  const brief = campaign && typeof campaign.brief === "object" ? campaign.brief : undefined;
  const brand = stored?.brand_json ? JSON.parse(stored.brand_json) as { name?: string; primaryColor?: string } : undefined;
  const input = adGenerationInputSchema.safeParse(previous?.success ? { topic: `${previous.data.headline}. ${previous.data.body}`, audience: body?.audience, tone: body?.tone, format: previous.data.format, layout: previous.data.layout, campaignId: body?.campaignId } : { ...body, ...brief });
  if (!input.success || previous && !previous.success) return NextResponse.json({ error: "La solicitud de anuncio no es válida." }, { status: 400 });
  try { const document = await generateAd({ ...input.data, brandName: brand?.name, primaryColor: brand?.primaryColor }); return NextResponse.json({ document: brand?.primaryColor ? { ...document, accentColor: brand.primaryColor } : document }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo generar el anuncio." }, { status: error instanceof AdGenerationError ? error.status : 502 }); }
}
