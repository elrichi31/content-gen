import { NextResponse } from "next/server";
import { storeAsset } from "../../../../lib/asset-storage";
import { carouselImageInputSchema, createRemoteImage } from "../../../../lib/carousel-images";

export async function POST(request: Request) {
  const parsed = carouselImageInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "La solicitud de imagen no es válida." }, { status: 400 });
  try { const image = await createRemoteImage(parsed.data); const asset = await storeAsset({ ...image, campaignId: parsed.data.campaignId ?? null }); return NextResponse.json({ asset, url: `/api/assets/${asset.id}` }, { status: 201 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo crear la imagen." }, { status: 502 }); }
}
