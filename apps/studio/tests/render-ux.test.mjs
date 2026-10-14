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

const { VideoRenderPanel } = await import("../src/components/video-render-panel.tsx");
const { VideoCaptionPanel } = await import("../src/components/video-caption-panel.tsx");
const { StepIndicator } = await import("../src/components/video/step-indicator.tsx");
const document = { title: "Video de prueba", caption: { text: "Una explicación breve para TikTok.", hashtags: ["#prueba", "#video"] }, scenes: [] };
const caption = React.createElement(VideoCaptionPanel, { contentItemId: "video", revision: 3, document, onPersisted() {}, className: "border-0 bg-transparent p-0" });
const html = renderToStaticMarkup(React.createElement(VideoRenderPanel, { contentItemId: "video", unsavedChanges: false }, caption));
assert.ok(html.includes('id="video-caption-text"'), "el caption comparte el panel del render, no una columna estrecha separada");
assert.match(html, /Una explicación breve para TikTok/);
assert.match(html, /#prueba #video/);
assert.match(html, /Guardar caption/);
assert.match(html, /Descargar .txt/);
assert.match(html, /Renderizar/);
const standalone = renderToStaticMarkup(React.createElement(VideoRenderPanel, { contentItemId: "", unsavedChanges: false }));
assert.match(standalone, /Guarda el video/);
assert.match(standalone, /disabled=""/, "no encola un render sin contenido guardado");
const dirty = renderToStaticMarkup(React.createElement(VideoRenderPanel, { contentItemId: "video", unsavedChanges: true }));
assert.match(dirty, /Hay cambios sin guardar/);
const steps = renderToStaticMarkup(React.createElement(StepIndicator, { current: 5, reached: 5, onSelect() {}, steps: ["Tema", "Guion", "Voz", "Animaciones", "Render"] }));
assert.match(steps, /aria-label="5\. Render"/, "los pasos mantienen su nombre accesible aunque en móvil solo se muestre el número");
assert.match(steps, /aria-current="step"/);
console.log("Render: caption integrado, acciones conservadas y guardas de contenido comprobadas.");
