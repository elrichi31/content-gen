import { z } from "zod";
import { normalizeTextForTts, voiceSettingsFor } from "./tts-text.ts";

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

export async function createElevenLabsSpeech({ voiceId, text, modelId = "eleven_multilingual_v2", request = fetch }: { voiceId: string; text: string; modelId?: string; request?: typeof fetch }) {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(voiceId) || !text.trim() || text.length > 5000 || !/^[A-Za-z0-9_.-]{3,80}$/.test(modelId)) throw new ElevenLabsError("Configuración de voz inválida.", 400);
  // Mismo preprocesado y mismos ajustes de voz que `video-autom`: 128 kbps aguanta la recompresión de TikTok/Reels.
  const response = await request(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, { method: "POST", headers: { "xi-api-key": key(), "Content-Type": "application/json", Accept: "audio/mpeg" }, signal: AbortSignal.timeout(120_000), body: JSON.stringify({ text: normalizeTextForTts(text), model_id: modelId, language_code: "es", voice_settings: voiceSettingsFor(modelId) }) });
  if (!response.ok) throw providerError(response.status); const bytes = Buffer.from(await response.arrayBuffer()); if (!bytes.length) throw new ElevenLabsError("ElevenLabs devolvió audio vacío.", 502); return { bytes, mimeType: "audio/mpeg", filename: "elevenlabs-voice.mp3", modelId };
}
