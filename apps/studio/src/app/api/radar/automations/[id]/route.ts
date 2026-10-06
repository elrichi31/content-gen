import { NextResponse } from "next/server";
import { deleteRadarAutomation, updateRadarAutomation } from "../../../../../lib/radar-automation.ts";
import { automationHttpError } from "../../../../../lib/automation-http.ts";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, { params }: Context) {
  try { return NextResponse.json(await updateRadarAutomation((await params).id, await request.json().catch(() => ({})))); }
  catch (error) { return automationHttpError(error); }
}
export async function DELETE(_request: Request, { params }: Context) {
  try { await deleteRadarAutomation((await params).id); return new NextResponse(null, { status: 204 }); }
  catch (error) { return automationHttpError(error); }
}
