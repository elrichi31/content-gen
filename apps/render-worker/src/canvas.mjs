import { Browser, computeExecutablePath, detectBrowserPlatform, install } from "@puppeteer/browsers";
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { availableParallelism, homedir, tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import puppeteer from "puppeteer-core";
import { PUPPETEER_REVISIONS } from "puppeteer-core/internal/revisions.js";
import { buildCanvasHtml } from "../../../packages/canvas-engine/src/index.js";
import { mp3DurationSeconds } from "../../../packages/domain/src/audio.ts";
import { buildCanvasSpec } from "../../../packages/domain/src/canvas.ts";
import { TAIL_FRAMES } from "../../../packages/domain/src/video.ts";

/**
 * Motor Canvas: la runtime de packages/canvas-engine pinta cada frame en Chrome headless (Canvas 2D,
 * función pura del tiempo) y ffmpeg lo codifica. El video se reparte en tramos contiguos entre
 * varios navegadores en paralelo; cada uno codifica su tramo y al final se concatenan sin
 * recodificar y se mezclan las voces. Ver showreel/DECISIONES.md para el porqué de cada pieza.
 */

const intFromEnv = (name, fallback, min, max) => {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
};

export const canvasSettings = () => ({
  fps: intFromEnv("CANVAS_FPS", 60, 24, 60),
  // 4 muestras de motion blur: frente a 6, SSIM medio 0,9998 (peor 0,992, en la onda del gancho) y un
  // ~30 % menos de dibujo por frame, que era el grueso del render.
  subframes: intFromEnv("CANVAS_SUBFRAMES", 4, 1, 16),
  workers: intFromEnv("CANVAS_WORKERS", Math.max(1, Math.min(4, availableParallelism() - 1)), 1, 16),
});

/** Reparte `frames` en `workers` tramos contiguos [desde, hasta) sin tramos vacíos. */
export function frameRanges(frames, workers) {
  const count = Math.max(1, Math.min(workers, frames));
  const per = Math.ceil(frames / count);
  return Array.from({ length: count }, (_, index) => [index * per, Math.min(frames, (index + 1) * per)]).filter(([from, to]) => to > from);
}

/**
 * Argumentos de ffmpeg para el MP4 final: video concatenado (copia) + voces de cada escena
 * desplazadas a su `voiceAt`. Sin voces se pone una pista muda: algunas apps rechazan MP4 sin audio.
 */
export function muxArguments({ concatList, voices, duration, output }) {
  const inputs = ["-f", "concat", "-safe", "0", "-i", concatList];
  for (const voice of voices) inputs.push("-i", voice.path);
  let filter;
  if (voices.length) {
    const delayed = voices.map((voice, index) => `[${index + 1}:a]aresample=48000,adelay=${Math.max(0, Math.round(voice.at * 1000))}:all=1[v${index}]`);
    const mixed = voices.length > 1 ? `${voices.map((_, index) => `[v${index}]`).join("")}amix=inputs=${voices.length}:normalize=0:dropout_transition=0[mix];[mix]` : "[v0]";
    // Voz sola a -16 LUFS / -1.5 dBTP: deja aire para la música que se suma en TikTok.
    filter = `${delayed.join(";")};${mixed}loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,apad[aout]`;
  } else {
    inputs.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");
  }
  return [
    "-y", "-loglevel", "error", ...inputs,
    ...(filter ? ["-filter_complex", filter, "-map", "0:v", "-map", "[aout]"] : ["-map", "0:v", "-map", "1:a"]),
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-t", String(duration), "-movflags", "+faststart", output,
  ];
}

/** Codificación de cada tramo: ya con la calidad final, para concatenar sin recodificar. */
// Los frames viajan como JPEG q95: codificar PNG de 1080x1920 con grano costaba ~5x más (4 MB por
// frame) y el resultado final es H.264 4:2:0 igual. La matriz BT.709 se fija a mano: por defecto
// swscale convierte con BT.601 y el video, etiquetado 709, salía con los colores corridos.
export const FRAME_FORMAT = { type: "image/jpeg", quality: 0.95, codec: "mjpeg" };
export const segmentArguments = (fps, output) => [
  "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", FRAME_FORMAT.codec, "-i", "-",
  "-vf", "scale=in_range=full:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p",
  // veryfast: x264 «medium» se comía ~1,5 s de CPU por segundo de video, peleándola con Chrome.
  // CRF 16 compensa la eficiencia que se pierde; las redes recodifican igual.
  "-c:v", "libx264", "-preset", process.env.CANVAS_X264_PRESET || "veryfast", "-crf", "16", "-profile:v", "high",
  "-x264-params", `keyint=${fps * 2}:min-keyint=${fps}`, "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
  "-r", String(fps), output,
];

function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolveRun() : reject(new Error(`${command} salió con ${code}: ${stderr.slice(-800)}`))));
  });
}

/**
 * Chrome para el render: el que fije CANVAS_CHROME_PATH o el Headless Shell de la versión que espera
 * puppeteer-core, descargado una vez en CANVAS_CHROME_CACHE (la imagen Docker ya lo trae).
 */
