import { NextResponse } from "next/server";
import { GenerationError } from "../../../../lib/carousel-generation";
import { createEditableCarousel } from "../../../../lib/carousel-pipeline";

export const maxDuration = 300;

export async function POST(request: Request) {
  const raw = await request.json().catch(() => null) as Record<string, unknown> | null;
  try { return NextResponse.json(await createEditableCarousel(raw)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo generar el carrusel." }, { status: error instanceof GenerationError ? error.status : 502 }); }
}
