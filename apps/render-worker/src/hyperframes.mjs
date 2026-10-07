import { createRenderJob, executeRenderJob } from "@hyperframes/producer";
import { ensureBrowser } from "@remotion/renderer";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { mp3DurationSeconds } from "../../../packages/domain/src/audio.ts";
import { sceneLeadFrames, sceneTimelineFrames, TAIL_FRAMES } from "../../../packages/domain/src/video.ts";

/**
 * Motor alternativo a Remotion: el mismo documento de video (guion, imágenes y voz por escena)
 * se convierte en una composición HTML de HyperFrames y se renderiza con @hyperframes/producer.
 * No reutiliza los layouts de Remotion: es un diseño propio, más simple, en HTML + CSS.
 */

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const text = (content, ...keys) => keys.map((key) => content[key]).find((value) => typeof value === "string" && value.trim()) ?? "";
const lines = (content, ...keys) => keys.flatMap((key) => (Array.isArray(content[key]) ? content[key] : [])).filter((item) => typeof item === "string" && item.trim());
const html = (value) => escapeHtml(value).replace(/\n/g, "<br>");
const seconds = (value) => Number(value.toFixed(3));

// Área de `.content` (1080x1920 menos su padding) y ancho medio de un carácter por em: Inter
// en mayúsculas negras es más ancha que el texto corrido.
const CONTENT_WIDTH = 1080 - 90 * 2;
const CONTENT_HEIGHT = 1920 - 220 - 260;
const CONTENT_GAP = 36;
const BLOCK_METRICS = {
  tag: { size: 30, lineHeight: 1.2, em: 0.75, extra: 24 },
  badge: { size: 120, lineHeight: 1, em: 0.62, extra: 0 },
  title: { size: 104, lineHeight: 0.98, em: 0.68, extra: 0 },
  big: { size: 132, lineHeight: 0.98, em: 0.68, extra: 0 },
  mono: { size: 34, lineHeight: 1.5, em: 0.6, extra: 68 },
  body: { size: 46, lineHeight: 1.3, em: 0.52, extra: 0 },
  item: { size: 40, lineHeight: 1.2, em: 0.55, extra: 44 + 18 },
};

const estimatedLines = (value, size, em, width) => String(value).split("\n").reduce((total, line) => total + Math.max(1, Math.ceil(line.length * size * em / width)), 0);

/**
 * Escala (0.45–1) que hace caber todos los bloques de la escena en `.content`. Sin esto un
 * guion largo desbordaba por arriba (el contenido se alinea abajo) y salía cortado.
 */
export function sceneFitScale(parts) {
  const height = (scale) => parts.reduce((total, { kind, value }) => {
    const metric = BLOCK_METRICS[kind];
    const size = metric.size * scale;
    const width = kind === "item" ? CONTENT_WIDTH - 36 - 56 : kind === "mono" ? CONTENT_WIDTH - 68 : CONTENT_WIDTH;
    return total + metric.extra + estimatedLines(value, size, metric.em, width) * size * metric.lineHeight;
  }, CONTENT_GAP * Math.max(0, new Set(parts.map((part) => part.block)).size - 1));
  let scale = 1;
  while (scale > 0.45 && height(scale) > CONTENT_HEIGHT) scale = Math.round((scale - 0.05) * 100) / 100;
  return scale;
}

/** Bloques de una escena en orden de aparición; cada layout del documento usa solo algunos campos. */
function sceneParts(scene, documentTitle) {
  const c = scene.content ?? {};
  const title = text(c, "title", "headline") || (scene.kind === "intro" ? documentTitle : "");
  const big = scene.kind === "intro" || scene.kind === "close";
  return [
    text(c, "tag", "event", "phase") && [{ block: 0, kind: "tag", value: text(c, "tag", "event", "phase") }],
    text(c, "year", "timestamp") && [{ block: 1, kind: "badge", value: text(c, "year", "timestamp") }],
    title && [{ block: 2, kind: big ? "big" : "title", value: title }],
    lines(c, "terminal").length && [{ block: 3, kind: "mono", value: lines(c, "terminal").join("\n") }],
    text(c, "subtitle", "narrative", "definition", "impact") && [{ block: 4, kind: "body", value: text(c, "subtitle", "narrative", "definition", "impact") }],
    ...lines(c, "indicator", "actions").map((item) => [{ block: 5, kind: "item", value: item }]),
  ].filter(Boolean).flat();
}

