import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const source = fileURLToPath(new URL("../src/", import.meta.url));
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) {
      const path = `${source}${specifier.slice(2)}`;
      for (const ext of ["", ".tsx", ".ts"]) {
        try { readFileSync(path + ext); return next(pathToFileURL(path + ext).href, context); } catch { /* Try next extension. */ }
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (/\.(tsx|ts)$/.test(url)) return { format: "module", shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText };
    return next(url, context);
  },
});
const { CostsDashboard } = await import("../src/components/costs-dashboard.tsx");
const { summarizeUsage } = await import("../src/lib/cost-analytics.ts");
const { emptyUsage } = await import("@content-gen/domain/cost");
const { costCatalog } = await import("../src/lib/cost-catalog.ts");
const { loadPricing } = await import("../src/lib/pricing.ts");
const data = { month: "2026-10", currency: "USD", period: {}, pricingVersion: "fixture", totals: { amount: 0.1, runs: 1, untariffed: 0, failed: 0 }, budget: null, operations: [], providers: [{ provider: "openai", runs: 1, total: 0.1, untariffed: 0 }], expensive: [], pricing: { status: "configured", missing: [], catalog: costCatalog(loadPricing(), "2026-10-06") }, ...summarizeUsage([{ operation: "article-research", provider: "openai", status: "completed", cost_amount: 0.1, created_at: "2026-10-02T12:00:00Z", data_json: JSON.stringify({ model: "modelo-fixture", usage: { ...emptyUsage(), webSearchCalls: 2 } }) }], "2026-10") };
const html = renderToStaticMarkup(React.createElement(CostsDashboard, { initialData: data }));
assert.ok(html.includes("Evolución del gasto"), "el informe renderiza la serie diaria");
assert.ok(html.includes("modelo-fixture"), "muestra el modelo más utilizado");
assert.ok(html.includes("Modelos") && html.includes("Herramientas"), "ofrece ambos rankings");
assert.ok(html.includes("Búsqueda web"), "no oculta el consumo de herramientas");
assert.ok(html.includes("Sin tarifa verificada"), "no considera gratis un precio desconocido");
assert.ok(html.includes("Solo salida"), "las imágenes no se presentan como costo completo");
assert.ok(html.includes("2026-10-06"), "muestra cuándo se consultó la fuente");
assert.ok(!html.includes("NaN"));
const empty = renderToStaticMarkup(React.createElement(CostsDashboard, { initialData: { ...data, totals: { amount: 0, runs: 0, untariffed: 0, failed: 0 }, providers: [], ...summarizeUsage([], "2026-10") } }));
assert.ok(empty.includes("Sin actividad"));
console.log("Costs UI: gráficos, rankings, alcance de tarifas y estado vacío renderizados.");
