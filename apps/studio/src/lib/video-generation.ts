import {
  accentPairSchema, DEFAULT_ACCENTS, DEFAULT_TARGET_DURATION, SCENE_KEYS_BY_TEMPLATE, SCENE_KIND_BY_KEY, sceneDurationsFor,
  VIDEO_DEFAULTS, videoDocumentSchema, type AccentPair, type VideoDocument, type VideoSceneKey, type VideoTemplateId,
} from "@content-gen/domain/video";
import { z } from "zod";
import { generateOpenAiJson, generateOpenAiText, OpenAiError, webSearchTool } from "./openai.ts";
import {
  buildTimelineUserPrompt, buildUserPrompt, normalizeHookStyle, normalizeNiche,
  SYSTEM_PROMPT, TIMELINE_SYSTEM_PROMPT, type PromptDirection,
} from "./video-script-prompt.ts";

export const videoGenerationInputSchema = z.object({
  topic: z.string().trim().min(3).max(240),
  audience: z.string().trim().max(160).default(""),
  tone: z.string().trim().max(120).default(""),
  language: z.string().trim().min(2).max(40).default("es"),
  context: z.string().trim().max(12000).default(""),
  targetDurationSeconds: z.number().int().min(15).max(180).default(DEFAULT_TARGET_DURATION),
  campaignId: z.string().min(1).optional(),
  /** Buscar en internet datos y fuentes del tema antes de redactar el guion. */
  webSearch: z.boolean().default(true),
});
export type VideoGenerationInput = z.infer<typeof videoGenerationInputSchema>;
type VideoGenerationRequest = z.input<typeof videoGenerationInputSchema> & { brandName?: string; primaryColor?: string };

export class VideoGenerationError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

const line = (max: number) => z.string().trim().min(1).max(max);
const introScene = z.object({ tag: line(80), title: line(180), subtitle: line(240) });
const layersScene = z.object({ tag: line(80), terminal: z.array(line(120)).min(2).max(6), definition: line(400), detail: line(400).optional().default("") });
const phaseScene = z.object({ phase: line(80).optional().default(""), timestamp: line(80), title: line(180), narrative: line(600).optional().default(""), detail: line(400).optional().default(""), indicator: z.array(line(160)).min(1).max(4) });
const actionsScene = z.object({ tag: line(80), title: line(400), actions: z.array(line(160)).min(2).max(6) });
const closeScene = z.object({ tag: line(80), title: line(180), subtitle: line(240) });
const eventScene = z.object({ event: line(80), year: z.union([z.string().trim().min(1).max(12), z.number().int()]).transform(String), headline: line(180), impact: line(400) });

const scriptBase = {
  slug: z.string().trim().min(1).max(160).optional(),
  displayTitle: z.string().trim().min(1).max(180),
  niche: z.unknown().optional(),
  hookStyle: z.unknown().optional(),
  accents: z.record(z.string(), z.unknown()).optional().default({}),
  imagePrompts: z.record(z.string(), z.string()).optional().default({}),
};
const standardScriptSchema = z.object({ ...scriptBase, scenes: z.object({ intro: introScene, layers: layersScene, phase1: phaseScene, phase2: phaseScene, phase3: phaseScene, reality: actionsScene, close: closeScene }) });
const timelineScriptSchema = z.object({ ...scriptBase, scenes: z.object({ intro: introScene, event1: eventScene, event2: eventScene, event3: eventScene, event4: eventScene, today: actionsScene, close: closeScene }) });

const accentFor = (key: VideoSceneKey, accents: Record<string, unknown>): AccentPair => {
  const parsed = accentPairSchema.safeParse(accents[key]);
  return parsed.success ? parsed.data : [...DEFAULT_ACCENTS[key]] as AccentPair;
};

function toDocument(templateId: VideoTemplateId, script: z.infer<typeof standardScriptSchema> | z.infer<typeof timelineScriptSchema>, input: VideoGenerationInput): VideoDocument {
  const durations = sceneDurationsFor(templateId, input.targetDurationSeconds);
  const scenes = script.scenes as Record<string, Record<string, unknown>>;
  return videoDocumentSchema.parse({
    schemaVersion: 1,
    slug: script.slug || input.topic,
    templateId,
    title: script.displayTitle,
    niche: normalizeNiche(script.niche, input.topic),
    hookStyle: normalizeHookStyle(script.hookStyle),
    targetDurationSeconds: input.targetDurationSeconds,
    ...VIDEO_DEFAULTS,
    scenes: SCENE_KEYS_BY_TEMPLATE[templateId].map((key) => ({
      id: key,
      kind: SCENE_KIND_BY_KEY[key],
      durationFrames: durations[key] * VIDEO_DEFAULTS.fps,
      accent: accentFor(key, script.accents),
      content: { ...scenes[key], ...(script.imagePrompts[key] ? { imagePrompt: script.imagePrompts[key] } : {}) },
    })),
  });
}

const direction = (input: VideoGenerationRequest): PromptDirection => ({ audience: input.audience, tone: input.tone, language: input.language, brandName: input.brandName, primaryColor: input.primaryColor });

export const buildStandardVideoPrompt = (input: VideoGenerationInput & { brandName?: string; primaryColor?: string }) =>
  buildUserPrompt(input.topic, input.context, input.targetDurationSeconds, direction(input));
export const buildTimelineVideoPrompt = (input: VideoGenerationInput & { brandName?: string; primaryColor?: string }) =>
  buildTimelineUserPrompt(input.topic, input.context, input.targetDurationSeconds, direction(input));

