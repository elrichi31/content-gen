import assert from "node:assert/strict";
import {
  DEFAULT_TARGET_DURATION, getSceneDurations, getTimelineSceneDurations, sceneAccent,
  SCENE_KIND_BY_KEY, STANDARD_SCENE_KEYS, TIMELINE_SCENE_KEYS, videoDocumentSchema,
} from "./video.ts";

const base = { schemaVersion: 1 as const, slug: "Deepfákes 2026", title: " Deepfakes ", width: 1080 as const, height: 1920 as const, fps: 30 as const };
const kinds = SCENE_KIND_BY_KEY as Record<string, string>;
const scenesFor = (keys: readonly string[]) => keys.map((key) => ({ id: key, kind: kinds[key], durationFrames: 90, content: { tag: "ALERTA", title: "Deepfakes" } }));
const withFirst = (patch: Record<string, unknown>) => scenesFor(STANDARD_SCENE_KEYS).map((scene, index) => index ? scene : { ...scene, ...patch });

const standard = videoDocumentSchema.parse({ ...base, templateId: "standard", scenes: scenesFor(STANDARD_SCENE_KEYS) });
const timeline = videoDocumentSchema.parse({ ...base, templateId: "timeline", niche: "history", hookStyle: "shock", targetDurationSeconds: 60, scenes: scenesFor(TIMELINE_SCENE_KEYS) });

assert.deepEqual(standard.scenes.map((scene) => scene.id), [...STANDARD_SCENE_KEYS], "la plantilla estándar conserva las siete escenas legacy");
assert.deepEqual(timeline.scenes.map((scene) => scene.kind), ["intro", "event", "event", "event", "event", "today", "close"]);
assert.deepEqual([standard.niche, standard.hookStyle, standard.targetDurationSeconds], ["general", "curiosity", DEFAULT_TARGET_DURATION], "aplica los valores por defecto del legacy");
assert.deepEqual([timeline.niche, timeline.hookStyle, timeline.targetDurationSeconds], ["history", "shock", 60]);
assert.deepEqual([standard.slug, standard.templateId, standard.title], ["deepfakes-2026", "standard", "Deepfakes"], "normaliza slugs de forma determinista");
assert.deepEqual(sceneAccent(standard.scenes[0]), ["#FF4500", "#FFD700"], "usa el accent por defecto de la escena cuando el documento no lo trae");
assert.deepEqual(sceneAccent(videoDocumentSchema.parse({ ...base, templateId: "standard", scenes: withFirst({ accent: ["#00FF7F", "#32CD32"] }) }).scenes[0]), ["#00FF7F", "#32CD32"]);

assert.equal(Object.values(getSceneDurations(DEFAULT_TARGET_DURATION)).reduce((total, value) => total + value, 0), DEFAULT_TARGET_DURATION, "las duraciones estándar suman la duración objetivo");
assert.equal(Object.values(getTimelineSceneDurations(90)).reduce((total, value) => total + value, 0), 90, "las duraciones timeline suman la duración objetivo");

for (const invalid of [
  { ...base, templateId: "standard", fps: 29, scenes: scenesFor(STANDARD_SCENE_KEYS) },
  { ...base, templateId: "standard", width: 1920, scenes: scenesFor(STANDARD_SCENE_KEYS) },
  { ...base, templateId: "standard", height: 1080, scenes: scenesFor(STANDARD_SCENE_KEYS) },
  { ...base, templateId: "standard", scenes: scenesFor(STANDARD_SCENE_KEYS).slice(0, 4) },
  { ...base, templateId: "standard", scenes: scenesFor(TIMELINE_SCENE_KEYS) },
  { ...base, templateId: "standard", scenes: withFirst({ kind: "close" }) },
  { ...base, templateId: "standard", scenes: withFirst({ accent: ["rojo", "#FFD700"] }) },
  { ...base, templateId: "standard", scenes: withFirst({ imageAssetId: "no-es-uuid" }) },
  { ...base, templateId: "standard", scenes: withFirst({ durationFrames: 1.5 }) },
  { ...base, templateId: "standard", niche: "gaming", scenes: scenesFor(STANDARD_SCENE_KEYS) },
  { ...base, templateId: "standard", hookStyle: "gracioso", scenes: scenesFor(STANDARD_SCENE_KEYS) },
]) assert.equal(videoDocumentSchema.safeParse(invalid).success, false, "rechaza escenas, layouts, accents o metadatos inválidos");

for (const slug of ["../secreto", "C:\\Windows", "CON"]) assert.equal(videoDocumentSchema.safeParse({ ...base, slug, templateId: "standard", scenes: scenesFor(STANDARD_SCENE_KEYS) }).success, false, `rechaza slug inseguro: ${slug}`);
console.log("VideoDocument: estructura legacy de siete escenas, accents y duraciones validadas.");