export async function chromePath() {
  if (process.env.CANVAS_CHROME_PATH) return process.env.CANVAS_CHROME_PATH;
  const options = { browser: Browser.CHROMEHEADLESSSHELL, buildId: PUPPETEER_REVISIONS["chrome-headless-shell"], cacheDir: process.env.CANVAS_CHROME_CACHE || join(homedir(), ".cache", "content-gen-chrome") };
  const executablePath = computeExecutablePath(options);
  if (!existsSync(executablePath)) await install({ ...options, platform: detectBrowserPlatform() });
  return executablePath;
}

const launch = async (executablePath) => puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-gpu-vsync", "--force-color-profile=srgb", "--disable-dev-shm-usage", "--font-render-hinting=none"],
});

async function openPage(browser, html) {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => globalThis.canvasEngine.ready);
  return page;
}

const grab = async (page, frame, format = FRAME_FORMAT) => Buffer.from((await page.evaluate((index, type, quality) => globalThis.canvasEngine.renderFrame(index, type, quality), frame, format.type, format.quality)).split(",")[1], "base64");

/** PNG de frames sueltos (para revisar a ojo). `frames` son índices a los fps de `options`. */
export async function renderCanvasStills(spec, frames, outputDir, options = {}) {
  const settings = { ...canvasSettings(), ...options };
  mkdirSync(outputDir, { recursive: true });
  const browser = await launch(await chromePath());
  try {
    const page = await openPage(browser, buildCanvasHtml(spec, { ...settings, images: options.images }));
    const written = [];
    for (const frame of frames) {
      const path = join(outputDir, `f${String(frame).padStart(5, "0")}.png`);
      writeFileSync(path, await grab(page, frame, { type: "image/png" }));
      written.push(path);
    }
    return written;
  } finally {
    await browser.close();
  }
}

/**
 * Video completo de `spec` a `outputPath`. `voices`: [{ path, at }] con `at` en segundos;
 * `images`: { assetId: data URL } con las fotos de las escenas.
 */
export async function renderCanvasVideo(spec, voices, outputPath, { onUpdate = () => {}, images = {}, ...options } = {}) {
  const { fps, subframes, workers } = { ...canvasSettings(), ...options };
  const frames = Math.round(spec.duration * fps);
  const html = buildCanvasHtml(spec, { fps, subframes, images });
  const ranges = frameRanges(frames, workers);
  const tmp = mkdtempSync(join(tmpdir(), "canvas-"));
  const executablePath = await chromePath();
  const started = Date.now();
  let done = 0, lastStep = -1;
  try {
    onUpdate({ log: `Renderizando ${spec.duration.toFixed(1)}s a ${fps}fps (${spec.width}x${spec.height}) con Canvas: ${frames} frames, ${subframes} subframes, ${ranges.length} navegadores…` });
    await Promise.all(ranges.map(async ([from, to], index) => {
      // Un navegador por tramo: cada uno tiene su propio proceso de render y no se pisan la CPU.
      const browser = await launch(executablePath);
      const encoder = spawn("ffmpeg", segmentArguments(fps, join(tmp, `seg${index}.mp4`)), { stdio: ["pipe", "ignore", "pipe"] });
      let stderr = "";
      encoder.stderr.on("data", (chunk) => { stderr += chunk; });
      const encoded = new Promise((resolveEncode, reject) => {
        encoder.on("error", reject);
        encoder.on("exit", (code) => (code === 0 ? resolveEncode() : reject(new Error(`ffmpeg (tramo ${index + 1}) salió con ${code}: ${stderr.slice(-800)}`))));
      });
      try {
        const page = await openPage(browser, html);
        for (let frame = from; frame < to; frame++) {
          const image = await grab(page, frame);
          if (!encoder.stdin.write(image)) await new Promise((resolveDrain) => encoder.stdin.once("drain", resolveDrain));
          done++;
          const step = Math.floor((done / frames) * 20); // una línea cada ~5%
          onUpdate({ progress: 10 + Math.round((done / frames) * 80) });
          if (step !== lastStep) {
            lastStep = step;
            onUpdate({ log: `Frame ${done}/${frames} · ${((Date.now() - started) / 1000).toFixed(0)}s` });
          }
        }
        encoder.stdin.end();
        await encoded;
      } catch (error) {
        encoder.kill("SIGKILL");
        throw error;
      } finally {
        await browser.close();
      }
    }));
    onUpdate({ progress: 92, log: "Uniendo tramos y mezclando la voz…" });
    const concatList = join(tmp, "list.txt");
    writeFileSync(concatList, ranges.map((_, index) => `file 'seg${index}.mp4'`).join("\n"));
    await run("ffmpeg", muxArguments({ concatList, voices, duration: frames / fps, output: outputPath }));
    onUpdate({ log: `Render de video completo en ${((Date.now() - started) / 1000).toFixed(0)}s, guardando MP4…` });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** Ruta en disco de cada asset (voz e imagen) de las escenas, validada contra `mediaRoot`. */
async function assetPaths(document, { database, mediaRoot }) {
  const paths = new Map();
  for (const id of new Set(document.scenes.flatMap((scene) => [scene.audioAssetId, scene.imageAssetId]).filter(Boolean))) {
    const row = (await database.query("SELECT data_json FROM assets WHERE id = $1", [id])).rows[0];
    if (!row) throw new Error(`Falta el asset ${id} de una escena.`);
    const path = resolve(mediaRoot, JSON.parse(row.data_json).storageKey);
    if (!path.startsWith(resolve(mediaRoot) + sep)) throw new Error(`Ruta de asset inválida: ${id}.`);
    if (!existsSync(path)) throw new Error(`El archivo del asset ${id} ya no está en el disco (¿/app/storage sin volumen persistente?). Vuelve a ponerlo en la escena.`);
    paths.set(id, path);
  }
  return paths;
}

/**
 * Foto de escena → data URL JPEG del tamaño justo para cubrir 1080x1920 con el zoom del Ken Burns.
 * Las originales pueden pesar varios MB (y ser PNG o WebP): van embebidas en la página de cada
 * navegador, así que se reducen una vez aquí con ffmpeg. Nunca se agrandan más de lo necesario.
 */
export function imageDataUrl(path) {
  return new Promise((resolveImage, reject) => {
    const child = spawn("ffmpeg", ["-loglevel", "error", "-i", path, "-frames:v", "1", "-vf", "scale=w=1330:h=2290:force_original_aspect_ratio=increase", "-pix_fmt", "yuvj420p", "-q:v", "3", "-f", "image2pipe", "-c:v", "mjpeg", "-"], { stdio: ["ignore", "pipe", "pipe"] });
    const chunks = [];
    let stderr = "";
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 && chunks.length ? resolveImage(`data:image/jpeg;base64,${Buffer.concat(chunks).toString("base64")}`) : reject(new Error(`No se pudo leer la imagen de una escena: ${stderr.slice(-300)}`))));
  });
}

