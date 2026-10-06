import { NextResponse } from "next/server";
import { createRadarAutomation, listRadarAutomations } from "../../../../lib/radar-automation.ts";
import { automationHttpError } from "../../../../lib/automation-http.ts";
export async function GET() { try { return NextResponse.json(await listRadarAutomations()); } catch (error) { return automationHttpError(error); } }
export async function POST(request: Request) {
  try { return NextResponse.json(await createRadarAutomation(await request.json().catch(() => null)), { status: 201 }); }
  catch (error) { return automationHttpError(error); }
}
