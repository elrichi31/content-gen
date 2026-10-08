import { INTER_DISPLAY } from "./fonts.js";
import { canvasRuntime } from "./runtime.js";

/**
 * Página HTML autocontenida que pinta `spec` con la runtime de Canvas: fuentes en base64 y la
 * runtime inyectada como código, sin nada que cargar de la red ni del disco.
 *
 * - Render (`live: false`): expone `window.canvasEngine.renderFrame(frame)` → data URL del frame.
 * - Preview (`live: true`): el padre manda `{ type: "canvas-engine:time", t }` por postMessage y la
 *   página pinta ese instante; avisa con `{ type: "canvas-engine:ready" }` cuando cargan las fuentes.
 */
export function buildCanvasHtml(spec, { fps = 60, subframes = 6, live = false, scale = 1 } = {}) {
  const faces = Object.entries(INTER_DISPLAY)
    .map(([weight, data]) => `@font-face{font-family:"Inter Display";font-style:normal;font-weight:${weight};src:url(data:font/woff2;base64,${data}) format("woff2")}`)
    .join("\n");
  const options = { fps, subframes: live ? 1 : subframes, scale };
  // `<` escapado: un título con «</script>» no puede cerrar el bloque de código.
  const json = (value) => JSON.stringify(value).replace(/</g, "\\u003c");
  const boot = live
    ? `engine.ready.then(function () {
    engine.draw(0);
    addEventListener("message", function (event) { if (event.data && event.data.type === "canvas-engine:time") engine.draw(Number(event.data.t) || 0); });
    parent.postMessage({ type: "canvas-engine:ready", duration: engine.duration }, "*");
  });`
    : "";
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${escapeHtml(spec.title)}</title>
<style>
${faces}
html,body{margin:0;background:#07080d;overflow:hidden}
canvas{display:block;${live ? "width:100vw;height:100vh;object-fit:contain" : "display:none"}}
</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
var engine = window.canvasEngine = (${canvasRuntime.toString()})(${json(spec)}, Object.assign(${json(options)}, { canvas: document.getElementById("c") }));
${boot}
</script>
</body>
</html>
`;
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
