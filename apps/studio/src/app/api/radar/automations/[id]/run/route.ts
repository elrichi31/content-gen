import { NextResponse } from "next/server";
import { runRadarAutomation } from "../../../../../../lib/radar-automation.ts";
import { automationHttpError } from "../../../../../../lib/automation-http.ts";
export const maxDuration = 300;
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return NextResponse.json(await runRadarAutomation((await params).id)); }
  catch (error) { return automationHttpError(error); }
}
