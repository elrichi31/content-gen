import { NextResponse } from "next/server";
import { CostReportError, pieceCost } from "@/lib/generation-costs";

/** Desglose del gasto de una pieza (carrusel, video, anuncio, artículo) en toda su vida. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return NextResponse.json(await pieceCost(id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo leer el gasto de la pieza." }, { status: error instanceof CostReportError ? error.status : 500 });
  }
}
