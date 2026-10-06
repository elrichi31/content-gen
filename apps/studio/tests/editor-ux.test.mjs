import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import console from "node:console";
import process from "node:process";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const source = fileURLToPath(new URL("../src/", import.meta.url));
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "next/link") return next("next/link.js", context);
    if (specifier === "@/components/page-shell") return { url: "fixture:page-shell", shortCircuit: true };
    if (specifier.startsWith("@/")) {
      for (const ext of ["", ".tsx", ".ts"]) {
        const path = `${source}${specifier.slice(2)}${ext}`;
        try { readFileSync(path); return next(pathToFileURL(path).href, context); } catch { /* Next extension. */ }
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
const mode = process.argv[2] ?? "campaigns";
const { default: Page } = await import(`../src/app/${mode}/page.tsx`);
const html = renderToStaticMarkup(React.createElement(Page));
if (mode === "campaigns") {
  assert.ok(html.includes('role="tablist"'), "separa el brief de las piezas de campaña");
  assert.ok(html.includes("Buscar campañas"));
  assert.ok(html.includes("Cargando campañas"), "distingue carga de una lista vacía");
} else {
  assert.ok(html.includes("Buscar artículos"));
  assert.ok(html.includes("Cargando artículos"));
  assert.ok(html.includes("Consume créditos de IA"), "avisa del costo antes de generar");
}
console.log(`${mode}: navegación, búsqueda y estados iniciales renderizados.`);
