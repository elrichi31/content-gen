import assert from "node:assert/strict";
import { createElevenLabsSpeech, ElevenLabsError, listElevenLabsVoices } from "./elevenlabs.ts";

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
assert.equal(sent.text, "¿Y ahora?"); assert.equal(sent.previous_text, undefined, "Eleven v3 no admite texto de contexto");

// Paginación: sigue `next_page_token` mientras `has_more` y no repite voces.
const pages: string[] = [];
const paged = await listElevenLabsVoices(async (url) => { pages.push(String(url)); return new Response(JSON.stringify(pages.length === 1 ? { voices: [{ voice_id: "voice0001", name: "Uno" }], has_more: true, next_page_token: "tok/2" } : { voices: [{ voice_id: "voice0001", name: "Uno" }, { voice_id: "voice0002", name: "Dos" }], has_more: false })); });
assert.deepEqual(paged.map((voice) => voice.voice_id).sort(), ["voice0001", "voice0002"], "junta las páginas sin duplicar");
assert.match(pages[1], /next_page_token=tok%2F2$/, "pide la página siguiente con su token");

// Errores: cada caso dice qué pasó y solo los pasajeros se reintentan.
const failing = (status: number, detail: object = {}) => async () => new Response(JSON.stringify({ detail }), { status });
const speak = (request: typeof fetch) => createElevenLabsSpeech({ voiceId: "spanish01", text: "Hola", request, retryDelays: [0, 0] });
const rejects = (request: typeof fetch, message: RegExp, status: number, label: string) => assert.rejects(() => speak(request), (error: unknown) => error instanceof ElevenLabsError && message.test(error.message) && error.status === status, label);
await rejects(failing(402, { code: "insufficient_credits" }), /créditos/, 402, "sin créditos");
await rejects(failing(401, { status: "quota_exceeded" }), /créditos/, 402, "el formato antiguo manda la cuota agotada como 401");
await rejects(failing(403, { code: "voice_access_denied" }), /acceso a esta voz/, 403, "voz fuera del plan no es credencial rechazada");
await rejects(failing(404, { code: "voice_not_found" }), /ya no existe/, 400, "voz inexistente");
await rejects(failing(400, { code: "text_too_long" }), /text_too_long/, 400, "validación con su código");
await rejects(failing(500), /no pudo completar/, 502, "fallo del proveedor");
let calls = 0;
await rejects(async () => { calls++; return new Response(JSON.stringify({ detail: { code: "concurrent_limit_exceeded" } }), { status: 429 }); }, /a la vez/, 429, "límite de concurrencia, agotados los reintentos");
assert.equal(calls, 3, "reintenta dos veces antes de rendirse");
calls = 0;
const recovered = await speak(async () => ++calls === 1 ? new Response("{}", { status: 503 }) : timestamped([7]));
assert.deepEqual([...recovered.bytes], [7], "un 503 pasajero se recupera al reintentar");
calls = 0;
await rejects(async () => { calls++; return new Response("{}", { status: 400 }); }, /rechazó la solicitud/, 400, "un error de la solicitud");
assert.equal(calls, 1, "no reintenta lo que no es pasajero");
console.log("ElevenLabs: voces paginadas, errores, reintentos y MP3 validados.");