function sceneBlocks(scene, documentTitle) {
  const c = scene.content ?? {};
  const title = text(c, "title", "headline") || (scene.kind === "intro" ? documentTitle : "");
  const mono = lines(c, "terminal");
  const list = lines(c, "indicator", "actions");
  return [
    text(c, "tag", "event", "phase") && `<p class="tag">${html(text(c, "tag", "event", "phase"))}</p>`,
    text(c, "year", "timestamp") && `<p class="badge">${html(text(c, "year", "timestamp"))}</p>`,
    title && `<h1 class="title${scene.kind === "intro" || scene.kind === "close" ? " big" : ""}">${html(title)}</h1>`,
    mono.length && `<pre class="mono">${mono.map(escapeHtml).join("\n")}</pre>`,
    text(c, "subtitle", "narrative", "definition", "impact") && `<p class="body">${html(text(c, "subtitle", "narrative", "definition", "impact"))}</p>`,
    list.length && `<ul class="list">${list.map((item) => `<li>${html(item)}</li>`).join("")}</ul>`,
  ].filter(Boolean);
}

/**
 * Arma el index.html de la composición. `mediaSrc(assetId)` devuelve la ruta relativa del archivo
 * ya copiado al proyecto. Devuelve también la duración total en segundos.
 */
export function buildHyperframesHtml(document, mediaSrc) {
  let start = 0;
  const clips = document.scenes.map((scene, index) => {
    // Misma cuenta que Remotion: respiro por escena, entrada antes de la primera voz y cierre al final.
    const duration = sceneTimelineFrames(document.scenes, index) / document.fps;
    const lead = sceneLeadFrames(index) / document.fps;
    const at = start;
    start += duration;
    const [accent, accent2] = scene.accent ?? ["#22d3ee", "#a855f7"];
    const image = scene.imageAssetId ? `<img class="bg" src="${escapeHtml(mediaSrc(scene.imageAssetId))}" alt="">` : "";
    // HyperFrames busca las animaciones CSS en el tiempo local de cada clip (comprobado en render):
    // los retrasos cuentan desde el inicio de la escena, no del video.
    const fit = sceneFitScale(sceneParts(scene, document.title));
    const blocks = sceneBlocks(scene, document.title).map((block, order) => `<div class="reveal" style="animation-delay:${seconds(0.15 + order * 0.35)}s">${block}</div>`).join("\n        ");
    const audio = scene.audioAssetId ? `\n    <audio id="voice-${index}" src="${escapeHtml(mediaSrc(scene.audioAssetId))}" data-start="${seconds(at + lead)}" data-duration="${seconds(duration - lead)}" data-track-index="2"></audio>` : "";
    // Video educativo: la escena ya trae su animación (HTML + CSS aislado por el studio) y se pinta tal cual.
    if (typeof scene.content?.animationHtml === "string") {
      return `    <section id="scene-${index}" class="clip scene" data-start="${seconds(at)}" data-duration="${seconds(duration)}" data-track-index="1">
${scene.content.animationHtml}
    </section>${audio}`;
    }
    return `    <section id="scene-${index}" class="clip scene" data-start="${seconds(at)}" data-duration="${seconds(duration)}" data-track-index="1" style="--accent:${escapeHtml(accent)};--accent2:${escapeHtml(accent2 ?? accent)}">
      ${image ? `<div class="bgwrap" style="animation-duration:${seconds(duration)}s">${image}</div>` : `<div class="bgwrap empty"></div>`}
      <div class="shade"></div>
      <div class="content"${fit < 1 ? ` style="--fit:${fit}"` : ""}>
        ${blocks}
      </div>
    </section>${audio}`;
  });
  const total = seconds(start);
  return {
    duration: total,
    html: `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=${document.width}, height=${document.height}">
<title>${escapeHtml(document.title)}</title>
<style>
  body { margin: 0; background: #05060a; }
  #root { position: relative; width: ${document.width}px; height: ${document.height}px; overflow: hidden; background: #05060a; font-family: "Inter", "Segoe UI", Arial, sans-serif; color: #fff; }
  .scene { position: absolute; inset: 0; overflow: hidden; }
  .bgwrap { position: absolute; inset: 0; animation-name: kenburns; animation-timing-function: linear; animation-fill-mode: both; }
  .bgwrap.empty { background: radial-gradient(circle at 30% 20%, color-mix(in srgb, var(--accent) 35%, transparent), transparent 60%), radial-gradient(circle at 80% 90%, color-mix(in srgb, var(--accent2) 30%, transparent), transparent 55%), #05060a; }
  .bg { width: 100%; height: 100%; object-fit: cover; }
  .shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(5,6,10,.35) 0%, rgba(5,6,10,.55) 45%, rgba(5,6,10,.92) 100%); }
  .content { position: absolute; inset: 0; padding: 220px 90px 260px; display: flex; flex-direction: column; justify-content: flex-end; gap: 36px; overflow-wrap: anywhere; }
  .reveal { animation: reveal .7s cubic-bezier(.2,.8,.2,1) both; }
  .tag { margin: 0; display: inline-block; padding: 12px 22px; border-radius: 999px; background: var(--accent); color: #05060a; font-weight: 800; font-size: calc(30px * var(--fit, 1)); letter-spacing: .12em; text-transform: uppercase; }
  .badge { margin: 0; font-size: calc(120px * var(--fit, 1)); font-weight: 900; line-height: 1; color: var(--accent); }
  .title { margin: 0; font-size: calc(104px * var(--fit, 1)); line-height: .98; font-weight: 900; text-transform: uppercase; letter-spacing: -.01em; text-shadow: 0 6px 40px rgba(0,0,0,.6); }
  .title.big { font-size: calc(132px * var(--fit, 1)); background: linear-gradient(90deg, #fff 30%, var(--accent2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .body { margin: 0; font-size: calc(46px * var(--fit, 1)); line-height: 1.3; color: rgba(255,255,255,.9); font-weight: 500; }
  .mono { margin: 0; padding: 32px; border-radius: 20px; background: rgba(0,0,0,.6); border: 2px solid var(--accent); font: 500 calc(34px * var(--fit, 1))/1.5 "JetBrains Mono", Consolas, monospace; color: var(--accent); white-space: pre-wrap; }
  .list { margin: 0; padding: 0; list-style: none; display: grid; gap: 18px; }
  .list li { padding: 22px 28px; border-left: 8px solid var(--accent); background: rgba(255,255,255,.08); border-radius: 12px; font-size: calc(40px * var(--fit, 1)); font-weight: 600; }
  @keyframes reveal { from { opacity: 0; transform: translateY(60px); filter: blur(16px); } to { opacity: 1; transform: none; filter: none; } }
  @keyframes kenburns { from { transform: scale(1.02); } to { transform: scale(1.14); } }
</style>
</head>
<body>
  <div id="root" data-composition-id="main" data-no-timeline data-start="0" data-duration="${total}" data-width="${document.width}" data-height="${document.height}">
${clips.join("\n")}
  </div>
  <script>
    // El adaptador CSS de HyperFrames solo lleva al tiempo local de su clip las animaciones de
    // elementos HTML. Las de elementos SVG (dibujos animados por la IA) las mueve el de WAAPI con
    // el tiempo global, y en la escena 2 en adelante saldrían ya terminadas. El adaptador de
    // Anime.js llama a seek(ms) en cada frame y corre después de esos dos: lo usamos para ponerlas
    // en el tiempo de su escena.
    window.__hfAnime = (window.__hfAnime || []).concat([{
      seek: function (ms) {
        document.getAnimations().forEach(function (animation) {
          var target = animation.effect && animation.effect.target;
          if (!target || target.namespaceURI !== "http://www.w3.org/2000/svg") return;
          var clip = target.closest("[data-start]");
          animation.currentTime = Math.max(0, ms - (clip ? parseFloat(clip.getAttribute("data-start")) || 0 : 0) * 1000);
          animation.pause();
        });
      },
      pause: function () {},
    }]);
  </script>
</body>
</html>
`,
  };
}

