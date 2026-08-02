import { NextResponse } from "next/server";
import { exportAd } from "../../../../lib/ad-export";

export async function POST(request: Request) {
  const input = await request.json().catch(() => null) as { document?: unknown } | null;
  if (!input?.document) return NextResponse.json({ error: "Documento inválido." }, { status: 400 });
  try { return new Response(await exportAd(input.document), { headers: { "Content-Type": "image/png", "Content-Disposition": "attachment; filename=ad.png" } }); }
  catch { return NextResponse.json({ error: "No se pudo exportar el anuncio." }, { status: 400 }); }
}
