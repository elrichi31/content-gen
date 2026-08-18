import { NextResponse } from "next/server";
import { deleteRule, updateRule } from "@/lib/schedule";
import { fail, readBody } from "../../errors";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return NextResponse.json(await updateRule(id, await readBody(request)));
  } catch (error) {
    return fail(error, "No se pudo actualizar la pauta.");
  }
}

/** Borrar la pauta solo deja de generar huecos: lo ya planificado se conserva. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await deleteRule(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return fail(error, "No se pudo borrar la pauta.");
  }
}
