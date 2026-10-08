import assert from "node:assert/strict";
import { createElevenLabsSpeech, listElevenLabsVoices } from "./elevenlabs.ts";

// Respuesta de `/with-timestamps`: MP3 en base64 más la alineación por carácter.
const timestamped = (bytes: number[], alignment: unknown = null) => new Response(JSON.stringify({ audio_base64: Buffer.from(bytes).toString("base64"), alignment }), { headers: { "Content-Type": "application/json" } });

process.env.ELEVENLABS_API_KEY = "test";
const voices = await listElevenLabsVoices(async () => new Response(JSON.stringify({ voices: [{ voice_id: "english01", name: "Adam", labels: { language: "English" } }, { voice_id: "spanish01", name: "Sofía", labels: { language: "Spanish" }, preview_url: null }] })));
assert.equal(voices[0].voice_id, "spanish01", "prioriza voces etiquetadas en español");
await assert.rejects(() => listElevenLabsVoices(async () => new Response("{}", { status: 401 })), /credencial/, "traduce autorización inválida");
const speech = await createElevenLabsSpeech({ voiceId: "spanish01", text: "Hola mundo", request: async (url, init) => { assert.match(String(url), /\/with-timestamps\?output_format=mp3_44100_128$/); assert.match(String(init?.body), /eleven_multilingual_v2/); return timestamped([73, 68, 51], { characters: [..."Hola mundo."], character_start_times_seconds: [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1], character_end_times_seconds: [.1, .2, .3, .4, .5, .6, .7, .8, .9, 1, 1.1] }); } });
assert.equal(speech.mimeType, "audio/mpeg", "devuelve MP3 compatible");
assert.deepEqual([...speech.bytes], [73, 68, 51], "decodifica el MP3 del base64");
assert.deepEqual(speech.words, [{ w: "Hola", s: 0, e: 0.4 }, { w: "mundo.", s: 0.5, e: 1.1 }], "convierte la alineación en tiempos por palabra");
await assert.rejects(() => createElevenLabsSpeech({ voiceId: "spanish01", text: "Hola", request: async () => new Response("no json") }), /inesperada/, "una respuesta sin audio es un error claro");
let sent: Record<string, unknown> = {};
await createElevenLabsSpeech({ voiceId: "spanish01", text: "Y nadie lo vio venir…", previousText: "Antes.", nextText: "Después.", request: async (_url, init) => { sent = JSON.parse(String(init?.body)); return timestamped([1]); } });
assert.equal(sent.text, "Y nadie lo vio venir.", "cierra con punto para que no se coma la última palabra");
assert.equal(sent.previous_text, "Antes."); assert.equal(sent.next_text, "Después.", "manda las escenas vecinas para la entonación");
await createElevenLabsSpeech({ voiceId: "spanish01", text: "¿Y ahora?", modelId: "eleven_v3", previousText: "Antes.", request: async (_url, init) => { sent = JSON.parse(String(init?.body)); return timestamped([1]); } });
assert.equal(sent.text, "¿Y ahora?"); assert.equal(sent.previous_text, undefined, "Eleven v3 no admite texto de contexto"); console.log("ElevenLabs: voces, autorización y MP3 validados.");
