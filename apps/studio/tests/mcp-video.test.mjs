import assert from "node:assert/strict";
import console from "node:console";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import ts from "typescript";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// Aislar APIs/almacenamiento; servidor, SDK, schemas y pipeline son los reales.
registerHooks({
  resolve(specifier, context, next) {
    // El guion del agente se valida con el código real (guion educativo y plan Canvas), sin red ni base.
    if (specifier === "@/lib/explainer" || specifier === "@/lib/video-generation") return next(new URL(`../src/lib/${specifier.slice(6)}.ts`, import.meta.url).href, context);
    if (specifier.startsWith("@/")) return { url: `fixture:${specifier}`, shortCircuit: true };
    if (specifier === "./video-pipeline") return next("./video-pipeline.ts", context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith("fixture:")) return { format: "module", shortCircuit: true, source: `
      const unused = () => { throw new Error("API no configurada en prueba de registro"); };
      export const GET = unused, POST = unused, PATCH = unused;
      export const readAsset = unused, storeAsset = unused, assertAssetSignature = unused;
      export const assetExtensions = { "image/png": ".png" };
      export const campaignCaptions = unused, imagesToDocument = unused;
      export const drawAiCarousel = unused, prepareAiCarousel = unused;
      export const contentTitle = unused, downloadPublicFile = unused;
      export const getGenerationRequest = unused, listGenerationRequests = unused;
      export const enqueueGeneration = async ({ tool, args }) => { globalThis.enqueued = (globalThis.enqueued ?? 0) + 1; return { request: { id: "solicitud-1", status: "pendiente", tool, args }, duplicate: false }; };
    ` };
    if (url.endsWith(".ts")) return { format: "module", shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText };
    return next(url, context);
  },
});
const { createStudioMcpServer } = await import("../src/lib/mcp/server.ts");
for (const scopes of [["studio:read", "studio:write"], ["studio:read"]]) {
  const server = createStudioMcpServer({ origin: "https://studio.example", scopes });
  const client = new Client({ name: "registry-test", version: "1.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const { tools } = await client.listTools();
  const tool = tools.find(item => item.name === "generar_video_completo");
  if (scopes.includes("studio:write")) {
    assert.ok(tool);
    assert.equal(tool.annotations.readOnlyHint, false);
    assert.equal(tool.annotations.openWorldHint, true);
    assert.deepEqual(tool.inputSchema.required, ["campaignId", "topic"]);
    assert.equal(tool.inputSchema.properties.imageSource.default, "unsplash");
    assert.ok(tool.inputSchema.properties.voiceId);
    const invalid = await client.callTool({ name: tool.name, arguments: { campaignId: "campaign", topic: "x" } });
    assert.equal(invalid.isError, true);
    // Lo que gasta no corre al pedirlo: se encola (las APIs del fixture lanzarían si se llamaran).
    const queued = await client.callTool({ name: tool.name, arguments: { campaignId: "campaign", topic: "Historia de la IA" } });
    assert.equal(queued.isError, undefined);
    const body = JSON.parse(queued.content[0].text);
    assert.equal(body.solicitudId, "solicitud-1");
    assert.equal(body.estado, "pendiente");
    assert.match(tool.description, /cola/);
    assert.ok(tools.some((item) => item.name === "ver_solicitud"));

    // Guion escrito por el agente: se valida al llamar y solo se encola si pasa.
    const voice = (text) => text;
    const good = { campaignId: "campaign", title: "Cómo se cae un servidor", scenes: [
      { title: "El golpe", voiceover: voice("Un millón de peticiones por segundo."), beats: [{ template: "hook", words: [{ text: "1 millón", cue: "millón" }] }] },
      { title: "El ataque", voiceover: voice("Miles de bots envían tráfico al servidor y se cae."), beats: [{ template: "flow", sources: [{ label: "Bots", count: 40 }], target: "Servidor", rate: "flood", outcome: "overload", cues: { surge: "tráfico", outcome: "cae" } }] },
      { title: "Cierre", voiceover: voice("Protege tu servidor hoy."), beats: [{ template: "outro", line: "Protégelo hoy" }] },
    ] };
    const before = globalThis.enqueued;
    const accepted = await client.callTool({ name: "crear_video_desde_guion", arguments: good });
    assert.equal(accepted.isError, undefined, accepted.content?.[0]?.text);
    assert.equal(JSON.parse(accepted.content[0].text).estado, "pendiente");
    assert.equal(globalThis.enqueued, before + 1);
    const bad = { ...good, scenes: [good.scenes[0], { ...good.scenes[1], beats: [{ template: "map", points: [{ label: "Tokio", lat: 35.7, lon: 139.7, cue: "Tokio" }] }, { template: "stat", value: 3, label: "x", cue: "bots" }] }, { ...good.scenes[2], beats: [{ template: "stat", label: "sin valor" }] }] };
    const refused = await client.callTool({ name: "crear_video_desde_guion", arguments: bad });
    assert.equal(refused.isError, true);
    const why = refused.content[0].text;
    assert.match(why, /no se encoló ni se gastó/);
    assert.match(why, /scene-2: descartada map/, "dice qué animación no sigue la voz");
    assert.match(why, /scene-3: animación "stat" con datos inválidos/, "y cuál trae datos inválidos");
    assert.match(why, /Escena 3 \(scene-3\): se quedó sin ninguna animación válida/);
    assert.equal(globalThis.enqueued, before + 1, "lo rechazado no se encola");
  } else assert.equal(tool, undefined, "lectura no permite generar/gastar");
  await client.close();
  await server.close();
}
console.log("MCP SDK: herramienta registrada, contrato de entrada y permisos comprobados por tools/list y tools/call.");
