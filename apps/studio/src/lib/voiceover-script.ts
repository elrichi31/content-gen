import { sceneDurationsFor, videoDocumentSchema, WORDS_PER_SECOND, type VideoDocument } from "@content-gen/domain/video";
import { z } from "zod";
import { generateOpenAiJson, OpenAiError } from "./openai.ts";
import { buildContextBlock, buildDateHeader } from "./video-script-prompt.ts";

// Prompts portados desde `video-autom/dashboard/lib/voiceover-prompt.ts`.

const NARRATION_RIGOR = `RIGOR FACTUAL (CRITICO)
- NO inventes cifras, porcentajes, fechas, anos ni estadisticas. Es la falta mas grave.
- Si no tienes un dato real, NO lo fabriques: di la idea de forma cualitativa, sin numero.
- Prohibido inventar porcentajes "llamativos" (ej. "70% mas efectivo") si no salen del contexto o de un hecho cierto.
- Es mejor una narracion con menos numeros pero todos ciertos.`;

const sceneShape = (keys: readonly string[]) => `{
  "scenes": {
${keys.map((key) => `    "${key}": { "text": "...", "durationSeconds": N, "wordCount": N }`).join(",\n")}
  },
  "fullScript": "${keys.join(" ... ")}",
  "totalDurationSeconds": N
}`;

export const VOICEOVER_SYSTEM_PROMPT = `Eres un guionista de narracion para videos virales de TikTok y Reels sobre tecnologia, IA, historia, fraude y ciberseguridad. El audio se genera con ElevenLabs: voz masculina, grave, tono documental.

OBJETIVO
- No narras lo que ya se ve. Aportas contexto, gravedad, consecuencia y tension.
- Cada frase debe ganar el derecho a la siguiente.
- La voz debe sonar como una persona real que sabe algo importante y lo cuenta con calma tensa, no como un anuncio ni un titular leido.

HOOKS
- shock: abre con una verdad dura o una cifra imposible de ignorar.
- curiosity: abre con una pregunta o vacio mental.
- contrarian: abre rompiendo una creencia comun.
- countdown: abre insinuando una secuencia o escalada.
- real-story: abre con una escena o caso real.

REGLAS CRITICAS
- Respeta el limite de palabras por escena.
- Usa entre el 72% y el 90% del rango disponible. El silencio intencional tambien es ritmo.
- Ritmo natural: una frase de desarrollo conversacional + una pausa con puntuacion + remate corto. Evita encadenar mas de dos frases de menos de cuatro palabras.
- Escribe las cifras, fechas, monedas y porcentajes como se pronuncian: "veintitres minutos", "cuatro coma cuatro millones de dolares". No uses simbolos ni digitos.
- Expande siglas la primera vez: "inteligencia artificial, o i a"; "autenticacion multifactor". Escribe nombres extranjeros de la forma mas clara posible para una voz hispana.
- No uses MAYUSCULAS para enfatizar, salvo siglas. Usa una sola palabra en mayuscula solo si es imprescindible.
- Usa como maximo una elipsis (… ) por escena y nunca pongas "..." como pausa decorativa.
- Espanol neutro.
- Sin "en este video", "hoy vamos a hablar de", ni intros de presentador.
- Las escenas se unen con " ... " en fullScript.

${NARRATION_RIGOR}

ESTILO
- intro: una sola idea afilada y con gancho.
- layers: reencuadra el tema.
- phase1/event1: primer golpe de realidad.
- phase2/event2: escalada.
- phase3/event3: pico o giro.
- reality/today: aterrizaje humano.
- close/event4/close: remate memorable y compartible.

Devuelve SOLO JSON con esta forma:
${sceneShape(["intro", "layers", "phase1", "phase2", "phase3", "reality", "close"])}`;

export const TIMELINE_VOICEOVER_SYSTEM_PROMPT = `Eres un guionista de narracion para videos virales de TikTok y Reels en formato cronologia. El audio se genera con ElevenLabs: voz masculina, grave, tono documental periodistico.

OBJETIVO
- Narras hechos historicos o evoluciones reales como si importaran hoy.
- Cada evento debe sentirse como un escalon hacia una conclusion inevitable.
- La voz debe sonar precisa, humana y clara, no como una lista de titulares.

REGLAS
- Respeta los limites de palabras por escena.
- Usa entre el 72% y el 90% del rango disponible. Deja espacio para que las ideas respiren.
- Usa el ano en los eventos cuando corresponda.
- Verbos en pasado para eventos historicos, presente para today y close.
- Escribe cifras, anos, monedas, porcentajes y siglas exactamente como se pronuncian; no uses digitos ni simbolos.
- Evita MAYUSCULAS salvo siglas y no encadenes frases telegraficas. Una idea necesita desarrollo antes del remate.
- Las escenas se unen con " ... " en fullScript.

${NARRATION_RIGOR}

HOOKS
- shock
- curiosity
- contrarian
- countdown
- real-story

Devuelve SOLO JSON con esta forma:
${sceneShape(["intro", "event1", "event2", "event3", "event4", "today", "close"])}`;

