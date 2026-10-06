import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import console from "node:console";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const source = fileURLToPath(new URL("../src/", import.meta.url));
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@/components/page-shell") return { url: "fixture:page-shell", shortCircuit: true };
    if (specifier.startsWith("@/")) {
      const path = `${source}${specifier.slice(2)}`;
      for (const ext of ["", ".tsx", ".ts"]) {
        try { readFileSync(path + ext); return next(pathToFileURL(path + ext).href, context); } catch { /* Next extension. */ }
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === "fixture:page-shell") return { format: "module", shortCircuit: true, source: 'export const PageShell = ({children}) => children; export const PageHeading = ({title}) => title;' };
    if (/\.(tsx|ts)$/.test(url)) return { format: "module", shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText };
    return next(url, context);
  },
});
const { default: Page } = await import("../src/app/brands/page.tsx");
const html = renderToStaticMarkup(React.createElement(Page));
assert.ok(html.includes('role="tablist"'), "separa identidad, negocio y voz en pestañas accesibles");
assert.ok(html.includes("Identidad") && html.includes("Negocio") && html.includes("Voz"));
assert.ok(html.includes("Buscar marcas"), "permite localizar una marca sin recorrer toda la lista");
assert.ok(html.includes("Cargando marcas"), "distingue carga de una lista vacía");
console.log("Brands UI: navegación por secciones, búsqueda y carga validadas.");
