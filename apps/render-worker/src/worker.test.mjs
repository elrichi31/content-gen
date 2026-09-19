import assert from "node:assert/strict";
import { renderErrorMessage } from "./worker.mjs";

const remotionOutput = [
  "Rendered 12/98",
  "\u001b[31mAn error occurred while rendering frame 12:\u001b[39m",
  "\u001b[31mError\u001b[39m \u001b[31mdelayRender() timed out after 30000ms\u001b[39m",
  "at Object.emit (C:\\repo\\node_modules\\@remotion\\renderer\\dist\\browser\\mitt\\index.js:39:18)",
  "at CDPSession.emit (C:\\repo\\node_modules\\@remotion\\renderer\\dist\\browser\\EventEmitter.js:27:22)",
].join("\n");

const message = renderErrorMessage(remotionOutput);
assert.match(message, /An error occurred while rendering frame 12/, "conserva la explicación del fallo");
assert.match(message, /delayRender\(\) timed out/, "y el mensaje concreto de Remotion");
assert.doesNotMatch(message, /CDPSession|node_modules/, "descarta el stack interno de Remotion");
assert.doesNotMatch(message, /\u001b/, "limpia los códigos de color de la consola");
assert.equal(renderErrorMessage(""), "Remotion no pudo renderizar.", "tiene un mensaje por defecto");
assert.ok(renderErrorMessage("x".repeat(5000)).length <= 1000, "acota el largo que se guarda en el job");

console.log("Worker de render: mensajes de error de Remotion validados.");
