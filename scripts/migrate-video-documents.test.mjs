import assert from "node:assert/strict";
import { videoDocumentSchema } from "../packages/domain/src/video.ts";
import { upgradeVideoDocument } from "./migrate-video-documents.mjs";

const keys = ["intro", "layers", "phase1", "phase2", "phase3", "reality", "close"];
const legacyDocument = {
  schemaVersion: 1, slug: "peligros", templateId: "standard", title: "Peligros", width: 1080, height: 1920, fps: 30,
  scenes: keys.map((key) => ({ id: key, kind: "standard", durationFrames: 150, content: { title: key } })),
  legacy: { sourcePath: "no-existe.json", accents: { intro: ["#FF4500", "#FFD700"], layers: ["no-es-color"] }, imagePrompts: { intro: "Hyper-realistic cinematic photograph." } },
};

assert.equal(videoDocumentSchema.safeParse(legacyDocument).success, false, "el documento previo ya no valida");

const upgraded = await upgradeVideoDocument(legacyDocument);
assert.equal(upgraded.status, "upgraded");
assert.deepEqual(upgraded.document.scenes.map((scene) => scene.kind), ["intro", "layers", "phase", "phase", "phase", "reality", "close"], "asigna el layout de cada escena");
assert.deepEqual(upgraded.document.scenes[0].accent, ["#FF4500", "#FFD700"], "recupera los accents del importador");
assert.deepEqual(upgraded.document.scenes[1].accent, ["#00FF7F", "#32CD32"], "cae al accent por defecto si el guardado no es válido");
assert.equal(upgraded.document.scenes[0].content.imagePrompt, "Hyper-realistic cinematic photograph.", "recoloca el prompt de imagen en la escena");
assert.equal(upgraded.document.targetDurationSeconds, 35, "deduce la duración objetivo de las escenas guardadas");

assert.equal((await upgradeVideoDocument(upgraded.document)).status, "skipped", "es idempotente");

const manual = await upgradeVideoDocument({ ...legacyDocument, scenes: [{ id: "legacy", kind: "standard", durationFrames: 150, content: { title: "ZeroDayVerticalPremium" } }], legacy: { compositionId: "ZeroDayVerticalPremium" } });
assert.equal(manual.status, "upgraded");
assert.equal(manual.document.templateId, "legacy", "los registros de composiciones ya renderizadas salen de la plantilla editable");

const broken = await upgradeVideoDocument({ ...legacyDocument, scenes: [{ id: "escena-suelta", kind: "standard", durationFrames: 90, content: {} }], legacy: {} });
assert.equal(broken.status, "unsupported", "no inventa escenas para documentos que no siguen la estructura legacy");
console.log("Migración de VideoDocument: layouts, accents, prompts e idempotencia validados.");
