import { NextResponse } from "next/server";
import { ElevenLabsError, listElevenLabsVoices } from "@/lib/elevenlabs";

export async function GET() {
  try { return NextResponse.json({ voices: await listElevenLabsVoices() }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudieron cargar las voces.", voices: [] }, { status: error instanceof ElevenLabsError ? error.status : 502 }); }
}
