import { NextResponse } from "next/server";
import { getClockSettings, saveClockSettings } from "../../../lib/clock-settings.ts";
import { automationHttpError } from "../../../lib/automation-http.ts";
export async function GET() { try { return NextResponse.json(await getClockSettings()); } catch (error) { return automationHttpError(error); } }
export async function PATCH(request: Request) {
  try { return NextResponse.json(await saveClockSettings(await request.json().catch(() => null))); }
  catch (error) { return automationHttpError(error); }
}