export function normalizeStandardVideoScript(value: unknown, input: VideoGenerationInput): VideoDocument {
  const parsed = standardScriptSchema.safeParse(value);
  if (!parsed.success) throw new VideoGenerationError("La IA debe devolver las siete escenas del guion estándar: intro, layers, phase1, phase2, phase3, reality y close.", 422);
  try { return toDocument("standard", parsed.data, input); }
  catch { throw new VideoGenerationError("La IA no devolvió un VideoDocument estándar válido.", 422); }
}

export function normalizeTimelineVideoScript(value: unknown, input: VideoGenerationInput): VideoDocument {
  const parsed = timelineScriptSchema.safeParse(value);
  if (!parsed.success) throw new VideoGenerationError("La IA debe devolver las siete escenas de la cronología: intro, event1, event2, event3, event4, today y close.", 422);
  const years = [parsed.data.scenes.event1, parsed.data.scenes.event2, parsed.data.scenes.event3, parsed.data.scenes.event4].map((event) => Number(event.year));
  if (years.some((year, index) => index > 0 && Number.isFinite(year) && Number.isFinite(years[index - 1]) && year < years[index - 1])) throw new VideoGenerationError("Los cuatro eventos cronológicos deben ir en orden ascendente.", 422);
  try { return toDocument("timeline", parsed.data, input); }
  catch { throw new VideoGenerationError("La IA no devolvió un VideoDocument timeline válido.", 422); }
}

const RESEARCH_SYSTEM = [
  "Eres investigador para guiones de videos cortos de divulgación (TikTok, Reels).",
  "Buscas en internet, priorizas fuentes primarias, oficiales y recientes, y anotas cada dato (cifra, fecha, caso real) con la fuente que lo respalda.",
  "Si algo no lo encuentras verificado, lo dices en vez de estimarlo.",
].join(" ");

/**
 * Paso 1 del guion: el modelo busca en internet sobre el tema y vuelve con notas y fuentes.
 * Va aparte porque la Responses API no admite `web_search` junto al modo JSON del paso 2.
 */
export async function researchVideoTopic(input: VideoGenerationInput, request: typeof fetch = fetch) {
  const { text, sources, usage, model } = await generateOpenAiText({
    system: RESEARCH_SYSTEM,
    prompt: [
      `Investiga para un video de ${input.targetDurationSeconds} segundos sobre: ${input.topic}`,
      input.context ? `Contexto que dio el usuario (verifícalo y compleméntalo):\n${input.context.slice(0, 4000)}` : "",
      `Idioma de las notas: ${input.language}.`,
      "Devuelve notas en texto plano, máximo 400 palabras: hechos concretos, cifras con su fecha, casos reales recientes y qué fuente respalda cada uno. Marca lo que no hayas podido verificar.",
    ].filter(Boolean).join("\n"),
    purpose: "research",
    tools: [webSearchTool({ contextSize: "medium" })],
    timeoutMs: 300_000,
    request,
  });
  return { notes: text, sources, usage, model };
}
export type VideoResearch = Awaited<ReturnType<typeof researchVideoTopic>>;

/** Las notas entran como contexto (la «única fuente de datos» del prompt) detrás del del usuario. */
export const withResearchContext = (context: string, research: VideoResearch | null) =>
  // El bloque de contexto se recorta a 12000 caracteres: se reserva sitio para las notas.
  research ? [context.slice(0, 9000), `INVESTIGACION EN INTERNET (datos con fuente; no los contradigas ni inventes otros):\n${research.notes}`].filter(Boolean).join("\n\n") : context;

/** Lo que se guarda en el documento: las notas (las usa también el guion de voz) y las fuentes. */
export const researchField = (research: VideoResearch | null) => research ? { research: { notes: research.notes, sources: research.sources } } : {};

async function run(templateId: VideoTemplateId, input: VideoGenerationRequest, request: typeof fetch) {
  const parsed = { ...input, ...videoGenerationInputSchema.parse(input) };
  const timeline = templateId === "timeline";
  try {
    const research = parsed.webSearch ? await researchVideoTopic(parsed, request) : null;
    const resolved = { ...parsed, context: withResearchContext(parsed.context, research) };
    const result = await generateOpenAiJson({
      system: timeline ? TIMELINE_SYSTEM_PROMPT : SYSTEM_PROMPT,
      prompt: timeline ? buildTimelineVideoPrompt(resolved) : buildStandardVideoPrompt(resolved),
      purpose: "script",
      request,
    });
    const document = timeline ? normalizeTimelineVideoScript(result.value, resolved) : normalizeStandardVideoScript(result.value, resolved);
    return { ...result, research, document: videoDocumentSchema.parse({ ...document, ...researchField(research) }) };
  } catch (error) {
    if (error instanceof VideoGenerationError) throw error;
    if (error instanceof OpenAiError) throw new VideoGenerationError(error.message, error.status);
    throw new VideoGenerationError(timeline ? "No se pudo generar la cronología de video." : "No se pudo generar el guion de video.", 502);
  }
}

export const generateStandardVideoScriptRun = (input: VideoGenerationRequest, request: typeof fetch = fetch) => run("standard", input, request);
export const generateTimelineVideoScriptRun = (input: VideoGenerationRequest, request: typeof fetch = fetch) => run("timeline", input, request);
export const generateStandardVideoScript = async (input: VideoGenerationRequest, request: typeof fetch = fetch) => (await run("standard", input, request)).document;
export const generateTimelineVideoScript = async (input: VideoGenerationRequest, request: typeof fetch = fetch) => (await run("timeline", input, request)).document;
