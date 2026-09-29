import { NextResponse } from "next/server";
import { imageUsage } from "@content-gen/domain/cost";
import { aiCarouselInputSchema, buildPlanPrompt, buildSlidePrompt, parsePlan } from "../../../lib/ai-carousel";
import { readAsset, storeAsset } from "../../../lib/asset-storage";
import { brandOrError } from "../../../lib/brand-kits";
import { brandBrief } from "../../../lib/brand-prompt";
import { generateGeminiImage, geminiImageModel, type ReferenceImage } from "../../../lib/gemini";
import { trackGeneration } from "../../../lib/generation-runs";
import { generateOpenAiImage, generateOpenAiJson, openAiModel } from "../../../lib/openai";

export const maxDuration = 300;

/**
 * Nano Banana suele tardar ~10 s, pero a veces una llamada se cuelga sin responder: se corta a los 45 s
 * y se reintenta una vez. GPT Image 2 en high es más lento de por sí. Dos intentos caben en maxDuration.
 */
const TIMEOUT = { gemini: 45_000, openai: 120_000 } as const;

async function drawSlide(provider: "gemini" | "openai", prompt: string, images: ReferenceImage[]) {
  if (provider === "gemini") {
    const image = await generateGeminiImage({ prompt: `${prompt}\nAspect ratio 4:5.`, aspectRatio: "4:5", images, timeoutMs: TIMEOUT.gemini });
    return { bytes: image.bytes, mimeType: image.mimeType, usage: image.usage };
  }
  // GPT Image 2 no tiene 4:5: se pide 2:3 vertical, lo más cercano.
  const image = await generateOpenAiImage({ prompt: `${prompt}\nAspect ratio 2:3.`, size: "1024x1536", quality: "high", images, timeoutMs: TIMEOUT.openai });
  return { bytes: Buffer.from(image.base64, "base64"), mimeType: "image/webp", usage: imageUsage(1) };
}

async function withRetry<T>(work: () => Promise<T>) {
  try { return await work(); }
  catch { return await work(); }
}

/**
 * Carrusel dibujado entero por IA: se escribe el guion y cada slide sale como imagen final, con la marca.
 * Responde en NDJSON para que la página muestre el avance real: una línea por paso terminado y la última
 * con el resultado. Una slide que falla dos veces llega con `error` en vez de tirar el carrusel entero.
 */
export async function POST(request: Request) {
  const input = aiCarouselInputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "La solicitud de carrusel no es válida." }, { status: 400 });
  const { brand, error: brandError } = await brandOrError(input.data.brandKitId);
  if (brandError) return NextResponse.json({ error: brandError }, { status: 400 });
  const logo = brand?.logoAssetId ? await readAsset(brand.logoAssetId).catch(() => null) : null;
  const provider = input.data.provider;
  // Pasos: el guion + una imagen por slide.
  const total = input.data.slides + 1;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => controller.enqueue(new TextEncoder().encode(`${JSON.stringify(event)}\n`));
      let done = 0;
      const step = () => send({ type: "progress", done: ++done, total });
      try {
        const plan = await trackGeneration({ operation: "ai-carousel-plan", model: openAiModel("text") }, async () => {
          const created = await generateOpenAiJson({ system: "Eres director de arte y copywriter de carruseles. Responde solo JSON válido.", prompt: buildPlanPrompt(input.data, brandBrief(brand)) });
          return { value: parsePlan(created.value, input.data.slides), usage: created.usage };
        });
        step();
        const brandInfo = brand ? { name: brand.name, primaryColor: brand.primaryColor, hasLogo: Boolean(logo) } : undefined;
        // El modelo registrado lleva la calidad: gpt-image-2 en high tiene su propio precio en config/pricing.json.
        const model = provider === "gemini" ? geminiImageModel() : `${openAiModel("image")}-high`;
        // ponytail: todas en paralelo; si el proveedor empieza a devolver 429, pasar a lotes de 2-3.
        const slides = await Promise.all(plan.slides.map(async (slide, index) => {
          try {
            return await withRetry(() => trackGeneration({ operation: "ai-carousel-slide", provider, model }, async () => {
              const image = await drawSlide(provider, buildSlidePrompt(plan, index, brandInfo), logo ? [logo] : []);
              const asset = await storeAsset({ bytes: image.bytes, mimeType: image.mimeType, filename: `ai-carousel-${index + 1}.${image.mimeType.split("/")[1].replace("jpeg", "jpg")}` });
              return { value: { ...slide, url: `/api/assets/${asset.id}` as string | null, error: null as string | null }, usage: image.usage };
            }));
          }
          catch (error) { return { ...slide, url: null, error: error instanceof Error ? error.message : "No se pudo dibujar esta slide." }; }
          finally { step(); }
        }));
        send({ type: "done", style: plan.style, slides });
      }
      catch (error) { send({ type: "error", error: error instanceof Error ? error.message : "No se pudo crear el carrusel." }); }
      controller.close();
    },
  });
  return new Response(stream, { status: 201, headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" } });
}
