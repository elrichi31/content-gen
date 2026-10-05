import { createRenderJob, executeRenderJob } from "@hyperframes/producer";
import { ensureBrowser } from "@remotion/renderer";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { copyFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";

/**
 * Motor alternativo a Remotion: el mismo documento de video (guion, imágenes y voz por escena)
 * se convierte en una composición HTML de HyperFrames y se renderiza con @hyperframes/producer.
 * No reutiliza los layouts de Remotion: es un diseño propio, más simple, en HTML + CSS.
 */

// Igual que SIL_FRAMES en @content-gen/domain/video: el respiro que se suma a cada escena.
const SIL_FRAMES = 12;

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const text = (content, ...keys) => keys.map((key) => content[key]).find((value) => typeof value === "string" && value.trim()) ?? "";
const lines = (content, ...keys) => keys.flatMap((key) => (Array.isArray(content[key]) ? content[key] : [])).filter((item) => typeof item === "string" && item.trim());
const html = (value) => escapeHtml(value).replace(/\n/g, "<br>");
const seconds = (value) => Number(value.toFixed(3));

/** Bloques de una escena en orden de aparición; cada layout del documento usa solo algunos campos. */
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
    const duration = (scene.durationFrames + SIL_FRAMES) / document.fps;
    const at = start;
    start += duration;
    const [accent, accent2] = scene.accent ?? ["#22d3ee", "#a855f7"];
    const image = scene.imageAssetId ? `<img class="bg" src="${escapeHtml(mediaSrc(scene.imageAssetId))}" alt="">` : "";
    // HyperFrames busca las animaciones CSS en el tiempo local de cada clip (comprobado en render):
    // los retrasos cuentan desde el inicio de la escena, no del video.
    const blocks = sceneBlocks(scene, document.title).map((block, order) => `<div class="reveal" style="animation-delay:${seconds(0.15 + order * 0.35)}s">${block}</div>`).join("\n        ");
    const audio = scene.audioAssetId ? `\n    <audio id="voice-${index}" src="${escapeHtml(mediaSrc(scene.audioAssetId))}" data-start="${seconds(at)}" data-duration="${seconds(duration)}" data-track-index="2"></audio>` : "";
    // Video educativo: la escena ya trae su animación (HTML + CSS aislado por el studio) y se pinta tal cual.
    if (typeof scene.content?.animationHtml === "string") {
      return `    <section id="scene-${index}" class="clip scene" data-start="${seconds(at)}" data-duration="${seconds(duration)}" data-track-index="1">
${scene.content.animationHtml}
    </section>${audio}`;
    }
    return `    <section id="scene-${index}" class="clip scene" data-start="${seconds(at)}" data-duration="${seconds(duration)}" data-track-index="1" style="--accent:${escapeHtml(accent)};--accent2:${escapeHtml(accent2 ?? accent)}">
      ${image ? `<div class="bgwrap" style="animation-duration:${seconds(duration)}s">${image}</div>` : `<div class="bgwrap empty"></div>`}
      <div class="shade"></div>
      <div class="content">
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
  .content { position: absolute; inset: 0; padding: 220px 90px 260px; display: flex; flex-direction: column; justify-content: flex-end; gap: 36px; }
  .reveal { animation: reveal .7s cubic-bezier(.2,.8,.2,1) both; }
  .tag { margin: 0; display: inline-block; padding: 12px 22px; border-radius: 999px; background: var(--accent); color: #05060a; font-weight: 800; font-size: 30px; letter-spacing: .12em; text-transform: uppercase; }
  .badge { margin: 0; font-size: 120px; font-weight: 900; line-height: 1; color: var(--accent); }
  .title { margin: 0; font-size: 104px; line-height: .98; font-weight: 900; text-transform: uppercase; letter-spacing: -.01em; text-shadow: 0 6px 40px rgba(0,0,0,.6); }
  .title.big { font-size: 132px; background: linear-gradient(90deg, #fff 30%, var(--accent2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .body { margin: 0; font-size: 46px; line-height: 1.3; color: rgba(255,255,255,.9); font-weight: 500; }
  .mono { margin: 0; padding: 32px; border-radius: 20px; background: rgba(0,0,0,.6); border: 2px solid var(--accent); font: 500 34px/1.5 "JetBrains Mono", Consolas, monospace; color: var(--accent); white-space: pre-wrap; }
  .list { margin: 0; padding: 0; list-style: none; display: grid; gap: 18px; }
  .list li { padding: 22px 28px; border-left: 8px solid var(--accent); background: rgba(255,255,255,.08); border-radius: 12px; font-size: 40px; font-weight: 600; }
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
 * Renderiza `job.inputProps.document` con HyperFrames. Los medios se copian desde el volumen local
 * (no por HTTP) a una carpeta temporal que hace de proyecto; se borra al terminar.
 */
export async function runHyperframesRender(job, outputPath, { database, mediaRoot, onUpdate }) {
  const document = job.inputProps.document;
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
      const name = `media/${basename(source)}`;
      await copyFile(source, join(projectDir, name));
      files.set(id, name);
    }
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
