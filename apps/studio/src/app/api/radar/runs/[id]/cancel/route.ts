import { NextResponse } from "next/server";
import { RadarError } from "@/lib/radar";
import { cancelRadarRun } from "@/lib/radar-scan";

/** Corta una búsqueda en marcha: aborta las llamadas en curso y la cierra como fallida. */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return NextResponse.json(await cancelRadarRun(id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo cancelar la búsqueda." }, { status: error instanceof RadarError ? error.status : 500 });
  }
}
