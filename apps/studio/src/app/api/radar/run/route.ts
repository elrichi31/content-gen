import { NextResponse } from "next/server";
import { OpenAiError } from "@/lib/openai";
import { RadarError } from "@/lib/radar";
import { scanRadar, type RadarProgress } from "@/lib/radar-scan";

/**
 * Corrida manual del radar. Es una operación cara y larga (una búsqueda web por vertical, del
 * orden de minutos), así que no se dispara desde una lectura: solo por POST explícito.
 *
 * La respuesta se transmite como *server-sent events* porque tarda demasiado para una petición
 * muda: sin señales por el camino, la interfaz no puede distinguir «trabajando» de «colgado».
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let open = true;
      const send = (event: Record<string, unknown>) => {
        // El cliente puede cerrar la pestaña a mitad: escribir en un stream cerrado lanza, y ese
        // error no debe confundirse con un fallo de la corrida, que sigue su curso.
        if (!open) return;
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); }
        catch { open = false; }
      };

      try {
        const result = await scanRadar(body ?? {}, { onProgress: (progress: RadarProgress) => send(progress) });
        send({ type: "done", ...result });
      } catch (error) {
        const status = error instanceof RadarError || error instanceof OpenAiError ? error.status : 502;
        send({ type: "error", status, error: error instanceof Error ? error.message : "No se pudo completar la corrida del radar." });
      } finally {
        if (open) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Sin esto, un proxy intermedio puede acumular la respuesta y anular el progreso.
      "X-Accel-Buffering": "no",
    },
  });
}

/** Método antiguo por si algo consulta la ruta sin esperar el flujo. */
export async function GET() {
  return NextResponse.json({ error: "Usa POST para lanzar una corrida del radar." }, { status: 405 });
}
