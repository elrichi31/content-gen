import { NextResponse } from "next/server";
import { ScheduleError } from "@/lib/schedule";

/** Los errores del cronograma ya traen mensaje y código; el resto no se filtra al cliente. */
export function fail(error: unknown, fallback: string) {
  if (error instanceof ScheduleError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function readBody(request: Request) {
  const input = await request.json().catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ScheduleError("Solicitud inválida.", 400);
  return input as Record<string, unknown>;
}
