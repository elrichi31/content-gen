import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { copyFile, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, resolve, sep } from "node:path";
import { clearInterval, setInterval } from "node:timers";
import pg from "pg";
import { runHyperframesRender } from "./hyperframes.mjs";

const jobArgumentIndex = process.argv.indexOf("--job");
const jobPath = jobArgumentIndex === -1 ? undefined : process.argv[jobArgumentIndex + 1];
const idArgumentIndex = process.argv.indexOf("--id");
const requestedJobId = idArgumentIndex === -1 ? undefined : process.argv[idArgumentIndex + 1];
const now = () => new Date().toISOString();
const MAX_LOG_LINES = 60;
const update = async (database, job, patch) => {
  const next = { ...job, ...patch, updatedAt: now() };
  const result = await database.query("UPDATE render_jobs SET data_json = $1 WHERE id = $2 AND (data_json::jsonb->>'status') != 'cancelled'", [JSON.stringify(next), job.id]);
  return result.rowCount ? next : null;
};

/**
 * Progreso y "consola" del render viven en la misma fila: cada tick escribe el % y,
 * si hay una línea nueva, la agrega al log (recortado a las últimas MAX_LOG_LINES) para
 * que el panel de la app pueda mostrar qué está haciendo Remotion en vivo, sin abrir nada
 * fuera del navegador.
 */
async function reportProgress(database, jobId, patch) {
  try {
    const row = (await database.query("SELECT data_json FROM render_jobs WHERE id = $1", [jobId])).rows[0];
    if (!row) return;
    const job = JSON.parse(row.data_json);
    if (job.status !== "processing") return;
    const next = {};
    if (patch.progress !== undefined) next.progress = patch.progress;
    if (patch.log) next.log = [...(job.log ?? []), patch.log].slice(-MAX_LOG_LINES);
    if (Object.keys(next).length) await update(database, job, next);
  } catch {
    // La recuperación automática reintenta el job si la base falla o el worker cae.
  }
}

/**
 * Remotion avisa del progreso con callbacks síncronos, y cada aviso es leer-modificar-escribir sobre
 * la misma fila. Encadenarlos evita que dos avisos solapados lean el mismo estado y uno pise al otro
 * (con SQLite eran síncronos y esa carrera no existía). `flush()` espera a que se vacíe la cola.
 */
function progressQueue(database, jobId) {
  let chain = Promise.resolve();
  return {
    report(patch) { chain = chain.then(() => reportProgress(database, jobId, patch)); },
    flush: () => chain,
  };
}

// Reclamar es atómico: si otro worker ya tomó el job, esta actualización no cambia filas.
const claim = async (database, job, patch) => {
  const next = { ...job, ...patch };
  const result = await database.query("UPDATE render_jobs SET data_json = $1 WHERE id = $2 AND (data_json::jsonb->>'status') = 'queued'", [JSON.stringify(next), job.id]);
  return result.rowCount ? next : null;
};

/**
 * Los mensajes de Remotion (CLI o SDK) pueden traer un stack larguísimo con códigos ANSI:
 * para la app vale más la línea que explica el fallo que los últimos mil caracteres.
 */
