import assert from "node:assert/strict";
import { runVideoPipeline, type VideoPipelineDependencies } from "./video-pipeline.ts";

function fixture(templateId = "standard") {
  const events: string[] = [];
  const document = { title: "Prueba", templateId, scenes: [{ id: "intro", content: { imagePrompt: "Una ciudad al amanecer" } }, { id: "close", content: {} }] };
  let revision = 0;
  const deps: VideoPipelineDependencies = {
    create: async () => { events.push("create"); return "video-1"; },
    read: async () => { events.push(`read:${revision}`); return { type: "video", revision, document }; },
    image: async (id, scene, prompt, source, rev) => { assert.equal(rev, revision); events.push(`image:${scene}:${source}:${prompt}`); revision++; },
    animation: async (_id, scene) => { events.push(`animation:${scene}`); revision++; },
    voiceover: async (_id, rev) => { assert.equal(rev, revision); events.push("voiceover"); revision++; },
    audio: async (_id, scene, voiceId, modelId, rev) => { assert.equal(rev, revision); assert.equal(voiceId, "voice-123"); assert.equal(modelId, "eleven_multilingual_v2"); events.push(`audio:${scene}`); revision++; },
    caption: async (_id, rev) => { assert.equal(rev, revision); events.push("caption"); revision++; },
    render: async () => { events.push("render"); return { id: "render-1", status: "queued" }; },
  };
  return { events, deps };
}

const standard = fixture();
const result = await runVideoPipeline({ topic: "Ciudad futura", imageSource: "unsplash", voiceId: "voice-123", modelId: "eleven_multilingual_v2" }, standard.deps);
assert.equal(result.status, "queued");
assert.equal(result.contentItemId, "video-1");
assert.equal(result.renderJob?.id, "render-1");
assert.deepEqual(standard.events.filter(e => !e.startsWith("read:")), ["create", "image:intro:unsplash:Una ciudad al amanecer", "image:close:unsplash:Ciudad futura", "voiceover", "audio:intro", "audio:close", "caption", "render"]);
assert.equal(standard.events.at(-2), "read:6", "verifica el documento guardado antes del render");

const explainer = fixture("explainer");
await runVideoPipeline({ topic: "Una explicación", imageSource: "openai" }, explainer.deps);
assert.deepEqual(explainer.events.filter(e => !e.startsWith("read:")), ["create", "animation:intro", "animation:close", "caption", "render"]);

const failed = fixture();
failed.deps.image = async () => { throw new Error("Proveedor no disponible"); };
const partial = await runVideoPipeline({ topic: "Una ciudad", imageSource: "openai" }, failed.deps);
assert.equal(partial.status, "incomplete");
assert.equal(partial.contentItemId, "video-1");
assert.equal(partial.failedStep, "image:intro");
assert.match(partial.error ?? "", /Proveedor no disponible/);
assert.ok(!failed.events.includes("render"));

const noImages = fixture("timeline");
await runVideoPipeline({ topic: "Historia del mundo", imageSource: "none" }, noImages.deps);
assert.deepEqual(noImages.events.filter(e => !e.startsWith("read:")), ["create", "caption", "render"]);

const unsaved = fixture();
unsaved.deps.create = async () => { throw new Error("Campaña inválida"); };
await assert.rejects(runVideoPipeline({ topic: "Una ciudad", imageSource: "none" }, unsaved.deps), /Campaña inválida/);
console.log("MCP video: pipeline estándar, educativo, cronología, revisiones y fallos parciales validados.");
