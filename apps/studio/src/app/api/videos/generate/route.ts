import { NextResponse } from "next/server";
import { finishGenerationRun, beginGenerationRun, GenerationRunError } from "@/lib/generation-runs";
import { openAiModel } from "@/lib/openai";
import { generateStandardVideoScriptRun, generateTimelineVideoScriptRun, videoGenerationInputSchema, VideoGenerationError } from "@/lib/video-generation";
import { campaignSchema } from "@content-gen/domain/schemas";
import { withDatabase } from "@/lib/db";

type Body = { templateId?: unknown; contentItemId?: unknown; campaignId?: unknown };

// El asistente genera el guion antes de guardar el video, así que `contentItemId`
// es opcional: sin él no hay GenerationRun que registrar, solo la generación.
function campaignQuery(body: Body) {
  const base = "SELECT campaign.data_json AS campaign_json, brand.data_json AS brand_json FROM campaigns campaign LEFT JOIN brand_kits brand ON brand.id = campaign.brand_kit_id AND brand.archived_at IS NULL";
  return typeof body.contentItemId === "string" && body.contentItemId
    ? { sql: `${base} JOIN content_items content ON content.campaign_id = campaign.id WHERE campaign.id = ? AND content.id = ? AND campaign.archived_at IS NULL AND content.archived_at IS NULL`, args: [body.campaignId, body.contentItemId] }
    : { sql: `${base} WHERE campaign.id = ? AND campaign.archived_at IS NULL`, args: [body.campaignId] };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Body | null;
  const query = body?.campaignId && typeof body.campaignId === "string" ? campaignQuery(body) : null;
  const stored = query ? await withDatabase(async (db) => await db.prepare(query.sql).get(...query.args) as { campaign_json: string; brand_json: string | null } | undefined) : undefined;
  if (query && !stored) return NextResponse.json({ error: "El video no pertenece a una campaña activa." }, { status: 400 });
  const campaign = stored ? campaignSchema.parse(JSON.parse(stored.campaign_json)) : undefined;
  const brief = campaign && typeof campaign.brief === "object" ? campaign.brief : undefined;
  const brand = stored?.brand_json ? JSON.parse(stored.brand_json) as { name?: string; primaryColor?: string } : undefined;
  // El brief de la campaña solo rellena lo que el usuario no escribió.
  const input = videoGenerationInputSchema.safeParse({ ...brief, ...Object.fromEntries(Object.entries(body ?? {}).filter(([, value]) => value !== undefined && value !== "")) });
  if (!input.success) return NextResponse.json({ error: "Solicitud de guion de video inválida." }, { status: 400 });
  const contentItemId = typeof body?.contentItemId === "string" && body.contentItemId ? body.contentItemId : null;
  const startedAt = Date.now(); let run: Awaited<ReturnType<typeof beginGenerationRun>> | undefined;
  try {
    if (contentItemId) run = await beginGenerationRun({ contentItemId, operation: body?.templateId === "timeline" ? "video-timeline-script" : "video-standard-script", model: openAiModel("script") });
    const generationInput = { ...input.data, brandName: brand?.name, primaryColor: brand?.primaryColor };
    const generated = body?.templateId === "timeline" ? await generateTimelineVideoScriptRun(generationInput) : await generateStandardVideoScriptRun(generationInput);
    return NextResponse.json({ document: generated.document, ...(run ? { generationRun: await finishGenerationRun(run.id, { durationMs: Date.now() - startedAt, usage: generated.usage }) } : {}) });
  } catch (error) {
    if (run) await finishGenerationRun(run.id, { durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : "Error desconocido" });
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo generar el guion." }, { status: error instanceof VideoGenerationError || error instanceof GenerationRunError ? error.status : 502 });
  }
}
