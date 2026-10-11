import { wordsFromAlignment, type WordTiming } from "@content-gen/domain/canvas";
import { speechUsage } from "@content-gen/domain/cost";
import { z } from "zod";
import { normalizeTextForTts, supportsContextText, voiceSettingsFor } from "./tts-text.ts";

const voiceSchema = z.object({ voice_id: z.string().min(1), name: z.string().min(1), category: z.string().default("premade"), labels: z.record(z.string(), z.string()).default({}), preview_url: z.string().url().nullable().default(null) });
export type ElevenLabsVoice = z.infer<typeof voiceSchema>;
export class ElevenLabsError extends Error { readonly status: number; constructor(message: string, status: number) { super(message); this.status = status; } }

function key() { const value = process.env.ELEVENLABS_API_KEY?.trim(); if (!value) throw new ElevenLabsError("Falta configurar ELEVENLABS_API_KEY.", 503); return value; }
/**
 * Traduce el error de ElevenLabs a algo accionable. El cuerpo trae `detail.code` (`status` en
 * respuestas antiguas, que además mandaban la falta de créditos como 401 `quota_exceeded`).
 */
async function providerError(response: Response) {
  const body = await response.json().catch(() => null) as { detail?: { code?: unknown; status?: unknown } } | null;
  const code = [body?.detail?.code, body?.detail?.status].find((value): value is string => typeof value === "string" && /^[a-z0-9_]{1,60}$/.test(value)) ?? "";
  const status = response.status;
  if (status === 402 || code === "insufficient_credits" || code === "quota_exceeded") return new ElevenLabsError("ElevenLabs no tiene créditos suficientes. Recarga la cuenta o cambia de plan.", 402);
  if (status === 401) return new ElevenLabsError("ElevenLabs rechazó la credencial configurada.", 401);
  if (code === "voice_access_denied") return new ElevenLabsError("Tu plan de ElevenLabs no da acceso a esta voz. Elige otra.", 403);
  if (code === "model_access_denied") return new ElevenLabsError("Tu plan de ElevenLabs no da acceso a este modelo de voz.", 403);
  if (status === 403) return new ElevenLabsError("ElevenLabs no permite esta acción con tu clave o tu plan.", 403);
  if (status === 404) return new ElevenLabsError(code === "model_not_found" ? "El modelo de voz no existe en ElevenLabs." : "La voz ya no existe en ElevenLabs. Elige otra.", 400);
  if (status === 429) return new ElevenLabsError(code === "concurrent_limit_exceeded" ? "ElevenLabs ya está generando el máximo de audios a la vez que permite tu plan. Espera a que terminen." : "ElevenLabs está saturado o llegaste al límite de peticiones. Inténtalo en un momento.", 429);
  if (status === 400 || status === 422) return new ElevenLabsError(`ElevenLabs rechazó la solicitud${code ? ` (${code})` : ""}.`, 400);
  return new ElevenLabsError("ElevenLabs no pudo completar la solicitud.", 502);
}

const RETRY_DELAYS = [1000, 3000];
/** 429 y 503 son pasajeros: la petición no llegó a procesarse (ni a cobrarse), así que se reintenta con espera. */
async function send(request: typeof fetch, url: string, init: () => RequestInit, retryDelays: number[]) {
  for (let attempt = 0; ; attempt++) {
    const response = await request(url, init());
    if (response.ok) return response;
    if (![429, 503].includes(response.status) || attempt >= retryDelays.length) throw await providerError(response);
    await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
  }
}
function spanish(voice: ElevenLabsVoice) { return /spanish|español|espanol|es-mx|es-es|mexic|latam|latin/i.test(Object.values(voice.labels).join(" ")); }

