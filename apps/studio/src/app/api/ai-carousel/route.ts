import { NextResponse } from "next/server";
import { GenerationError } from "../../../lib/carousel-generation";
import { drawAiCarousel, prepareAiCarousel } from "../../../lib/carousel-pipeline";

export const maxDuration = 300;

/**
 * Carrusel dibujado entero por IA. Responde en NDJSON para que la página muestre el avance real:
 * una línea por paso terminado y la última con el resultado.
 */
export async function POST(request: Request) {
  let prepared: Awaited<ReturnType<typeof prepareAiCarousel>>;
  try { prepared = await prepareAiCarousel(await request.json().catch(() => null)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "La solicitud de carrusel no es válida." }, { status: error instanceof GenerationError ? error.status : 400 }); }
  const { input, brand } = prepared;
  // Pasos: el guion + una imagen por slide.
  const total = input.slides + 1;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => controller.enqueue(new TextEncoder().encode(`${JSON.stringify(event)}\n`));
      let done = 0;
      try {
        const result = await drawAiCarousel(input, brand, { onStep: () => send({ type: "progress", done: ++done, total }) });
        send({ type: "done", ...result });
      }
      catch (error) { send({ type: "error", error: error instanceof Error ? error.message : "No se pudo crear el carrusel." }); }
      controller.close();
    },
  });
  return new Response(stream, { status: 201, headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" } });
}
