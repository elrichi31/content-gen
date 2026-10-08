import { INTER_DISPLAY } from "./fonts.js";
import { WORLD } from "./world.js";
import { canvasRuntime } from "./runtime.js";

/**
 * Página HTML autocontenida que pinta `spec` con la runtime de Canvas: fuentes en base64 y la
 * runtime inyectada como código, sin nada que cargar de la red ni del disco.
 *
 * - Render (`live: false`): expone `window.canvasEngine.renderFrame(frame)` → data URL del frame.
 * - Preview (`live: true`): el padre manda `{ type: "canvas-engine:time", t }` por postMessage y la
 *   página pinta ese instante; avisa con `{ type: "canvas-engine:ready" }` cuando cargan las fuentes.
 *   Las fotos de las escenas llegan igual: `{ type: "canvas-engine:image", id, image }` (un ImageBitmap),
 *   porque el iframe aislado no puede pedir los assets con la sesión del usuario.
 * - `images`: { assetId: data URL } embebidas en la página (render). Se decodifican antes de `ready`.
 * - `autoplay` (con `live`): la página se reproduce sola en bucle, sin reloj del padre (biblioteca).
 */
export function buildCanvasHtml(spec, { fps = 60, subframes = 6, live = false, scale = 1, images = {}, autoplay = false } = {}) {
  const faces = Object.entries(INTER_DISPLAY)
    .map(([weight, data]) => `@font-face{font-family:"Inter Display";font-style:normal;font-weight:${weight};src:url(data:font/woff2;base64,${data}) format("woff2")}`)
    .join("\n");
  const options = { fps, subframes: live ? 1 : subframes, scale, world: WORLD };
  // `<` escapado: un título con «</script>» no puede cerrar el bloque de código.
  const json = (value) => JSON.stringify(value).replace(/</g, "\\u003c");
  const boot = live
    ? `var last = 0;
  engine.ready.then(function () {
    engine.draw(0);
    addEventListener("message", function (event) {
      var data = event.data || {};
      if (data.type === "canvas-engine:time") { last = Number(data.t) || 0; engine.draw(last); }
      if (data.type === "canvas-engine:image" && data.image) { engine.setImage(String(data.id), data.image); engine.draw(last); }
    });
    parent.postMessage({ type: "canvas-engine:ready", duration: engine.duration }, "*");${autoplay ? `
    // Bucle: la animación completa y una pausa breve con el estado final antes de volver a empezar.
    var start = performance.now();
    (function loop(now) { engine.draw(((now - start) / 1000) % (engine.duration + 1)); requestAnimationFrame(loop); })(start);` : ""}
  });`
    : `// Fotos embebidas: se decodifican antes de dar la página por lista, o el primer frame saldría sin ellas.
  var fontsReady = engine.ready;
  engine.ready = Promise.all([fontsReady].concat(Object.keys(IMAGES).map(function (id) {
    var image = new Image();
    image.src = IMAGES[id];
    return image.decode().then(function () { engine.setImage(id, image); });
  }))).then(function () { return true; });`;
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
var IMAGES = ${live ? "{}" : json(images)};
var engine = window.canvasEngine = (${canvasRuntime.toString()})(${json(spec)}, Object.assign(${json(options)}, { canvas: document.getElementById("c") }));
${boot}
</script>
</body>
</html>
`;
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
