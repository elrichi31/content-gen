import { NextResponse } from "next/server";
import { createPost, listPosts } from "@/lib/schedule";
import { fail, readBody } from "../errors";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  try {
    return NextResponse.json(await listPosts({
      startDate: params.get("startDate") ?? undefined,
      endDate: params.get("endDate") ?? undefined,
      campaignId: params.get("campaignId"),
    }));
  } catch (error) {
    return fail(error, "No se pudieron leer las publicaciones planificadas.");
  }
}

export async function POST(request: Request) {
  try {
    return NextResponse.json(await createPost(await readBody(request)), { status: 201 });
  } catch (error) {
    return fail(error, "No se pudo planificar la publicación.");
  }
}
