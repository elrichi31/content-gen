import { currentMonth } from "@content-gen/domain/schedule";
import { NextResponse } from "next/server";
import { monthCalendar } from "@/lib/schedule";
import { fail } from "./errors";

/** Calendario de un mes: huecos de las pautas, lo planificado en cada uno y el resumen. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const month = params.get("month") ?? currentMonth();
  try {
    return NextResponse.json(await monthCalendar(month, { campaignId: params.get("campaignId") }));
  } catch (error) {
    return fail(error, "No se pudo leer el cronograma.");
  }
}
