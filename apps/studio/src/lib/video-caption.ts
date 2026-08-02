import { videoDocumentSchema, type VideoDocument } from "@content-gen/domain/video";
import { z } from "zod";
import { generateOpenAiJson, OpenAiError } from "./openai.ts";

export const videoCaptionSchema = z.object({ text: z.string().trim().min(1).max(2200), hashtags: z.array(z.string().trim().min(1).max(80)).max(30).default([]) });
export type VideoCaption = z.infer<typeof videoCaptionSchema>;
export class VideoCaptionError extends Error { readonly status: number; constructor(message: string, status: number) { super(message); this.status = status; } }

export function applyVideoCaption(document: VideoDocument, value: unknown) {
  const parsed = videoCaptionSchema.safeParse(value); if (!parsed.success) throw new VideoCaptionError("El caption de video no es válido.", 422);
  const hashtags = [...new Set(parsed.data.hashtags.map((tag) => `#${tag.replace(/^#+/, "").replace(/\s+/g, "")}`).filter((tag) => tag.length > 1))];
  return videoDocumentSchema.parse({ ...document, caption: { text: parsed.data.text, hashtags } });
}

export function captionText(document: VideoDocument) {
  const caption = videoCaptionSchema.safeParse((document as VideoDocument & { caption?: unknown }).caption); return caption.success ? `${caption.data.text}${caption.data.hashtags.length ? `\n\n${caption.data.hashtags.join(" ")}` : ""}` : "";
}

export async function generateVideoCaption(document: VideoDocument, request: typeof fetch = fetch) {
  const prompt = `Devuelve ÚNICAMENTE JSON {text,hashtags}. Escribe un caption TikTok en español para este video, con gancho, contexto breve, CTA y hasta 8 hashtags relevantes: ${JSON.stringify({ title: document.title, scenes: document.scenes.map((scene) => scene.content) })}`;
  try { const result = await generateOpenAiJson({ system: "Generas captions para TikTok. Responde solo JSON válido.", prompt, request }); return { ...result, document: applyVideoCaption(document, result.value) }; }
  catch (error) { if (error instanceof VideoCaptionError) throw error; if (error instanceof OpenAiError) throw new VideoCaptionError(error.message, error.status); throw new VideoCaptionError("La IA no devolvió un caption válido.", 422); }
}
