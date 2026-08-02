import { NextResponse } from "next/server";
import { GenerationError, generateCarousel } from "../../../../lib/carousel-generation";
import { carouselRemixInputSchema, RemixError, remixContext } from "../../../../lib/carousel-remix";

export async function POST(request: Request) {
  const parsed = carouselRemixInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "La solicitud de remix no es válida." }, { status: 400 });
  try {
    const topic = await remixContext(parsed.data.url);
    return NextResponse.json({ document: await generateCarousel({ ...parsed.data, topic }) });
  } catch (error) {
    const status = error instanceof RemixError ? 400 : error instanceof GenerationError ? error.status : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo crear el remix." }, { status });
  }
}
