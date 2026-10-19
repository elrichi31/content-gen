import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, URL } from "node:url";
import console from "node:console";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "next/link") return next("next/link.js", context);
    if (specifier.startsWith("@/")) {
      const base = new URL(`../src/${specifier.slice(2)}`, import.meta.url);
      const file = [".tsx", ".ts"].map(ext => base.href + ext).find(url => existsSync(fileURLToPath(url)));
      return next(file ?? base.href, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (/\.(tsx|ts)$/.test(url) && !url.includes("/node_modules/")) return {
      format: "module", shortCircuit: true,
      source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText,
    };
    return next(url, context);
  },
});

const { ExplainerAnimationStep } = await import("../src/components/explainer/animation-step.tsx");
const { requestSceneImage } = await import("../src/components/video/scene-image-picker.tsx");
const { replaceSceneImage } = await import("../src/lib/video-scene-images.ts");
const { videoDocumentSchema } = await import("@content-gen/domain/video");
const imageA = "11111111-1111-4111-8111-111111111111";
const imageB = "22222222-2222-4222-8222-222222222222";
const document = videoDocumentSchema.parse({schemaVersion:1,slug:"google",templateId:"explainer",title:"Google IA",width:1080,height:1920,fps:30,scenes:[1,2].map(i=>({id:`escena-${i}`,kind:"explainer",durationFrames:90,imageAssetId:imageA,audioAssetId:imageB,content:{title:`Escena ${i}`,voiceover:"Una explicación narrada.",canvas:{template:"hook",words:[{text:"Google"}]}}}))});
const markup = renderToStaticMarkup(React.createElement(ExplainerAnimationStep, {contentItemId:"video",revision:7,document,campaignId:"campaign",onPersisted(){}}));
assert.ok(markup.includes('aria-label="Origen de la imagen"'), "el educativo ofrece el selector de imágenes desde la primera escena, sin buscarlo al final");
assert.ok(markup.includes('aria-label="Cambiar imagen de la escena 2"'), "cada escena ofrece un cambio de imagen independiente");
assert.ok(markup.includes("Unsplash") && markup.includes("OpenAI"), "los proveedores están identificados en el editor compartido");
assert.ok(markup.includes('aria-label="Descripción de la imagen"'));
assert.ok(markup.includes('aria-label="Color de las animaciones"') && markup.includes('aria-label="Otro color"'), "el paso de animaciones deja elegir el color");
assert.ok(markup.includes('aria-label="Cian" aria-pressed="true"'), "sin acento guardado se marca el cian por defecto");

const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/videos/video/scenes/escena-1/image");
    assert.deepEqual(JSON.parse(options.body), {source:"openai",prompt:"Google IA",revision:7});
    return globalThis.Response.json({content:{revision:8,document:{data:replaceSceneImage(document,"escena-1",imageB)}}});
  };
  const result = await requestSceneImage("video","escena-1",{source:"openai",prompt:"Google IA"},7);
  const next = result.document.data;
  assert.equal(next.scenes[0].imageAssetId,imageB);
  assert.equal(next.scenes[0].audioAssetId,document.scenes[0].audioAssetId);
  assert.equal(next.scenes[0].durationFrames,document.scenes[0].durationFrames);
  assert.deepEqual(next.scenes[0].content.canvas,document.scenes[0].content.canvas);
  assert.deepEqual(next.scenes[1],document.scenes[1]);
  assert.deepEqual(next.scenes[0].content.imageAssetHistory,[imageA]);
} finally { globalThis.fetch = originalFetch; }
console.log("Educativo Canvas: selector visible por escena, proveedores compartidos y voz/animación preservadas.");