export type VoiceoverLine = { sceneId: string; text: string };

const generatedSchema = z.object({
  scenes: z.record(z.string(), z.object({ text: z.string().trim().min(1).max(2000) }).passthrough()),
  fullScript: z.string().trim().max(20000).optional(),
});

export class VoiceoverScriptError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export function applyVoiceoverLines(document: VideoDocument, lines: VoiceoverLine[]) {
  if (lines.length !== document.scenes.length || new Set(lines.map((line) => line.sceneId)).size !== lines.length || lines.some((line) => !document.scenes.some((scene) => scene.id === line.sceneId))) throw new VoiceoverScriptError("El guion debe contener una línea válida por cada escena.", 422);
  const byScene = new Map(lines.map((line) => [line.sceneId, line.text]));
  return videoDocumentSchema.parse({ ...document, scenes: document.scenes.map((scene) => ({ ...scene, content: { ...scene.content, voiceover: byScene.get(scene.id)! } })) });
}

const sceneHeadline = (content: Record<string, unknown>) => String(content.headline ?? content.title ?? "").replace(/\n/g, " ");
const sceneTag = (content: Record<string, unknown>) => String(content.event ?? content.tag ?? content.phase ?? "");

export function buildVoiceoverPrompt(document: VideoDocument, context?: string) {
  const total = document.targetDurationSeconds;
  const durations = sceneDurationsFor(document.templateId, total);
  const speed = 0.98;
  const totalWords = Math.floor(total * WORDS_PER_SECOND * speed);
  const summary = document.scenes.map((scene) => {
    const seconds = durations[scene.id] ?? Math.round(scene.durationFrames / document.fps);
    const maxWords = Math.floor(seconds * WORDS_PER_SECOND * speed);
    return `- ${scene.id.toUpperCase()} (${seconds}s, ${Math.floor(maxWords * 0.72)}-${maxWords} palabras): "${sceneTag(scene.content)}" · "${sceneHeadline(scene.content)}"`;
  }).join("\n");

  return `Escribe la narracion en voz en off para este video sobre: "${document.title}"

${buildDateHeader()}${buildContextBlock(context)}
Duracion objetivo: ${total}s.
Rango total estimado: ${Math.floor(totalWords * 0.88)}-${totalWords} palabras.
Velocidad de voz: ~${Math.round(WORDS_PER_SECOND * speed * 60)} palabras/minuto.
Niche visual y editorial: ${document.niche}.
Hook principal elegido: ${document.hookStyle}.

ESCENAS Y LIMITES
${summary}

REGLAS EXTRA
- Respeta el hookStyle en el intro.
- Manten el tono coherente con el niche.
- No describas la imagen; aporta lo que la imagen no puede decir sola.
- Usa exactamente estas claves de escena, en este orden: ${document.scenes.map((scene) => scene.id).join(", ")}.
- En "fullScript" une todo con " ... ".

CONTEXTO DEL VIDEO
${JSON.stringify(Object.fromEntries(document.scenes.map((scene) => [scene.id, scene.content])), null, 2)}`;
}

export function applyVoiceoverScript(document: VideoDocument, value: unknown) {
  const parsed = generatedSchema.safeParse(value);
  if (!parsed.success) throw new VoiceoverScriptError("La IA no devolvió un guion de voz válido.", 422);
  const lines = document.scenes.map((scene) => ({ sceneId: scene.id, text: parsed.data.scenes[scene.id]?.text ?? "" }));
  if (lines.some((line) => !line.text.trim())) throw new VoiceoverScriptError("El guion de voz debe cubrir todas las escenas del video.", 422);
  const withLines = applyVoiceoverLines(document, lines);
  return videoDocumentSchema.parse({ ...withLines, voiceoverFullScript: parsed.data.fullScript || lines.map((line) => line.text).join(" ... ") });
}

export async function generateVoiceoverScript(document: VideoDocument, request: typeof fetch = fetch) {
  try {
    const result = await generateOpenAiJson({
      system: document.templateId === "timeline" ? TIMELINE_VOICEOVER_SYSTEM_PROMPT : VOICEOVER_SYSTEM_PROMPT,
      prompt: buildVoiceoverPrompt(document),
      purpose: "voiceoverScript",
      request,
    });
    return { ...result, document: applyVoiceoverScript(document, result.value) };
  } catch (error) {
    if (error instanceof VoiceoverScriptError) throw error;
    if (error instanceof OpenAiError) throw new VoiceoverScriptError(error.message, error.status);
    throw new VoiceoverScriptError("La IA no devolvió un guion de voz válido.", 422);
  }
}