export function renderErrorMessage(output) {
  // eslint-disable-next-line no-control-regex
  const clean = (output ?? "").replace(/\[[0-9;]*m/g, "").trim();
  if (!clean) return "Remotion no pudo renderizar.";
  const lines = clean.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const meaningful = lines.filter((line) => !line.startsWith("at ") && !/^\d+\s*│/.test(line) && !/^│/.test(line));
  const start = meaningful.findIndex((line) => /error|failed|cannot|no se pudo/i.test(line));
  const picked = (start === -1 ? meaningful : meaningful.slice(start)).slice(0, 4).join(" ");
  return (picked || clean).slice(0, 1000);
}

/**
 * Renderiza en el mismo proceso con el SDK de Remotion (@remotion/bundler + @remotion/renderer)
 * en vez de invocar `npx remotion render` como subproceso: nada de ventanas de consola en
 * Windows, y el progreso llega como números en vez de tener que parsear texto de stdout.
 */
/**
 * Sirve en 127.0.0.1 solo los assets de las escenas del job, leídos del volumen local. Remotion
 * pedía las imágenes y audios a `/api/assets` del Studio, pero esa ruta está detrás del login:
 * el Chromium del render recibía 401 y la imagen de fondo desaparecía sin dar error.
 */
async function startAssetServer(document, { database, mediaRoot }) {
  const ids = [...new Set(document.scenes.flatMap((scene) => [scene.imageAssetId, scene.audioAssetId]).filter(Boolean))];
  if (!ids.length) return null;
  const files = new Map();
  for (const id of ids) {
    const row = (await database.query("SELECT data_json FROM assets WHERE id = $1", [id])).rows[0];
    if (!row) throw new Error(`Falta el asset ${id} de una escena.`);
    const data = JSON.parse(row.data_json);
    const path = resolve(mediaRoot, data.storageKey);
    if (!path.startsWith(resolve(mediaRoot) + sep)) throw new Error(`Ruta de asset inválida: ${id}.`);
    if (!existsSync(path)) throw new Error(`No se encontró el archivo del asset ${id}.`);
    files.set(id, { path, mimeType: data.mimeType });
  }
  const server = createServer((request, response) => {
    const id = /^\/api\/assets\/([^/?#]+)/.exec(request.url ?? "")?.[1];
    const file = id ? files.get(id) : undefined;
    if (!file) { response.writeHead(404).end(); return; }
    const { size } = statSync(file.path);
    // Range: el <Audio> de Remotion lo pide para leer la duración y moverse por el archivo.
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? "");
    const start = range?.[1] ? Number(range[1]) : range?.[2] ? Math.max(0, size - Number(range[2])) : 0;
    const end = range?.[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
    if (range && start > end) { response.writeHead(416, { "Content-Range": `bytes */${size}` }).end(); return; }
    response.writeHead(range ? 206 : 200, {
      "Content-Type": file.mimeType, "Content-Length": end - start + 1, "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*", ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    });
    if (request.method === "HEAD") { response.end(); return; }
    createReadStream(file.path, { start, end }).pipe(response);
  });
  await new Promise((resolveListen, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolveListen); });
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((resolveClose) => server.close(() => resolveClose())) };
}

async function runRemotionRender(job, outputPath, onUpdate, { database, mediaRoot }) {
  const entryPoint = resolve(process.cwd(), "packages/video-engine/src/index.ts");
  const assets = await startAssetServer(job.inputProps.document, { database, mediaRoot });
  try {
    await renderRemotion({ ...job, inputProps: { ...job.inputProps, ...(assets ? { assetBaseUrl: assets.url } : {}) } }, entryPoint, outputPath, onUpdate);
  } finally {
    await assets?.close();
  }
}

async function renderRemotion(job, entryPoint, outputPath, onUpdate) {
  onUpdate({ log: "Empaquetando la composición…" });
  const serveUrl = await bundle({ entryPoint });

  onUpdate({ log: `Resolviendo la composición "${job.compositionId}"…` });
  const composition = await selectComposition({ serveUrl, id: job.compositionId, inputProps: job.inputProps });
  onUpdate({ log: `Renderizando ${composition.durationInFrames} frames a ${composition.fps}fps (${composition.width}x${composition.height})…` });

  let lastLoggedStep = -1;
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: outputPath,
    inputProps: job.inputProps,
    onProgress: ({ progress, renderedFrames, encodedFrames }) => {
      onUpdate({ progress: 10 + Math.round(progress * 85) });
      const step = Math.floor(progress * 20); // una línea cada ~5% para no inundar el log
      if (step !== lastLoggedStep) {
        lastLoggedStep = step;
        onUpdate({ log: `Frame ${renderedFrames}/${composition.durationInFrames} · codificado ${encodedFrames}/${composition.durationInFrames}` });
      }
    },
  });
  onUpdate({ log: "Render de video completo, guardando MP4…" });
}

function hashFile(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    createReadStream(path).on("data", (chunk) => hash.update(chunk)).on("error", reject).on("end", () => resolveHash(hash.digest("hex")));
  });
}

async function saveExport(database, job, outputPath, mediaRoot) {
  const sizeBytes = statSync(outputPath).size;
  if (!sizeBytes) throw new Error("El MP4 renderizado está vacío.");
  const content = (await database.query("SELECT campaign_id FROM content_items WHERE id = $1 AND archived_at IS NULL", [job.contentItemId])).rows[0];
  if (!content) throw new Error("El contenido ya no está disponible para guardar el MP4.");
  const hash = await hashFile(outputPath); const storageKey = `assets/${hash}.mp4`; const target = resolve(mediaRoot, storageKey);
  mkdirSync(dirname(target), { recursive: true }); if (!existsSync(target)) await copyFile(outputPath, target);
  const createdAt = now(); const asset = { id: randomUUID(), schemaVersion: 1, filename: `${job.id}.mp4`, mimeType: "video/mp4", sizeBytes, storageKey, campaignId: content.campaign_id, contentItemId: job.contentItemId, createdAt };
  const exported = { id: randomUUID(), schemaVersion: 1, contentItemId: job.contentItemId, format: "mp4", assetId: asset.id, createdAt };
  // Juntos o ninguno: un asset sin su export (o al revés) dejaría el MP4 huérfano en la biblioteca.
  await database.query("BEGIN");
  try {
    await database.query("INSERT INTO assets (id, schema_version, data_json, created_at) VALUES ($1, $2, $3, $4)", [asset.id, 1, JSON.stringify(asset), createdAt]);
    await database.query("INSERT INTO exports (id, schema_version, content_item_id, asset_id, data_json, created_at) VALUES ($1, $2, $3, $4, $5, $6)", [exported.id, 1, job.contentItemId, asset.id, JSON.stringify(exported), createdAt]);
    await database.query("COMMIT");
  } catch (error) {
    await database.query("ROLLBACK");
    throw error;
  }
  return asset;
}

