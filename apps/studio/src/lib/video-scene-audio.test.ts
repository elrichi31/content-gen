import assert from "node:assert/strict";
import { STANDARD_SCENE_KEYS, TAIL_FRAMES, videoDocumentSchema } from "@content-gen/domain/video";
import { audioDurationSeconds, replaceSceneAudio } from "./video-scene-audio.ts";

const oldId = "11111111-1111-4111-8111-111111111111"; const newId = "22222222-2222-4222-8222-222222222222";
const kinds = { intro: "intro", layers: "layers", phase1: "phase", phase2: "phase", phase3: "phase", reality: "reality", close: "close" } as Record<string, "intro" | "layers" | "phase" | "reality" | "close">;
const document = videoDocumentSchema.parse({
  schemaVersion: 1, slug: "voz", templateId: "standard", title: "Voz", width: 1080, height: 1920, fps: 30,
  scenes: STANDARD_SCENE_KEYS.map((key) => ({ id: key, kind: kinds[key], durationFrames: 90, ...(key === "intro" ? { audioAssetId: oldId } : {}), content: { voiceover: "Texto" } })),
});

// Frames MPEG-1 Layer III a 44.1 kHz: 1152 muestras cada uno. 128 kbps = 417 bytes, 64 kbps = 208.
const frame = (bitrateBits: number, length: number) => { const bytes = new Uint8Array(length); bytes.set([0xff, 0xfb, bitrateBits, 0x00]); return bytes; };
const vbr = Buffer.concat([...Array.from({ length: 50 }, () => frame(0x90, 417)), ...Array.from({ length: 150 }, () => frame(0x50, 208))]);
assert.ok(Math.abs(audioDurationSeconds(vbr) - 200 * 1152 / 44100) < 1e-9, "mide los frames aunque el bitrate cambie");
assert.ok(audioDurationSeconds(vbr) - vbr.length * 8 / 128_000 > 1.5, "la estimación por tamaño se quedaba muy corta con VBR y cortaba la voz");
assert.equal(audioDurationSeconds(new Uint8Array(160_000)), 10, "sin frames reconocibles vuelve a la estimación CBR 128kbps");
const updated = replaceSceneAudio(document, "intro", newId, "spanish01", "eleven_multilingual_v2", 4);
assert.equal(updated.scenes[0].audioAssetId, newId);
assert.deepEqual(updated.scenes[0].content.audioAssetHistory, [oldId]);
assert.equal(updated.scenes[0].content.voiceId, "spanish01");
assert.equal(updated.scenes[0].durationFrames, 120 + TAIL_FRAMES, "la escena dura la narración más el margen del legacy");
assert.equal(updated.scenes[1].durationFrames, 90, "no toca las escenas sin audio nuevo");
const words = [{ w: "Hola", s: 0, e: 0.4 }];
const timed = replaceSceneAudio(document, "intro", newId, "spanish01", "eleven_multilingual_v2", 4, words);
assert.deepEqual(timed.scenes[0].content.wordTimings, words, "guarda los tiempos por palabra de ElevenLabs");
const untimed = replaceSceneAudio(timed, "intro", oldId, "spanish01", "eleven_multilingual_v2", 4);
assert.equal(untimed.scenes[0].content.wordTimings, undefined, "un audio sin tiempos borra los del anterior, que ya no coinciden");
console.log("Audio por escena: selección, historial y sincronización validados.");
