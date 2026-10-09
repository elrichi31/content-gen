import { NextResponse } from "next/server";
import { listGenerationRequests } from "../../../lib/generation-queue.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await listGenerationRequests());
}
