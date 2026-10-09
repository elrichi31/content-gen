import { NextResponse } from "next/server";
import { decideGeneration, GenerationQueueError } from "../../../../lib/generation-queue.ts";
import { drainGenerationQueue } from "../../../../lib/mcp/queue-runner.ts";

/** Aprobar o rechazar una generación pendiente. Aprobada, entra al procesador (de una en una). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const input = await request.json().catch(() => null) as { action?: unknown } | null;
  if (input?.action !== "approve" && input?.action !== "reject") return NextResponse.json({ error: "La acción debe ser approve o reject." }, { status: 400 });
  try {
    const decided = await decideGeneration(id, input.action);
    // Sin await: la generación tarda minutos y la respuesta no debe esperarla.
    if (decided.status === "aprobada") void drainGenerationQueue();
    return NextResponse.json(decided);
  } catch (error) {
    if (error instanceof GenerationQueueError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