/**
 * Como `calculateMetadata` en Remotion: cada escena con voz dura lo que mide su MP3 de verdad
 * más `TAIL_FRAMES`. La duración guardada puede venir de una estimación o de una edición a mano,
 * y si queda corta HyperFrames recorta la narración al final de la escena.
 */
export async function withMeasuredAudio(document, pathOf) {
  const scenes = await Promise.all(document.scenes.map(async (scene) => {
    if (!scene.audioAssetId) return scene;
    const seconds = mp3DurationSeconds(await readFile(pathOf(scene.audioAssetId)));
    return seconds ? { ...scene, durationFrames: Math.ceil(seconds * document.fps) + TAIL_FRAMES } : scene;
  }));
  return { ...document, scenes };
}

/**
 * Renderiza `job.inputProps.document` con HyperFrames. Los medios se copian desde el volumen local
 * (no por HTTP) a una carpeta temporal que hace de proyecto; se borra al terminar.
 */
export async function runHyperframesRender(job, outputPath, { database, mediaRoot, onUpdate }) {
  let document = job.inputProps.document;
  const projectDir = mkdtempSync(join(tmpdir(), "hyperframes-"));
  try {
    onUpdate({ log: "Preparando el proyecto de HyperFrames…" });
    mkdirSync(join(projectDir, "media"));
    const files = new Map();
    const ids = [...new Set(document.scenes.flatMap((scene) => [scene.imageAssetId, scene.audioAssetId]).filter(Boolean))];
    for (const id of ids) {
      const row = (await database.query("SELECT data_json FROM assets WHERE id = $1", [id])).rows[0];
      if (!row) throw new Error(`Falta el asset ${id} de una escena.`);
      const source = resolve(mediaRoot, JSON.parse(row.data_json).storageKey);
      if (!source.startsWith(resolve(mediaRoot) + sep)) throw new Error(`Ruta de asset inválida: ${id}.`);
      if (!existsSync(source)) throw new Error(`El archivo del asset ${id} ya no está en el disco (¿/app/storage sin volumen persistente?). Vuelve a ponerlo en la escena.`);
      const name = `media/${basename(source)}`;
      await copyFile(source, join(projectDir, name));
      files.set(id, name);
    }
    document = await withMeasuredAudio(document, (id) => join(projectDir, files.get(id)));
    const { html, duration } = buildHyperframesHtml(document, (id) => files.get(id));
    await writeFile(join(projectDir, "index.html"), html, "utf8");

    // Reutiliza el Chrome Headless Shell que ya descarga Remotion en vez de bajar otro.
    process.env.PRODUCER_HEADLESS_SHELL_PATH ??= (await ensureBrowser()).path;
    onUpdate({ log: `Renderizando ${duration.toFixed(1)}s a ${document.fps}fps (${document.width}x${document.height}) con HyperFrames…` });
    let lastLoggedStep = -1;
    await executeRenderJob(createRenderJob({ fps: document.fps, quality: "high", format: "mp4" }), projectDir, outputPath, (state, message) => {
      const percent = state.progress ?? 0;
      onUpdate({ progress: 10 + Math.round(percent * 0.85) });
      const step = Math.floor(percent / 5); // una línea cada ~5% para no inundar el log
      if (step !== lastLoggedStep) {
        lastLoggedStep = step;
        onUpdate({ log: message || state.currentStage });
      }
    });
    onUpdate({ log: "Render de video completo, guardando MP4…" });
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}
