import { NextResponse } from "next/server";
export function automationHttpError(error: unknown) {
  const status = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 500;
  return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo completar la acción." }, { status });
}
