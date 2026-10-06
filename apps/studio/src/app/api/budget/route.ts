import { NextResponse } from "next/server";
import { budgetStatus, saveBudgetSettings } from "../../../lib/budget-settings.ts";
import { automationHttpError } from "../../../lib/automation-http.ts";
export async function GET() { try { return NextResponse.json(await budgetStatus()); } catch (error) { return automationHttpError(error); } }
export async function PATCH(request: Request) {
  try { await saveBudgetSettings(await request.json().catch(() => null)); return NextResponse.json(await budgetStatus()); }
  catch (error) { return automationHttpError(error); }
}