export async function listElevenLabsVoices(request: typeof fetch = fetch, retryDelays = RETRY_DELAYS) {
  const voices: unknown[] = [];
  // ponytail: tope de 10 páginas (1000 voces); subirlo si alguna cuenta lo supera.
  for (let page = 0, token = ""; page < 10; page++) {
    const response = await send(request, `https://api.elevenlabs.io/v2/voices?page_size=100&include_total_count=false${token ? `&next_page_token=${encodeURIComponent(token)}` : ""}`, () => ({ headers: { "xi-api-key": key() }, signal: AbortSignal.timeout(30_000) }), retryDelays);
    const body = await response.json().catch(() => null) as { voices?: unknown[]; has_more?: boolean; next_page_token?: string | null } | null;
    voices.push(...(body?.voices ?? []));
    if (!body?.has_more || !body.next_page_token) break;
    token = body.next_page_token;
  }
  // La primera página puede repetir voces por defecto: se queda una por id.
  const parsed = voices.map((voice) => voiceSchema.safeParse(voice)).filter((result) => result.success).map((result) => result.data);
  return [...new Map(parsed.map((voice) => [voice.voice_id, voice])).values()].sort((a, b) => Number(spanish(b)) - Number(spanish(a)) || a.name.localeCompare(b.name));
}

/**
 * `previousText`/`nextText`: la narración de las escenas vecinas. ElevenLabs no las lee (ni las
 * cobra) pero ajusta la entonación para que la escena no arranque ni cierre como frase suelta.
 */
export async function createElevenLabsSpeech({ voiceId, text, modelId = "eleven_multilingual_v2", previousText, nextText, request = fetch, retryDelays = RETRY_DELAYS }: { voiceId: string; text: string; modelId?: string; previousText?: string; nextText?: string; request?: typeof fetch; retryDelays?: number[] }) {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(voiceId) || !text.trim() || text.length > 5000 || !/^[A-Za-z0-9_.-]{3,80}$/.test(modelId)) throw new ElevenLabsError("Configuración de voz inválida.", 400);
  // Mismo preprocesado y mismos ajustes de voz que `video-autom`: 128 kbps aguanta la recompresión de TikTok/Reels.
  // Se cobra por carácter enviado, así que el consumo se mide sobre el texto ya preprocesado.
  const spoken = normalizeTextForTts(text);
  const context = supportsContextText(modelId) ? {
    ...(previousText?.trim() ? { previous_text: normalizeTextForTts(previousText).slice(-1000) } : {}),
    ...(nextText?.trim() ? { next_text: normalizeTextForTts(nextText).slice(0, 1000) } : {}),
  } : {};
  // `/with-timestamps` devuelve el mismo MP3 (en base64) más el tiempo de cada carácter, al mismo precio.
  // Con eso el motor Canvas dispara cada animación y cada subtítulo justo cuando se dice la palabra.
  const response = await send(request, `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`, () => ({ method: "POST", headers: { "xi-api-key": key(), "Content-Type": "application/json", Accept: "application/json" }, signal: AbortSignal.timeout(120_000), body: JSON.stringify({ text: spoken, model_id: modelId, language_code: "es", voice_settings: voiceSettingsFor(modelId), ...context }) }), retryDelays);
  const body = timestampedSchema.safeParse(await response.json().catch(() => null)); if (!body.success) throw new ElevenLabsError("ElevenLabs devolvió una respuesta inesperada.", 502);
  const bytes = Buffer.from(body.data.audio_base64, "base64"); if (!bytes.length) throw new ElevenLabsError("ElevenLabs devolvió audio vacío.", 502);
  const words: WordTiming[] = body.data.alignment ? wordsFromAlignment(body.data.alignment) : [];
  return { bytes, mimeType: "audio/mpeg", filename: "elevenlabs-voice.mp3", modelId, usage: speechUsage(spoken.length), words };
}

const timestampedSchema = z.object({
  audio_base64: z.string(),
  alignment: z.object({ characters: z.array(z.string()), character_start_times_seconds: z.array(z.number()), character_end_times_seconds: z.array(z.number()) }).nullable().optional(),
});
