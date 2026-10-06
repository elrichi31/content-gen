import { NextResponse } from "next/server";
import { AutomationError, runAutomation } from "../../../../../lib/carousel-automation";
import { GenerationError } from "../../../../../lib/carousel-generation";

export const maxDuration = 300;

/** «Ejecutar ahora»: lo mismo que hace el programador, sin esperar a su turno. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return NextResponse.json(await runAutomation((await params).id)); }
  catch (error) {
    const status = error instanceof AutomationError || error instanceof GenerationError ? error.status : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falló la ejecución." }, { status });
  }
}
