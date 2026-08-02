import assert from "node:assert/strict";
import { STANDARD_SCENE_KEYS, TAIL_FRAMES, videoDocumentSchema } from "@content-gen/domain/video";
import { mp3DurationSeconds, replaceSceneAudio } from "./video-scene-audio.ts";

const oldId = "11111111-1111-4111-8111-111111111111"; const newId = "22222222-2222-4222-8222-222222222222";
const kinds = { intro: "intro", layers: "layers", phase1: "phase", phase2: "phase", phase3: "phase", reality: "reality", close: "close" } as Record<string, "intro" | "layers" | "phase" | "reality" | "close">;
const document = videoDocumentSchema.parse({
  schemaVersion: 1, slug: "voz", templateId: "standard", title: "Voz", width: 1080, height: 1920, fps: 30,
  scenes: STANDARD_SCENE_KEYS.map((key) => ({ id: key, kind: kinds[key], durationFrames: 90, ...(key === "intro" ? { audioAssetId: oldId } : {}), content: { voiceover: "Texto" } })),
});

assert.equal(mp3DurationSeconds(160_000), 10, "calcula CBR 128kbps");
const updated = replaceSceneAudio(document, "intro", newId, "spanish01", "eleven_multilingual_v2", 4);
assert.equal(updated.scenes[0].audioAssetId, newId);
assert.deepEqual(updated.scenes[0].content.audioAssetHistory, [oldId]);
assert.equal(updated.scenes[0].content.voiceId, "spanish01");
assert.equal(updated.scenes[0].durationFrames, 120 + TAIL_FRAMES, "la escena dura la narración más el margen del legacy");
assert.equal(updated.scenes[1].durationFrames, 90, "no toca las escenas sin audio nuevo");
console.log("Audio por escena: selección, historial y sincronización validados.");
