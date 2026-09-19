import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { copyFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { clearInterval, setInterval } from "node:timers";
import pg from "pg";

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
async function runRemotionRender(job, outputPath, onUpdate) {
  const entryPoint = resolve(process.cwd(), "packages/video-engine/src/index.ts");
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
      if (!["StandardVideo", "TimelineVideo"].includes(job.compositionId)) throw new Error("La composición de video no está registrada.");
      mkdirSync(dirname(outputPath), { recursive: true });
      await runRemotionRender(job, outputPath, (patch) => progress.report(patch));
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
