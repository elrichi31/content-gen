import { NextResponse } from "next/server";
import { adDocumentSchema } from "@content-gen/domain/ad";
import { z } from "zod";
import { adAspectRatio, buildImageAdPrompt } from "../../../../lib/ad-generation";
import { storeAsset } from "../../../../lib/asset-storage";
import { generateGeminiImage, geminiImageModel } from "../../../../lib/gemini";
import { trackGeneration } from "../../../../lib/generation-runs";

/** Anuncio dibujado por Nano Banana: alternativa de prueba a la plantilla HTML. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { document?: unknown; campaignId?: unknown } | null;
  const parsed = adDocumentSchema.safeParse(body?.document);
  const campaign = z.string().min(1).optional().safeParse(body?.campaignId);
  if (!parsed.success || !campaign.success) return NextResponse.json({ error: "La solicitud de anuncio no es válida." }, { status: 400 });
  const document = parsed.data, campaignId = campaign.data;
  try {
    const image = await trackGeneration({ operation: "ad-image", provider: "gemini", model: geminiImageModel() }, async () => {
      const created = await generateGeminiImage({ prompt: buildImageAdPrompt(document), aspectRatio: adAspectRatio(document.format) });
      return { value: created, usage: created.usage };
    });
    const asset = await storeAsset({ ...image, campaignId: campaignId ?? null });
    return NextResponse.json({ asset, url: `/api/assets/${asset.id}` }, { status: 201 });
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo crear el anuncio con Nano Banana." }, { status: 502 }); }
}
