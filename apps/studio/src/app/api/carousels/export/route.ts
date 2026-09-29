import { NextResponse } from "next/server";
import { exportCarousel } from "../../../../lib/carousel-export";

export async function POST(request: Request) {
  const input = await request.json().catch(() => null) as { document?: unknown; format?: unknown; images?: unknown } | null; const format = input?.format === "zip" ? "zip" : input?.format === "png" ? "png" : null;
  if (!format || !input?.document) return NextResponse.json({ error: "Documento o formato inválido." }, { status: 400 });
  try { const file = await exportCarousel(input.document, format, Array.isArray(input.images) ? input.images.filter((image): image is string => typeof image === "string") : []); return new Response(file, { headers: { "Content-Type": format === "zip" ? "application/zip" : "image/png", "Content-Disposition": `attachment; filename="carousel.${format}"` } }); }
  catch { return NextResponse.json({ error: "No se pudo exportar el carrusel." }, { status: 400 }); }
}
