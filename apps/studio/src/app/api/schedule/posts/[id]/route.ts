import { NextResponse } from "next/server";
import { deletePost, updatePost } from "@/lib/schedule";
import { fail, readBody } from "../../errors";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return NextResponse.json(await updatePost(id, await readBody(request)));
  } catch (error) {
    return fail(error, "No se pudo actualizar la publicación.");
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await deletePost(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return fail(error, "No se pudo vaciar el hueco.");
  }
}
