import { wordsFromAlignment, type WordTiming } from "@content-gen/domain/canvas";
import { speechUsage } from "@content-gen/domain/cost";
import { z } from "zod";
import { normalizeTextForTts, supportsContextText, voiceSettingsFor } from "./tts-text.ts";

const voiceSchema = z.object({ voice_id: z.string().min(1), name: z.string().min(1), category: z.string().default("premade"), labels: z.record(z.string(), z.string()).default({}), preview_url: z.string().url().nullable().default(null) });
export type ElevenLabsVoice = z.infer<typeof voiceSchema>;
export class ElevenLabsError extends Error { readonly status: number; constructor(message: string, status: number) { super(message); this.status = status; } }

function key() { const value = process.env.ELEVENLABS_API_KEY?.trim(); if (!value) throw new ElevenLabsError("Falta configurar ELEVENLABS_API_KEY.", 503); return value; }
function providerError(status: number) { return status === 401 || status === 403 ? new ElevenLabsError("ElevenLabs rechazó la credencial configurada.", status) : new ElevenLabsError("ElevenLabs no pudo completar la solicitud.", 502); }
function spanish(voice: ElevenLabsVoice) { return /spanish|español|espanol|es-mx|es-es|mexic|latam|latin/i.test(Object.values(voice.labels).join(" ")); }

export async function listElevenLabsVoices(request: typeof fetch = fetch) {
  const response = await request("https://api.elevenlabs.io/v2/voices?page_size=100&include_total_count=false", { headers: { "xi-api-key": key() }, signal: AbortSignal.timeout(30_000) });
  const body = await response.json().catch(() => null) as { voices?: unknown[] } | null; if (!response.ok) throw providerError(response.status);
  return (body?.voices ?? []).map((voice) => voiceSchema.safeParse(voice)).filter((result) => result.success).map((result) => result.data).sort((a, b) => Number(spanish(b)) - Number(spanish(a)) || a.name.localeCompare(b.name));
}

/**
 * `previousText`/`nextText`: la narración de las escenas vecinas. ElevenLabs no las lee (ni las
 * cobra) pero ajusta la entonación para que la escena no arranque ni cierre como frase suelta.
 */
export async function createElevenLabsSpeech({ voiceId, text, modelId = "eleven_multilingual_v2", previousText, nextText, request = fetch }: { voiceId: string; text: string; modelId?: string; previousText?: string; nextText?: string; request?: typeof fetch }) {
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
  const response = await request(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`, { method: "POST", headers: { "xi-api-key": key(), "Content-Type": "application/json", Accept: "application/json" }, signal: AbortSignal.timeout(120_000), body: JSON.stringify({ text: spoken, model_id: modelId, language_code: "es", voice_settings: voiceSettingsFor(modelId), ...context }) });
  if (!response.ok) throw providerError(response.status);
  const body = timestampedSchema.safeParse(await response.json().catch(() => null)); if (!body.success) throw new ElevenLabsError("ElevenLabs devolvió una respuesta inesperada.", 502);
  const bytes = Buffer.from(body.data.audio_base64, "base64"); if (!bytes.length) throw new ElevenLabsError("ElevenLabs devolvió audio vacío.", 502);
  const words: WordTiming[] = body.data.alignment ? wordsFromAlignment(body.data.alignment) : [];
  return { bytes, mimeType: "audio/mpeg", filename: "elevenlabs-voice.mp3", modelId, usage: speechUsage(spoken.length), words };
}

const timestampedSchema = z.object({
  audio_base64: z.string(),
  alignment: z.object({ characters: z.array(z.string()), character_start_times_seconds: z.array(z.number()), character_end_times_seconds: z.array(z.number()) }).nullable().optional(),
});