async function validateFixture() {
  const job = JSON.parse(await readFile(jobPath, "utf8"));
  if (job.status !== "queued") throw new Error(`El job ${job.id ?? "sin-id"} debe iniciar en estado queued.`);
  if (job.kind !== "video" || typeof job.compositionId !== "string") throw new Error("El contrato mínimo requiere kind=video y compositionId.");
  console.log(JSON.stringify({ id: job.id, kind: job.kind, compositionId: job.compositionId, status: "completed", events: ["queued", "processing", "completed"].map((status) => ({ status, at: now() })) }, null, 2));
}

async function processNext(jobId) {
  const url = process.env.DATABASE_URL;
  if (!url || !/^postgres(ql)?:\/\//.test(url)) throw new Error("DATABASE_URL debe ser una URL de Postgres (postgres://usuario:clave@host:puerto/base).");
  // `renders/` y `media/` cuelgan de STORAGE_ROOT; el worker corre con cwd en la raíz del repo.
  const storageRoot = resolve(process.env.STORAGE_ROOT ?? "storage"); const mediaRoot = resolve(storageRoot, "media");
  const database = new pg.Client({ connectionString: url });
  await database.connect();
  const latestOf = async (id) => JSON.parse((await database.query("SELECT data_json FROM render_jobs WHERE id = $1", [id])).rows[0].data_json);
  try {
    const row = (await database.query(`SELECT data_json FROM render_jobs WHERE (data_json::jsonb->>'status') = 'queued'${jobId ? " AND id = $1" : ""} ORDER BY created_at LIMIT 1`, jobId ? [jobId] : [])).rows[0];
    if (!row) return console.log(JSON.stringify({ status: "idle" }));
    const job = JSON.parse(row.data_json);
    const claimed = await claim(database, job, { status: "processing", progress: 10, log: ["Job reclamado, arrancando el render…"] });
    if (!claimed) return console.log(JSON.stringify({ id: job.id, status: "taken" }));
    const outputPath = resolve(storageRoot, "renders", `${job.id}.mp4`);
    const progress = progressQueue(database, job.id);
    const heartbeat = setInterval(() => progress.report({}), 15_000);
    heartbeat.unref();
    try {
      if (!["StandardVideo", "TimelineVideo", "HyperframesVideo"].includes(job.compositionId)) throw new Error("La composición de video no está registrada.");
      mkdirSync(dirname(outputPath), { recursive: true });
      const onUpdate = (patch) => progress.report(patch);
      if (job.compositionId === "HyperframesVideo") await runHyperframesRender(job, outputPath, { database, mediaRoot, onUpdate });
      else await runRemotionRender(job, outputPath, onUpdate, { database, mediaRoot });
      await progress.flush();
      const latest = await latestOf(job.id);
      if (latest.status === "cancelled") return console.log(JSON.stringify({ id: latest.id, status: "cancelled" }));
      const asset = await saveExport(database, job, outputPath, mediaRoot);
      const completed = await update(database, claimed, { status: "completed", progress: 100, outputAssetId: asset.id, completedAt: now(), error: null, log: [...(latest.log ?? []), "Listo."].slice(-MAX_LOG_LINES) });
      console.log(JSON.stringify({ id: job.id, status: completed?.status ?? "cancelled", assetId: asset.id }));
    } catch (error) {
      await progress.flush();
      const latest = await latestOf(job.id);
      if (latest.status === "cancelled") return console.log(JSON.stringify({ id: latest.id, status: "cancelled" }));
      const message = renderErrorMessage(error instanceof Error ? (error.stack ?? error.message) : String(error));
      const failed = await update(database, latest, { status: "failed", completedAt: now(), error: message, log: [...(latest.log ?? []), `Error: ${message}`].slice(-MAX_LOG_LINES) });
      console.log(JSON.stringify({ id: job.id, status: failed?.status ?? "cancelled", error: failed?.error }));
    } finally {
      clearInterval(heartbeat);
      if (existsSync(outputPath)) rmSync(outputPath, { force: true });
    }
  } finally {
    await database.end();
  }
}

// Solo actúa como ejecutable: importarlo desde una prueba no lanza ningún render.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  if (jobPath) await validateFixture(); else if (process.argv.includes("--once")) await processNext(requestedJobId); else throw new Error("Usa --job <ruta-al-job.json> o --once.");
}
