import { NextResponse } from "next/server";
import { createWatchlistEntry, listWatchlist, RadarError } from "@/lib/radar";

export async function GET() {
  try { return NextResponse.json({ watchlist: await listWatchlist() }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo leer la lista de vigilancia.", watchlist: [] }, { status: 500 }); }
}

export async function POST(request: Request) {
  const input = await request.json().catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input)) return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  try { return NextResponse.json({ entry: await createWatchlistEntry(input) }, { status: 201 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo añadir el vertical." }, { status: error instanceof RadarError ? error.status : 500 }); }
}
