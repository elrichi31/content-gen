import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { adaptClient } from "../apps/studio/src/lib/db.ts";
import {
  accentPairSchema, DEFAULT_ACCENTS, HOOK_STYLES, SCENE_KEYS_BY_TEMPLATE, SCENE_KIND_BY_KEY,
  VIDEO_NICHES, videoDocumentSchema,
} from "../packages/domain/src/video.ts";

/**
 * Sube los VideoDocument guardados antes de la paridad con `video-autom` a la
 * estructura actual: layouts por escena, accents, niche, hook y duración objetivo.
 * Los datos ya estaban ahí (el importador los dejó en `legacy`), solo se recolocan.
 */

const templateFor = (scenes) => {
  const ids = scenes.map((scene) => scene.id).join(",");
  for (const [templateId, keys] of Object.entries(SCENE_KEYS_BY_TEMPLATE)) if (keys.join(",") === ids) return templateId;
  return null;
};

async function legacyScript(document) {
  const path = typeof document.legacy?.sourcePath === "string" ? document.legacy.sourcePath : "";
  if (!path || !existsSync(path)) return null;
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; }
}

export async function upgradeVideoDocument(document) {
  if (videoDocumentSchema.safeParse(document).success) return { status: "skipped", document };

  const templateId = templateFor(document.scenes ?? []);
  if (!templateId) {
    // Registros de composiciones ya renderizadas: no son editables, solo guardan el MP4.
    const single = document.scenes?.length === 1 && document.scenes[0].id === "legacy";
    if (!single) return { status: "unsupported", document };
    const upgraded = { ...document, templateId: "legacy", scenes: [{ ...document.scenes[0], kind: "intro" }] };
    const parsed = videoDocumentSchema.safeParse(upgraded);
    return parsed.success ? { status: "upgraded", document: parsed.data } : { status: "unsupported", document };
  }

  const script = await legacyScript(document);
  const accents = document.legacy?.accents ?? script?.accents ?? {};
  const imagePrompts = document.legacy?.imagePrompts ?? script?.imagePrompts ?? {};
  const totalSeconds = Math.round(document.scenes.reduce((total, scene) => total + scene.durationFrames, 0) / (document.fps ?? 30));

  const upgraded = {
    ...document,
    templateId,
    niche: VIDEO_NICHES.includes(script?.niche) ? script.niche : "general",
    hookStyle: HOOK_STYLES.includes(script?.hookStyle) ? script.hookStyle : "curiosity",
    targetDurationSeconds: script?.targetDurationSeconds ?? Math.min(180, Math.max(15, totalSeconds)),
    scenes: document.scenes.map((scene) => {
      const accent = accentPairSchema.safeParse(accents[scene.id]);
      return {
        ...scene,
        kind: SCENE_KIND_BY_KEY[scene.id],
        accent: accent.success ? accent.data : [...DEFAULT_ACCENTS[scene.id]],
        content: { ...scene.content, ...(imagePrompts[scene.id] ? { imagePrompt: imagePrompts[scene.id] } : {}) },
      };
    }),
    legacy: { ...document.legacy, accents: undefined, imagePrompts: undefined },
  };

  const parsed = videoDocumentSchema.safeParse(upgraded);
  return parsed.success ? { status: "upgraded", document: parsed.data } : { status: "unsupported", document, error: parsed.error.issues[0]?.message };
}

export async function migrateVideoDocuments(databaseUrl) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const database = adaptClient(client);
  const items = [];
  try {
    const rows = await database.prepare("SELECT id, document_json, revision FROM content_items WHERE type = 'video' AND archived_at IS NULL").all();
    for (const row of rows) {
      const stored = JSON.parse(row.document_json);
      const result = await upgradeVideoDocument(stored.document.data);
      if (result.status !== "upgraded") {
        items.push({ id: row.id, status: result.status, reason: result.error ?? null });
        continue;
      }
      const now = new Date().toISOString();
      const next = { ...stored, document: { ...stored.document, data: result.document }, revision: row.revision + 1, updatedAt: now };
      await database.prepare("UPDATE content_items SET document_json = ?, revision = ?, updated_at = ? WHERE id = ? AND revision = ?").run(JSON.stringify(next), next.revision, now, row.id, row.revision);
      items.push({ id: row.id, status: "upgraded", reason: null });
    }
  } finally {
    await client.end();
  }
  const summary = items.reduce((totals, item) => ({ ...totals, [item.status]: (totals[item.status] ?? 0) + 1 }), { upgraded: 0, skipped: 0, unsupported: 0 });
  return { summary, items };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  const url = process.env.DATABASE_URL;
  if (!url || !/^postgres(ql)?:\/\//.test(url)) throw new Error("DATABASE_URL debe ser una URL de Postgres.");
  const report = await migrateVideoDocuments(url);
  console.log(JSON.stringify(report, null, 2));
}
