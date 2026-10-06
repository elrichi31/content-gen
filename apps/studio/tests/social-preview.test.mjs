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
    if (specifier.startsWith(".") && context.parentURL?.includes("/src/")) {
      const base = new URL(specifier, context.parentURL);
      const file = [".tsx", ".ts"].map(ext => base.href + ext).find(url => existsSync(fileURLToPath(url)));
      if (file) return next(file, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (/\.(tsx|ts)$/.test(url) && !url.includes("/node_modules/")) return {
      format: "module", shortCircuit: true,
      source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText,
    };
    return next(url, context);
  },
});
const { CarouselFrame, carouselFixture } = await import("../src/components/carousel-preview.tsx");
const props = { document: carouselFixture, activeSlide: 0, onSlideChange() {}, theme: "green", font: "poster", background: "solid", brand: { name: "Betha Labs", logoUrl: null, colors: ["#62de91"] } };
const render = extra => renderToStaticMarkup(React.createElement(CarouselFrame, { ...props, ...extra }));
const instagram = render({ platform: "instagram" });
assert.match(instagram, /aria-label="Vista simulada de Instagram"/, "el preview debe mostrar el contexto de la app, no solo una tarjeta");
assert.match(instagram, /Instagram/);
assert.match(instagram, /Inicio/);
assert.match(instagram, /Betha Labs/);
assert.match(instagram, /No necesitas publicar más/);
assert.match(instagram, /aria-label="Imagen siguiente"/);
assert.match(instagram, /aria-current="true"/);
assert.doesNotMatch(instagram, /#(?:#|contenido|diseño)#/);
assert.match(instagram, /#contenido #diseño/);
assert.match(instagram, /interacciones de ejemplo/i, "los números no son métricas de la cuenta");
console.log("Instagram: contexto móvil, marca, contenido y navegación renderizados.");

const tiktok = render({ platform: "tiktok" });
assert.ok(tiktok.includes('aria-label="Vista simulada de TikTok"'), "TikTok debe mostrar el contexto de la app");
assert.match(tiktok, /data-preview-media="tiktok"[^>]*style="[^"]*aspect-ratio:9 \/ 16/, "TikTok debe usar las mismas proporciones 9:16 de exportación");
assert.match(tiktok, /Para ti/);
assert.match(tiktok, /Siguiendo/);
assert.match(tiktok, /Sonido original/);
assert.match(tiktok, /Amigos/);
assert.match(tiktok, /Bandeja/);
assert.match(tiktok, /#contenido #diseño/);
assert.doesNotMatch(tiktok, /##contenido|##diseño/);
assert.match(tiktok, /Editar descripción|Copiar descripción/);
console.log("TikTok: foto 9:16, superposiciones nativas, hashtags y navegación renderizados.");

const { AdPlatformFrame } = await import("../src/components/ads/ad-platform-frame.tsx");
const { adFixture } = await import("../src/components/ads/ad-renderer.tsx");
const adHtml = platform => renderToStaticMarkup(React.createElement(AdPlatformFrame, { ad: adFixture, platform, profileName: "Betha Labs" }));
assert.ok(adHtml("instagram").includes('aria-label="Vista simulada de Instagram"'), "los anuncios deben reutilizar el marco Instagram");
assert.ok(adHtml("tiktok").includes('aria-label="Vista simulada de TikTok"'), "los anuncios deben reutilizar el marco TikTok");
for (const platform of ["instagram", "tiktok"]) {
  assert.match(adHtml(platform), /Publicidad/);
  assert.match(adHtml(platform), /Betha Labs/);
  assert.match(adHtml(platform), /Empieza ahora/);
}
const story = renderToStaticMarkup(React.createElement(AdPlatformFrame, { ad: { ...adFixture, format: "story" }, platform: "instagram" }));
assert.ok(story.includes('aria-label="Vista simulada de Instagram Stories"'), "el formato Story no debe hacerse pasar por un post del feed");
assert.match(story, /Enviar mensaje/);
console.log("Anuncios: marca, publicidad, CTA, feed y Stories renderizados.");

for (const platform of ["instagram", "tiktok"]) {
  const empty = render({ platform, document: { ...carouselFixture, slides: [] } });
  assert.match(empty, /Añade tu primera imagen/);
  assert.ok(!empty.includes("Imagen 1 de 0"), "el estado vacío no anuncia una imagen inexistente");
  const single = render({ platform, document: { ...carouselFixture, slides: [carouselFixture.slides[0]] } });
  assert.ok(!single.includes('aria-label="Imagen siguiente"'));
  assert.ok(!single.includes('aria-label="Imágenes del carrusel"'));
  const last = render({ platform, activeSlide: 999 });
  assert.ok(last.includes("Imagen 10 de 10"));
}
const { CarouselExportSheet } = await import("../src/components/carousel-preview.tsx");
const exported = renderToStaticMarkup(React.createElement(CarouselExportSheet, { ...props, platform: "tiktok" }));
assert.equal([...exported.matchAll(/data-export-slide/g)].length, carouselFixture.slides.length);
assert.match(exported, /aspect-ratio:9 \/ 16/);
assert.ok(!exported.includes("data-social-preview"), "el chrome de la plataforma nunca entra en los PNG exportados");
const { CaptionEditor, formatCaptionHashtags } = await import("../src/components/preview/caption-editor.tsx");
assert.equal(formatCaptionHashtags(["#uno", "dos", "##tres", ""]), "#uno #dos #tres");
const readonly = renderToStaticMarkup(React.createElement(CaptionEditor, { caption: carouselFixture.caption, initialEditing: true }));
assert.ok(!readonly.includes("<textarea"));
assert.ok(!readonly.includes('title="Editar caption"'));
console.log("Previews: vacío, imagen única, índice fuera de rango, hashtags, solo lectura y exportación sin chrome validados.");
