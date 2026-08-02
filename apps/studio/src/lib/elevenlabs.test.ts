import assert from "node:assert/strict";
import { createElevenLabsSpeech, listElevenLabsVoices } from "./elevenlabs.ts";

process.env.ELEVENLABS_API_KEY = "test";
const voices = await listElevenLabsVoices(async () => new Response(JSON.stringify({ voices: [{ voice_id: "english01", name: "Adam", labels: { language: "English" } }, { voice_id: "spanish01", name: "Sofía", labels: { language: "Spanish" }, preview_url: null }] })));
assert.equal(voices[0].voice_id, "spanish01", "prioriza voces etiquetadas en español");
await assert.rejects(() => listElevenLabsVoices(async () => new Response("{}", { status: 401 })), /credencial/, "traduce autorización inválida");
const speech = await createElevenLabsSpeech({ voiceId: "spanish01", text: "Hola mundo", request: async (_url, init) => { assert.match(String(init?.body), /eleven_multilingual_v2/); return new Response(new Uint8Array([73, 68, 51]), { headers: { "Content-Type": "audio/mpeg" } }); } });
assert.equal(speech.mimeType, "audio/mpeg", "devuelve MP3 compatible"); console.log("ElevenLabs: voces, autorización y MP3 validados.");
