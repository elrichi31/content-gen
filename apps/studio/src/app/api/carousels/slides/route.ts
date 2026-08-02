import { NextResponse } from "next/server";
import { carouselDocumentSchema } from "@content-gen/domain/carousel";
import { addBeforeCta, generateSlide, replaceSlide } from "../../../../lib/carousel-slides";

export async function POST(request: Request) {
  const input = await request.json().catch(() => null) as { action?: unknown; document?: unknown; index?: unknown } | null; const document = carouselDocumentSchema.safeParse(input?.document);
  if (!document.success || !["regenerate", "add"].includes(String(input?.action))) return NextResponse.json({ error: "Solicitud de slide inválida." }, { status: 400 });
  try {
    if (input?.action === "regenerate") { const index = Number(input.index); const current = document.data.slides[index]; if (!current) return NextResponse.json({ error: "Índice de slide inválido." }, { status: 400 }); return NextResponse.json({ document: replaceSlide(document.data, index, await generateSlide(document.data.topic, current.layout)) }); }
    return NextResponse.json({ document: addBeforeCta(document.data, await generateSlide(document.data.topic, "content")) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo modificar la slide." }, { status: 502 }); }
}
