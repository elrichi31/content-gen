import assert from "node:assert/strict";
import { generateOpenAiJson, openAiModel, openAiRequest } from "./openai.ts";

process.env.CONTENT_GEN_AI_PROVIDER = "openai"; process.env.OPENAI_API_KEY = "test"; process.env.OPENAI_SCRIPT_MODEL = "script-test";
assert.equal(openAiModel("script"), "script-test", "resuelve el modelo específico de guion");
const result = await generateOpenAiJson({ system: "JSON", prompt: "{}", purpose: "script", request: async (_url, init) => { assert.match(String(init?.body), /script-test/, "envía el modelo resuelto"); return new Response(JSON.stringify({ output_text: "{\"ok\":true}", usage: { output_tokens: 2 } })); } });
assert.deepEqual(result, { value: { ok: true }, model: "script-test", usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 2, webSearchCalls: 0, images: 0, characters: 0 }, sources: [] }, "devuelve valor, modelo, consumo normalizado y fuentes web (vacías sin búsqueda)");
await openAiRequest("text", async (_url, init) => { assert.match(String(init?.body), new RegExp(openAiModel("text")), "normaliza el modelo de generaciones existentes"); assert.doesNotMatch(String(init?.body), /ignorado/, "no permite que cada caller cambie el modelo"); return new Response("{}"); }, "https://api.openai.com/v1/responses", { method: "POST", body: JSON.stringify({ model: "ignorado" }) });
console.log("Cliente OpenAI: modelo, respuesta JSON y contrato unificados.");
