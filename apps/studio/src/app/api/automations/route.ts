import { NextResponse } from "next/server";
import { AutomationError, createAutomation, listAutomationsWithStatus } from "../../../lib/carousel-automation";

export async function GET() {
  return NextResponse.json(await listAutomationsWithStatus());
}

export async function POST(request: Request) {
  try { return NextResponse.json(await createAutomation(await request.json().catch(() => null)), { status: 201 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo crear la automatización." }, { status: error instanceof AutomationError ? error.status : 500 }); }
}
