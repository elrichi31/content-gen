import assert from "node:assert/strict";
import { extractRemixContext, remixContext, safeRemixUrl } from "./carousel-remix.ts";

assert.throws(() => safeRemixUrl("file:///etc/passwd"), /segura/, "solo permite HTTP público");
assert.throws(() => safeRemixUrl("http://127.0.0.1/admin"), /segura/, "bloquea loopback antes de fetch");
assert.equal(extractRemixContext("<title>Guía de contenido</title><meta name=\"description\" content=\"Ideas para publicar mejor\">"), "Guía de contenido. Ideas para publicar mejor", "extrae título y descripción");
const context = await remixContext("https://example.com", async () => [{ address: "93.184.216.34" }], async () => "<title>Ejemplo</title>");
assert.equal(context, "Ejemplo", "usa una IP pública validada sin salir a red");
await assert.rejects(() => remixContext("https://example.com", async () => [{ address: "10.0.0.1" }]), /privada/, "bloquea DNS privado");
await assert.rejects(() => remixContext("https://example.com:8080", async () => [{ address: "93.184.216.34" }]), /segura/, "bloquea puertos no estándar");
console.log("Remix: esquema, SSRF y extracción de contexto verificados.");
