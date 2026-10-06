import { NextResponse } from "next/server";
import { AutomationError, deleteAutomation, updateAutomation } from "../../../../lib/carousel-automation";

type Context = { params: Promise<{ id: string }> };

const fail = (error: unknown, fallback: string) => NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: error instanceof AutomationError ? error.status : 500 });

export async function PATCH(request: Request, { params }: Context) {
  try { return NextResponse.json(await updateAutomation((await params).id, await request.json().catch(() => ({})))); }
  catch (error) { return fail(error, "No se pudo actualizar la automatización."); }
}

export async function DELETE(_request: Request, { params }: Context) {
  try { await deleteAutomation((await params).id); return new NextResponse(null, { status: 204 }); }
  catch (error) { return fail(error, "No se pudo borrar la automatización."); }
}
