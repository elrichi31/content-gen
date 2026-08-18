import { NextResponse } from "next/server";
import { ArticleGenerationError, articleGenerationInputSchema, generateArticle, researchTopic } from "@/lib/article-generation";
import { siteIndex } from "@/lib/blog-export";
import { trackGeneration } from "@/lib/generation-runs";
import { openAiModel, OpenAiError } from "@/lib/openai";

/**
 * Redacta un artículo a partir del encargo del usuario. Devuelve un borrador sin guardar:
 * el artículo se revisa en el editor antes de que exista nada en la biblioteca.
 */
export async function POST(request: Request) {
  const parsed = articleGenerationInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "La solicitud no es válida." }, { status: 400 });

  // Si el sitio está configurado, se le ofrecen sus categorías para no inventar una nueva.
  const categories = await siteIndex().then((index) => index.categories, () => [] as string[]);
  try {
    // Investigar y redactar se registran por separado: son dos llamadas con costos muy distintos
    // (la primera paga búsquedas web) y mezclarlas impediría saber cuánto cuesta cada cosa.
    const research = parsed.data.webSearch
      ? await trackGeneration({ operation: "article-research", model: openAiModel("text") }, async () => {
        const done = await researchTopic(parsed.data);
        return { value: done, usage: done.usage };
      })
      : null;
    const { article, model, usage, sources } = await trackGeneration({ operation: "article-write", model: openAiModel("text") }, async () => {
      const written = await generateArticle(parsed.data, { categories, research });
      return { value: written, usage: written.usage };
    });
    return NextResponse.json({ article, model, usage, sources });
  } catch (error) {
    const status = error instanceof ArticleGenerationError || error instanceof OpenAiError ? error.status : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo generar el artículo." }, { status });
  }
}
