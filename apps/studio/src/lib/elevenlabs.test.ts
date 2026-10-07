import assert from "node:assert/strict";
import { createElevenLabsSpeech, listElevenLabsVoices } from "./elevenlabs.ts";

process.env.ELEVENLABS_API_KEY = "test";
const voices = await listElevenLabsVoices(async () => new Response(JSON.stringify({ voices: [{ voice_id: "english01", name: "Adam", labels: { language: "English" } }, { voice_id: "spanish01", name: "Sofía", labels: { language: "Spanish" }, preview_url: null }] })));
assert.equal(voices[0].voice_id, "spanish01", "prioriza voces etiquetadas en español");
await assert.rejects(() => listElevenLabsVoices(async () => new Response("{}", { status: 401 })), /credencial/, "traduce autorización inválida");
const speech = await createElevenLabsSpeech({ voiceId: "spanish01", text: "Hola mundo", request: async (_url, init) => { assert.match(String(init?.body), /eleven_multilingual_v2/); return new Response(new Uint8Array([73, 68, 51]), { headers: { "Content-Type": "audio/mpeg" } }); } });
assert.equal(speech.mimeType, "audio/mpeg", "devuelve MP3 compatible");
let sent: Record<string, unknown> = {};
await createElevenLabsSpeech({ voiceId: "spanish01", text: "Y nadie lo vio venir…", previousText: "Antes.", nextText: "Después.", request: async (_url, init) => { sent = JSON.parse(String(init?.body)); return new Response(new Uint8Array([1])); } });
assert.equal(sent.text, "Y nadie lo vio venir.", "cierra con punto para que no se coma la última palabra");
assert.equal(sent.previous_text, "Antes."); assert.equal(sent.next_text, "Después.", "manda las escenas vecinas para la entonación");
await createElevenLabsSpeech({ voiceId: "spanish01", text: "¿Y ahora?", modelId: "eleven_v3", previousText: "Antes.", request: async (_url, init) => { sent = JSON.parse(String(init?.body)); return new Response(new Uint8Array([1])); } });
assert.equal(sent.text, "¿Y ahora?"); assert.equal(sent.previous_text, undefined, "Eleven v3 no admite texto de contexto"); console.log("ElevenLabs: voces, autorización y MP3 validados.");
