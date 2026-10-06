import { NextResponse } from "next/server";
import { listAutomationRuns } from "../../../lib/automation-execution.ts";
import { getAutomation } from "../../../lib/carousel-automation.ts";
import { getRadarAutomation } from "../../../lib/radar-automation.ts";
import { automationHttpError } from "../../../lib/automation-http.ts";
export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("automationId");
    if (!id) return NextResponse.json({ error: "Elige una automatización." }, { status: 400 });
    const exists = await getAutomation(id).catch((error) => {
      if (error?.status !== 404) throw error;
      return getRadarAutomation(id);
    });
    return NextResponse.json(await listAutomationRuns(exists.id));
  } catch (error) { return automationHttpError(error); }
}
