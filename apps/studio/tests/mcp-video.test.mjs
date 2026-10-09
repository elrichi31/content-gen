import assert from "node:assert/strict";
import console from "node:console";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// Aislar APIs/almacenamiento; servidor, SDK, schemas y pipeline son los reales.
registerHooks({
  resolve(specifier, context, next) {
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
      export const enqueueGeneration = async ({ tool, args }) => ({ request: { id: "solicitud-1", status: "pendiente", tool, args }, duplicate: false });
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
  } else assert.equal(tool, undefined, "lectura no permite generar/gastar");
  await client.close();
  await server.close();
}
console.log("MCP SDK: herramienta registrada, contrato de entrada y permisos comprobados por tools/list y tools/call.");
