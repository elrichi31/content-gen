import assert from "node:assert/strict";
import { renderErrorMessage } from "./worker.mjs";

const chromeOutput = [
  "Frame 120/3900",
  "\u001b[31mError: Protocol error (Runtime.callFunctionOn): Target closed\u001b[39m",
  "\u001b[31mffmpeg (tramo 2) salió con 1: Conversion failed!\u001b[39m",
  "at CdpCDPSession.send (C:\\repo\\node_modules\\puppeteer-core\\lib\\puppeteer\\cdp\\CdpSession.js:91:18)",
  "at ExecutionContext.evaluate (C:\\repo\\node_modules\\puppeteer-core\\lib\\puppeteer\\cdp\\ExecutionContext.js:39:18)",
].join("\n");

const message = renderErrorMessage(chromeOutput);
assert.match(message, /Protocol error/, "conserva la explicación del fallo");
assert.match(message, /Conversion failed/, "y lo que dijo ffmpeg");
assert.doesNotMatch(message, /CdpSession|node_modules/, "descarta el stack interno");
assert.doesNotMatch(message, /\u001b/, "limpia los códigos de color de la consola");
assert.equal(renderErrorMessage(""), "No se pudo renderizar el video.", "tiene un mensaje por defecto");
assert.ok(renderErrorMessage("x".repeat(5000)).length <= 1000, "acota el largo que se guarda en el job");

console.log("Worker de render: mensajes de error validados.");
