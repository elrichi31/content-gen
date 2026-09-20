import { NextResponse } from "next/server";
import { carouselDocumentSchema } from "@content-gen/domain/carousel";
import { brandBrief } from "../../../../lib/brand-prompt";
import { brandOrError } from "../../../../lib/brand-kits";
import { addBeforeCta, generateSlide, replaceSlide } from "../../../../lib/carousel-slides";
import { trackGeneration } from "../../../../lib/generation-runs";
import { openAiModel } from "../../../../lib/openai";

export async function POST(request: Request) {
  const input = await request.json().catch(() => null) as { action?: unknown; document?: unknown; index?: unknown; brandKitId?: unknown } | null; const document = carouselDocumentSchema.safeParse(input?.document);
  if (!document.success || !["regenerate", "add"].includes(String(input?.action))) return NextResponse.json({ error: "Solicitud de slide inválida." }, { status: 400 });
  const { brand, error: brandError } = await brandOrError(input?.brandKitId);
  if (brandError) return NextResponse.json({ error: brandError }, { status: 400 });
  const slideFor = (layout: Parameters<typeof generateSlide>[1], operation: string) => trackGeneration({ operation, model: openAiModel("text") }, async () => {
    const generated = await generateSlide(document.data.topic, layout, fetch, brandBrief(brand));
    return { value: generated.slide, usage: generated.usage };
  });
  try {
    if (input?.action === "regenerate") { const index = Number(input.index); const current = document.data.slides[index]; if (!current) return NextResponse.json({ error: "Índice de slide inválido." }, { status: 400 }); return NextResponse.json({ document: replaceSlide(document.data, index, await slideFor(current.layout, "carousel-slide-regenerate")) }); }
    return NextResponse.json({ document: addBeforeCta(document.data, await slideFor("content", "carousel-slide-add")) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo modificar la slide." }, { status: 502 }); }
}
