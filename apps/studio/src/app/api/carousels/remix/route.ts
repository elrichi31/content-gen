import { NextResponse } from "next/server";
import { GenerationError, generateCarousel } from "../../../../lib/carousel-generation";
import { carouselRemixInputSchema, RemixError, remixContext } from "../../../../lib/carousel-remix";
import { trackGeneration } from "../../../../lib/generation-runs";
import { openAiModel } from "../../../../lib/openai";

export async function POST(request: Request) {
  const parsed = carouselRemixInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "La solicitud de remix no es válida." }, { status: 400 });
  try {
    // La lectura de la página no cuesta nada: solo se registra la generación.
    const topic = await remixContext(parsed.data.url);
    const document = await trackGeneration({ operation: "carousel-remix", model: openAiModel("text") }, async () => {
      const generated = await generateCarousel({ ...parsed.data, topic });
      return { value: generated.document, usage: generated.usage };
    });
    return NextResponse.json({ document });
  } catch (error) {
    const status = error instanceof RemixError ? 400 : error instanceof GenerationError ? error.status : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo crear el remix." }, { status });
  }
}
