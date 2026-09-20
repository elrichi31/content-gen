import { NextResponse } from "next/server";
import { imageUsage } from "@content-gen/domain/cost";
import { adDocumentSchema } from "@content-gen/domain/ad";
import { z } from "zod";
import { adAspectRatio, buildBackgroundPrompt } from "../../../../lib/ad-generation";
import { brandIndustry } from "../../../../lib/brand-prompt";
import { brandOrError } from "../../../../lib/brand-kits";
import { storeAsset } from "../../../../lib/asset-storage";
import { generateGeminiImage, geminiImageModel } from "../../../../lib/gemini";
import { trackGeneration } from "../../../../lib/generation-runs";
import { generateOpenAiImage, openAiModel } from "../../../../lib/openai";

const inputSchema = z.object({ provider: z.enum(["openai", "gemini"]), description: z.string().trim().max(500).default(""), campaignId: z.string().min(1).optional(), brandKitId: z.string().min(1).optional() });
const openAiSize = { story: "1024x1536", square: "1024x1024", landscape: "1536x1024" } as const;

/** Fondo del anuncio generado por OpenAI o Nano Banana; queda como asset y la plantilla lo usa con `imageAssetId`. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { document?: unknown } | null;
  const document = adDocumentSchema.safeParse(body?.document);
  const input = inputSchema.safeParse(body);
  if (!document.success || !input.success) return NextResponse.json({ error: "La solicitud de fondo no es válida." }, { status: 400 });
  const { provider, description, campaignId } = input.data;
  const { brand, error: brandError } = await brandOrError(input.data.brandKitId);
  if (brandError) return NextResponse.json({ error: brandError }, { status: 400 });
  const prompt = buildBackgroundPrompt(document.data, description, brandIndustry(brand));
  try {
    const image = await trackGeneration({ operation: "ad-background", provider, model: provider === "openai" ? openAiModel("image") : geminiImageModel() }, async () => {
      if (provider === "gemini") {
        const created = await generateGeminiImage({ prompt, aspectRatio: adAspectRatio(document.data.format) });
        return { value: created, usage: created.usage };
      }
      const created = await generateOpenAiImage({ prompt, size: openAiSize[document.data.format] });
      return { value: { bytes: Buffer.from(created.base64, "base64"), mimeType: "image/webp", filename: "ad-background.webp" }, usage: imageUsage(1) };
    });
    const asset = await storeAsset({ ...image, campaignId: campaignId ?? null });
    return NextResponse.json({ asset, url: `/api/assets/${asset.id}` }, { status: 201 });
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo crear el fondo." }, { status: 502 }); }
}
