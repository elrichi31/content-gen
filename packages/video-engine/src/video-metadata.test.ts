import assert from "node:assert/strict";
import { SIL_FRAMES, STANDARD_SCENE_KEYS, TAIL_FRAMES, videoDocumentSchema } from "@content-gen/domain/video";
import { applyAudioDurations, videoDurationInFrames } from "./video-metadata.ts";

const kinds = { intro: "intro", layers: "layers", phase1: "phase", phase2: "phase", phase3: "phase", reality: "reality", close: "close" } as Record<string, string>;
const document = videoDocumentSchema.parse({
  schemaVersion: 1, slug: "metadata", templateId: "standard", title: "Metadata", width: 1080, height: 1920, fps: 30,
  scenes: STANDARD_SCENE_KEYS.map((key) => ({ id: key, kind: kinds[key], durationFrames: 90, content: {} })),
});

assert.equal(videoDurationInFrames(document), 7 * (90 + SIL_FRAMES), "cada escena suma su silencio de respiro");

const normalized = applyAudioDurations(document, { intro: 4, close: 1 });
assert.equal(normalized.scenes[0].durationFrames, 120 + TAIL_FRAMES, "la narración medida reemplaza la base del guion");
assert.equal(normalized.scenes[6].durationFrames, 30 + TAIL_FRAMES, "también cuando la narración es más corta que la base");
assert.deepEqual(normalized.scenes.slice(1, 6).map((scene) => scene.durationFrames), [90, 90, 90, 90, 90], "las escenas sin audio conservan su base");
assert.equal(videoDurationInFrames(normalized), 124 + 34 + 5 * 90 + 7 * SIL_FRAMES);
console.log("Metadata de video: silencio por escena y duración por narración validados.");
