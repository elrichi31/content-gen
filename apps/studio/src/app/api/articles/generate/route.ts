import { NextResponse } from "next/server";
import { ArticleGenerationError, articleGenerationInputSchema, generateArticle } from "@/lib/article-generation";
import { siteIndex } from "@/lib/blog-export";
import { OpenAiError } from "@/lib/openai";

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
    const { article, model, usage, sources } = await generateArticle(parsed.data, { categories });
    return NextResponse.json({ article, model, usage, sources });
  } catch (error) {
    const status = error instanceof ArticleGenerationError || error instanceof OpenAiError ? error.status : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo generar el artículo." }, { status });
  }
}