/**
 * Cada escena con voz dura lo que mide su MP3 de verdad más `TAIL_FRAMES`. La duración guardada puede
 * venir de una estimación o de una edición a mano, y si queda corta se recortaría la narración.
 */
export async function withMeasuredAudio(document, pathOf) {
  const scenes = await Promise.all(document.scenes.map(async (scene) => {
    if (!scene.audioAssetId) return scene;
    const seconds = mp3DurationSeconds(await readFile(pathOf(scene.audioAssetId)));
    return seconds ? { ...scene, durationFrames: Math.ceil(seconds * document.fps) + TAIL_FRAMES } : scene;
  }));
  return { ...document, scenes };
}

/** Documento + rutas de los assets → spec, voces e imágenes, con la duración real de cada voz. */
export async function prepareCanvasRender(document, pathOf) {
  const measured = await withMeasuredAudio(document, pathOf);
  const spec = buildCanvasSpec(measured);
  const voices = measured.scenes
    .map((scene, index) => (scene.audioAssetId ? { path: pathOf(scene.audioAssetId), at: spec.scenes[index].voiceAt } : null))
    .filter(Boolean);
  const ids = [...new Set(measured.scenes.map((scene) => scene.imageAssetId).filter(Boolean))];
  const images = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await imageDataUrl(pathOf(id))])));
  return { spec, voices, images };
}

export async function runCanvasRender(job, outputPath, { database, mediaRoot, onUpdate }) {
  onUpdate({ log: "Preparando el render de Canvas…" });
  const paths = await assetPaths(job.inputProps.document, { database, mediaRoot });
  const { spec, voices, images } = await prepareCanvasRender(job.inputProps.document, (id) => paths.get(id));
  await renderCanvasVideo(spec, voices, outputPath, { onUpdate, images });
}

// Uso local, sin base de datos (cada asset se busca en <dir-del-json>/<assetId>.<extensión>):
//   node apps/render-worker/src/canvas.mjs stills <documento.json> <carpeta> 0,120,600
//   node apps/render-worker/src/canvas.mjs video <documento.json> <salida.mp4>
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  const [mode, documentPath, output, list] = process.argv.slice(2);
  const document = JSON.parse(await readFile(documentPath, "utf8"));
  const base = resolve(documentPath, "..");
  const files = readdirSync(base);
  const { spec, voices, images } = await prepareCanvasRender(document, (id) => join(base, files.find((name) => name.startsWith(`${id}.`)) ?? `${id}.mp3`));
  if (mode === "spec") console.log(JSON.stringify(spec, null, 2));
  else if (mode === "stills") console.log((await renderCanvasStills(spec, list.split(",").map(Number), resolve(output), { images })).join("\n"));
  else if (mode === "video") await renderCanvasVideo(spec, voices, resolve(output), { images, onUpdate: (patch) => patch.log && console.log(patch.log) });
  else throw new Error("Usa stills, video o spec.");
}
