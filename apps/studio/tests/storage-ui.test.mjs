import assert from "node:assert/strict";
import console from "node:console";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const source = fileURLToPath(new URL("../src/", import.meta.url));
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "next/navigation") return { url: "fixture:navigation", shortCircuit: true };
    if (specifier === "@/components/app-sidebar") return { url: "fixture:sidebar", shortCircuit: true };
    if (specifier.startsWith("@/")) {
      for (const extension of [".tsx", ".ts"]) {
        const path = `${source}${specifier.slice(2)}${extension}`;
        try { readFileSync(path); return next(pathToFileURL(path).href, context); } catch { /* Siguiente extensión. */ }
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === "fixture:navigation") return { format: "module", shortCircuit: true, source: "export const useRouter=()=>({refresh(){}});" };
    if (url === "fixture:sidebar") return { format: "module", shortCircuit: true, source: "export const AppSidebar=()=>null;" };
    if (/\.(tsx|ts)$/.test(url)) return { format: "module", shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText };
    return next(url, context);
  },
});
const { StorageOverview } = await import("../src/components/storage-overview.tsx");
const usage = { files: 3, logicalBytes: 900, allocatedBytes: 12288, checkedAt: "2026-10-07T19:00:00Z", scanStatus: "complete", disk: { totalBytes: 102400, usedBytes: 40960, availableBytes: 61440, reservedBytes: 0, usedPercent: 40 }, categories: Object.fromEntries(["video", "image", "audio", "renders", "other"].map(type => [type, { files: type === "video" ? 3 : 0, logicalBytes: type === "video" ? 900 : 0, allocatedBytes: type === "video" ? 12288 : 0 }])) };
const render = data => renderToStaticMarkup(React.createElement(StorageOverview, { usage: data }));
const html = render(usage);
assert.ok(html.includes("Disco del almacenamiento"));
assert.ok(html.includes('role="meter"'));
assert.ok(html.includes('aria-valuenow="40"'));
assert.ok(html.includes("Disponible"));
assert.ok(html.includes("Videos guardados"));
assert.ok(html.includes("Renders"));
assert.ok(html.includes("Actualizar"));
assert.ok(html.includes("Espacio en disco"));
assert.ok(html.includes("Otros servicios"), "no atribuye todo el disco a Content Gen");
const partial = render({ ...usage, scanStatus: "partial" });
assert.ok(partial.includes("Medición parcial"));
const unavailable = render({ ...usage, scanStatus: "unavailable", disk: null });
assert.ok(unavailable.includes("No se pudo leer"));
assert.ok(!unavailable.includes('role="meter"'));
const full = render({ ...usage, disk: { ...usage.disk, availableBytes: 1024 } });
assert.ok(full.includes("Espacio crítico"));
assert.ok(readFileSync(new URL("../src/components/app-sidebar.tsx", import.meta.url), "utf8").includes('href: "/storage", label: "Almacenamiento"'));
const { StorageFiles, StorageSelectionSummary } = await import("../src/components/storage-files.tsx");
const fileRow = { key: `media/assets/${"a".repeat(64)}.mp4`, name: "video-final.mp4", kind: "video", sizeBytes: 4096, allocatedBytes: 8192, links: 1, version: "b".repeat(64), modifiedAt: "2026-10-07T19:00:00Z", deletable: true, reason: "Video final", exportCount: 2, pieceTitles: ["Video de campaña"] };
const imageRow = { ...fileRow, key: `media/assets/${"c".repeat(64)}.webp`, name: "foto.webp", kind: "image", deletable: false, reason: "Lo utiliza un proyecto o una marca", preview: { url: "/api/assets/foto", mimeType: "image/webp" } };
const filesHtml = renderToStaticMarkup(React.createElement(StorageFiles, { initial: { files: [fileRow, imageRow], total: 2, pages: 1, page: 0, partial: false, groups: [] } }));
assert.ok(filesHtml.includes('src="/api/assets/foto"'), "las imágenes muestran su miniatura");
assert.ok(filesHtml.includes("Ver foto.webp"), "la miniatura abre la vista previa");
assert.ok(filesHtml.includes("Protegido: Lo utiliza un proyecto o una marca") && !filesHtml.includes("Seleccionar foto.webp"), "un archivo protegido lleva candado en vez de casilla");
assert.ok(filesHtml.includes("1 de 2 en esta página"), "explica cuántos se pueden borrar");
assert.ok(filesHtml.includes("max-h-[65vh] overflow-auto") && filesHtml.includes("sticky top-0"), "la tabla tiene scroll interno con cabecera fija");
assert.ok(filesHtml.includes("video-final.mp4"));
assert.ok(filesHtml.includes("Tamaño"));
assert.ok(filesHtml.includes("En disco"));
assert.ok(filesHtml.includes("Seleccionar video-final.mp4"));
assert.ok(filesHtml.includes("Seleccionar esta página"));
const selectionHtml = renderToStaticMarkup(React.createElement(StorageSelectionSummary, { files: [fileRow] }));
assert.ok(selectionHtml.includes("8 KiB"));
assert.ok(selectionHtml.includes("2 exportaciones"));
assert.ok(selectionHtml.includes("volver a renderizar"));
const emptyFilesHtml = renderToStaticMarkup(React.createElement(StorageFiles, { initial: { files: [], total: 0, pages: 1, page: 0, partial: false, groups: [] } }));
assert.ok(emptyFilesHtml.includes("No hay archivos"));
export { html, unavailable, full, filesHtml, selectionHtml };
console.log("UI almacenamiento: disco, archivos, selección, estimación, navegación, actualización, parcial, error y alerta verificados (SSR).");
