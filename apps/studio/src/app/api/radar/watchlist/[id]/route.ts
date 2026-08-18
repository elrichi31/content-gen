import { NextResponse } from "next/server";
import { deleteWatchlistEntry, RadarError, updateWatchlistEntry } from "@/lib/radar";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patch = await request.json().catch(() => null);
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  try { return NextResponse.json({ entry: await updateWatchlistEntry(id, patch as Record<string, unknown>) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo actualizar el vertical." }, { status: error instanceof RadarError ? error.status : 500 }); }
}

/** Deja de vigilar el vertical. Los temas que ya trajo se conservan: son histórico (D-09). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try { return NextResponse.json(await deleteWatchlistEntry(id)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo eliminar el vertical." }, { status: error instanceof RadarError ? error.status : 500 }); }
}
