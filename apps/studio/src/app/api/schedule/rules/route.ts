import { NextResponse } from "next/server";
import { createRule, listRules } from "@/lib/schedule";
import { fail, readBody } from "../errors";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  try {
    return NextResponse.json(await listRules({ campaignId: params.get("campaignId"), includeInactive: params.get("includeInactive") !== "false" }));
  } catch (error) {
    return fail(error, "No se pudieron leer las pautas.");
  }
}

export async function POST(request: Request) {
  try {
    return NextResponse.json(await createRule(await readBody(request)), { status: 201 });
  } catch (error) {
    return fail(error, "No se pudo crear la pauta.");
  }
}
