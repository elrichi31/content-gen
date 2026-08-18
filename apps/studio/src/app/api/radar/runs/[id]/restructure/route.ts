import { NextResponse } from "next/server";
import { OpenAiError } from "@/lib/openai";
import { RadarError } from "@/lib/radar";
import { restructureRun } from "@/lib/radar-scan";

/**
 * Vuelve a interpretar las notas de una corrida con la configuración actual, sin buscar de nuevo.
 * Cuesta una sola llamada de estructuración: es la forma barata de probar otro modelo u otro
 * umbral de fuentes sobre datos que ya se pagaron.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await restructureRun(id, body ?? {}), { status: 201 });
  } catch (error) {
    const status = error instanceof RadarError || error instanceof OpenAiError ? error.status : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo reinterpretar la corrida." }, { status });
  }
}
