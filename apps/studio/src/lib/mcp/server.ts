import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as adBackground from "@/app/api/ads/background/route";
import * as adGenerate from "@/app/api/ads/generate/route";
import * as adImage from "@/app/api/ads/image/route";
import * as analytics from "@/app/api/analytics/route";
import * as analyticsSync from "@/app/api/analytics/sync/route";
import * as articleGenerate from "@/app/api/articles/generate/route";
import * as assets from "@/app/api/assets/route";
import * as automationItem from "@/app/api/automations/[id]/route";
import * as automationRun from "@/app/api/automations/[id]/run/route";
import * as automations from "@/app/api/automations/route";
import * as automationRuns from "@/app/api/automation-runs/route";
import * as brandItem from "@/app/api/brand-kits/[id]/route";
import * as brands from "@/app/api/brand-kits/route";
import * as campaignDuplicate from "@/app/api/campaigns/[id]/duplicate/route";
import * as campaignItem from "@/app/api/campaigns/[id]/route";
import * as campaigns from "@/app/api/campaigns/route";
import * as carouselGenerate from "@/app/api/carousels/generate/route";
import * as carouselImage from "@/app/api/carousels/image/route";
import * as carouselRemix from "@/app/api/carousels/remix/route";
import * as carouselSlides from "@/app/api/carousels/slides/route";
import * as blogExport from "@/app/api/content-items/[id]/blog-export/route";
import * as contentDuplicate from "@/app/api/content-items/[id]/duplicate/route";
import * as contentItem from "@/app/api/content-items/[id]/route";
import * as contentItems from "@/app/api/content-items/route";
import * as costs from "@/app/api/costs/route";
import * as radar from "@/app/api/radar/route";
import * as radarAutomationItem from "@/app/api/radar/automations/[id]/route";
import * as radarAutomationRun from "@/app/api/radar/automations/[id]/run/route";
import * as radarAutomations from "@/app/api/radar/automations/route";
import * as radarRun from "@/app/api/radar/run/route";
import * as radarCancel from "@/app/api/radar/runs/[id]/cancel/route";
import * as radarRestructure from "@/app/api/radar/runs/[id]/restructure/route";
import * as radarTopic from "@/app/api/radar/topics/[id]/route";
import * as watchlistItem from "@/app/api/radar/watchlist/[id]/route";
import * as watchlist from "@/app/api/radar/watchlist/route";
import * as renderJobItem from "@/app/api/render-jobs/[id]/route";
import * as renderJobs from "@/app/api/render-jobs/route";
import * as schedule from "@/app/api/schedule/route";
import * as postItem from "@/app/api/schedule/posts/[id]/route";
import * as posts from "@/app/api/schedule/posts/route";
import * as ruleItem from "@/app/api/schedule/rules/[id]/route";
import * as rules from "@/app/api/schedule/rules/route";
import * as videoCaption from "@/app/api/videos/[id]/caption/route";
import * as canvasPlan from "@/app/api/videos/[id]/canvas-plan/route";
import * as sceneAnimation from "@/app/api/videos/[id]/scenes/[sceneId]/animation/route";
import * as sceneAudio from "@/app/api/videos/[id]/scenes/[sceneId]/audio/route";
import * as sceneImage from "@/app/api/videos/[id]/scenes/[sceneId]/image/route";
import * as voiceoverScript from "@/app/api/videos/[id]/voiceover-script/route";
import * as videoGenerate from "@/app/api/videos/generate/route";
import * as voices from "@/app/api/voices/route";
import { readAsset, storeAsset } from "@/lib/asset-storage";
import { assertAssetSignature, assetExtensions } from "@/lib/asset-file";
import { campaignCaptions } from "@/lib/campaign-export";
import { imagesToDocument } from "@/lib/carousel-automation-rules";
import { drawAiCarousel, prepareAiCarousel } from "@/lib/carousel-pipeline";
import { contentTitle } from "@/lib/content-title";
import { downloadPublicFile } from "@/lib/carousel-remix";
import { runVideoPipeline } from "./video-pipeline";
import { videoDocumentSchema } from "@content-gen/domain/video";

/*
 * Servidor MCP del Studio. Cada herramienta llama en proceso a la misma ruta de API que usa la
 * pantalla, así que hereda su validación, sus reglas de negocio y el registro de costos sin
 * duplicarlos. Lo que crea queda en borrador en la biblioteca. No se borra ni archiva contenido ni se
 * publica: eso se hace desde la app, con una persona delante. Solo se quitan cosas de agenda
 * (publicaciones del calendario, búsquedas programadas del radar), marcadas como destructivas.
 */

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Response | Promise<Response>;
type Call = { method?: string; params?: Record<string, string>; query?: Record<string, unknown>; body?: unknown };

class ToolError extends Error {}

/** Resultado que además trae una imagen: el agente la ve sin tener que iniciar sesión en el Studio. */
class WithImage {
  result: unknown; bytes: Buffer; mimeType: string;
  constructor(result: unknown, bytes: Buffer, mimeType: string) { this.result = result; this.bytes = bytes; this.mimeType = mimeType; }
}

/** Mensaje legible de un error de ruta: a veces es texto, a veces el `flatten()` de zod. */
function describe(error: unknown) {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const flat = error as { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
    const fields = Object.entries(flat.fieldErrors ?? {}).map(([field, messages]) => `${field}: ${messages.join(", ")}`);
    const all = [...(flat.formErrors ?? []), ...fields];
    if (all.length) return all.join("; ");
  }
  return JSON.stringify(error);
}

/** Lee una respuesta en streaming (NDJSON o SSE) y devuelve el evento final. */
async function lastEvent(response: Response) {
  const events = (await response.text()).split("\n").map((line) => line.replace(/^data:\s*/, "").trim()).filter(Boolean)
    .map((line) => { try { return JSON.parse(line) as { type?: string; error?: string }; } catch { return null; } })
    .filter((event): event is { type?: string; error?: string } => Boolean(event));
  const final = events.reverse().find((event) => event.type === "done" || event.type === "error");
  if (!final) throw new ToolError("La operación terminó sin resultado.");
  if (final.type === "error") throw new ToolError(final.error ?? "La operación falló.");
  return final;
}

/** `scopes` decide qué herramientas existen: con solo `studio:read` no aparece ninguna que escriba o gaste. */
export function createStudioMcpServer({ origin, scopes = ["studio:read", "studio:write"] }: { origin: string; scopes?: readonly string[] }) {
  const server = new McpServer({ name: "content-gen-studio", version: "1.0.0" });

  // `handler` es cualquier export de ruta: cada una declara sus params con su propio tipo.
  async function call(route: unknown, { method = "GET", params = {}, query = {}, body }: Call = {}) {
    // El origen real importa: el render usa el de la petición para que el worker descargue los assets.
    const url = new URL("/api/mcp", origin);
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    const request = new Request(url, { method, headers: body === undefined ? {} : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const response = await (route as Handler)(request, { params: Promise.resolve(params) });
    const type = response.headers.get("content-type") ?? "";
    if (type.includes("ndjson") || type.includes("event-stream")) return lastEvent(response);
    if (response.status === 204) return { ok: true };
    if (!type.includes("json")) throw new ToolError("Esa operación devuelve un archivo; descárgalo desde la app.");
    const payload = await response.json() as { error?: unknown };
    if (!response.ok) throw new ToolError(describe(payload?.error ?? `Error ${response.status}`));
    return payload;
  }

  const saveContent = (campaignId: string, type: "carousel" | "ad" | "video" | "article", data: unknown) =>
    call(contentItems.POST, { method: "POST", body: { campaignId, type, document: { schemaVersion: 1, data } } }) as Promise<{ id: string; revision: number }>;
  const getContent = (id: string) => call(contentItem.GET, { params: { id } }) as Promise<{ id: string; revision: number; campaignId: string; type: string; document: { data: Record<string, unknown> } }>;

  type Shape = Record<string, z.ZodType>;
  function tool<S extends Shape>(name: string, options: { description: string; input: S; readOnly?: boolean; spends?: boolean; destructive?: boolean }, run: (args: z.infer<z.ZodObject<S>>) => Promise<unknown>) {
    if (!scopes.includes(options.readOnly ? "studio:read" : "studio:write")) return;
    server.registerTool(name, {
      description: options.description,
      inputSchema: options.input,
      annotations: { readOnlyHint: Boolean(options.readOnly), destructiveHint: Boolean(options.destructive), openWorldHint: Boolean(options.spends) },
    }, (async (args: z.infer<z.ZodObject<S>>) => {
      try {
        const output = await run(args);
        if (!(output instanceof WithImage)) return { content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }] };
        return { content: [{ type: "text" as const, text: JSON.stringify(output.result, null, 2) }, { type: "image" as const, data: output.bytes.toString("base64"), mimeType: output.mimeType }] };
      }
      catch (error) { return { isError: true, content: [{ type: "text" as const, text: error instanceof Error ? error.message : "La herramienta falló." }] }; }
    }) as never);
  }

  const id = (what: string) => z.string().min(1).describe(`ID de ${what}`);
  const campaignId = id("la campaña (ver listar_campanas)");
  const brandKitId = z.string().min(1).optional().describe("ID de marca; si se omite, la de la campaña");
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Fecha YYYY-MM-DD");
  const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).describe("Mes YYYY-MM");
  const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).describe("Hora HH:MM, 24 h");
  const platform = z.enum(["instagram", "tiktok", "youtube", "linkedin", "blog"]);
  const spendNote = " Gasta créditos de IA.";

  type RadarAutomationRow = { id: string; name: string; active: boolean; frequency: string; time: string; weekday: number; monthDay: number; nextRunAt: string; scan: Record<string, unknown>; lastExecution?: unknown };
  const radarAutomationSummary = ({ id: automation, name, active, frequency, time, weekday, monthDay, nextRunAt, scan, lastExecution }: RadarAutomationRow) =>
    ({ id: automation, name, active, frequency, time, weekday, monthDay, nextRunAt, scan, lastExecution: lastExecution ?? null });

  /* ----------------------------------- Resumen ----------------------------------- */

  tool("resumen_estado", {
    description: "Foto del Studio en una llamada: borradores por tipo, publicaciones de los próximos 7 días (y huecos sin pieza), renders en curso o fallidos, gasto del mes, temas nuevos del radar y automatizaciones. Úsala primero para saber por dónde empezar.",
    input: {},
    readOnly: true,
  }, async () => {
    const today = new Date().toISOString().slice(0, 10);
    const week = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const [items, upcoming, jobs, radarState, automationList, radarAutomationList] = await Promise.all([
      call(contentItems.GET) as Promise<{ id: string; type: string; updatedAt: string; document: { data?: Record<string, unknown> } }[]>,
      call(posts.GET, { query: { startDate: today, endDate: week } }) as Promise<{ id: string; date: string; time: string; platform: string; status: string; contentItemId: string | null; title: string }[]>,
      call(renderJobs.GET) as Promise<{ id: string; contentItemId: string; status: string; progress: number; error: string | null; createdAt: string }[]>,
      call(radar.GET, { query: { status: "nuevo", limit: 5 } }) as Promise<{ topics: { id: string; title: string; score: number; vertical: string }[]; counts: Record<string, number>; spend: unknown }>,
      call(automations.GET) as Promise<{ id: string; name: string; active: boolean; nextSlot: unknown; lastRunAt: string | null; lastResult: string | null; lastFailed: boolean }[]>,
      call(radarAutomations.GET) as Promise<RadarAutomationRow[]>,
    ]);
    const byType = items.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.type]: (counts[item.type] ?? 0) + 1 }), {});
    return {
      biblioteca: { total: items.length, porTipo: byType, recientes: items.slice(0, 5).map((item) => ({ id: item.id, type: item.type, title: contentTitle(item as never), updatedAt: item.updatedAt })) },
      proximos7Dias: { publicaciones: upcoming.map(({ id: post, date, time, platform, status, contentItemId, title }) => ({ id: post, date, time, platform, status, contentItemId, title })), sinPieza: upcoming.filter((post) => !post.contentItemId).length },
      renders: jobs.filter((job) => ["queued", "processing", "failed"].includes(job.status)).slice(0, 10).map(({ id: job, contentItemId, status, progress, error, createdAt }) => ({ id: job, contentItemId, status, progress, error, createdAt })),
      gastoDelMes: radarState.spend,
      radar: { contadores: radarState.counts, mejoresNuevos: radarState.topics.map(({ id: topic, title, score, vertical }) => ({ id: topic, title, score, vertical })) },
      automatizaciones: automationList.map(({ id: automation, name, active, nextSlot, lastRunAt, lastResult, lastFailed }) => ({ id: automation, name, active, nextSlot, lastRunAt, lastResult, lastFailed })),
      automatizacionesRadar: radarAutomationList.map(radarAutomationSummary),
    };
  });

  /* ------------------------------ Marcas y campañas ------------------------------ */

  tool("listar_marcas", { description: "Lista las marcas (brand kits) con su color y perfil de negocio.", input: {}, readOnly: true }, () => call(brands.GET));
  const business = z.object({ sector: z.string().optional(), offering: z.string().optional(), audience: z.string().optional(), voice: z.string().optional() }).partial().describe("Perfil: sector, qué vende, audiencia y voz");
  tool("crear_marca", { description: "Crea una marca.", input: { name: z.string().min(1).max(120), primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).describe("#RRGGBB"), business: business.optional() } },
    (args) => call(brands.POST, { method: "POST", body: args }));
  tool("editar_marca", { description: "Cambia nombre, color o perfil de una marca.", input: { id: id("la marca"), name: z.string().min(1).max(120).optional(), primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), business: business.optional() } },
    ({ id: brandId, ...patch }) => call(brandItem.PATCH, { method: "PATCH", params: { id: brandId }, body: patch }));

  tool("listar_campanas", { description: "Lista las campañas activas con su brief y marca.", input: {}, readOnly: true }, () => call(campaigns.GET));
  tool("obtener_campana", { description: "Detalle de una campaña.", input: { id: campaignId }, readOnly: true }, ({ id: campaign }) => call(campaignItem.GET, { params: { id: campaign } }));
  const brief = z.object({ topic: z.string().min(3).max(240), audience: z.string().min(2).max(160), tone: z.string().min(2).max(120), language: z.string().min(2).max(40).default("es"), context: z.string().max(10000).default("") }).describe("Brief que guía la generación");
  tool("crear_campana", { description: "Crea una campaña.", input: { name: z.string().min(1).max(160), brief: brief.optional(), brandKitId: z.string().min(1).nullable().optional() } },
    (args) => call(campaigns.POST, { method: "POST", body: args }));
  tool("editar_campana", { description: "Cambia nombre, brief o marca de una campaña.", input: { id: campaignId, name: z.string().min(1).max(160).optional(), brief: brief.optional(), brandKitId: z.string().min(1).nullable().optional() } },
    ({ id: campaign, ...patch }) => call(campaignItem.PATCH, { method: "PATCH", params: { id: campaign }, body: patch }));
  tool("duplicar_campana", { description: "Duplica una campaña (sin su contenido).", input: { id: campaignId, name: z.string().optional(), keepBrand: z.boolean().default(true) } },
    ({ id: campaign, ...options }) => call(campaignDuplicate.POST, { method: "POST", params: { id: campaign }, body: options }));

  /* --------------------------------- Biblioteca --------------------------------- */

  tool("listar_contenido", {
    description: "Lista piezas de la biblioteca (carruseles, anuncios, videos, artículos) con ID, título, campaña y revisión. Para el documento completo usa obtener_contenido.",
    input: { type: z.enum(["carousel", "ad", "video", "article"]).optional(), campaignId: z.string().optional(), q: z.string().max(200).optional().describe("Texto a buscar"), status: z.enum(["active", "archived", "all"]).default("active") },
    readOnly: true,
  }, async (query) => {
    const items = await call(contentItems.GET, { query }) as { id: string; type: string; revision: number; campaignId: string; campaignName: string; updatedAt: string; archivedAt: string | null; document: { data?: { title?: unknown; headline?: unknown; topic?: unknown } } }[];
    return items.map((item) => ({ id: item.id, type: item.type, title: contentTitle(item), campaignId: item.campaignId, campaignName: item.campaignName, revision: item.revision, updatedAt: item.updatedAt, archived: Boolean(item.archivedAt) }));
  });
  tool("obtener_contenido", { description: "Documento completo de una pieza, con su revisión (necesaria para editarla).", input: { id: id("la pieza") }, readOnly: true }, ({ id: item }) => getContent(item));
  tool("editar_contenido", {
    description: "Reemplaza el documento de una pieza (por ejemplo, para corregir textos de un carrusel). Lee antes la pieza con obtener_contenido, modifica `document` y envía la misma `revision`; si alguien la cambió entretanto, falla y hay que volver a leer.",
    input: { id: id("la pieza"), revision: z.number().int().nonnegative(), document: z.record(z.string(), z.unknown()).describe("El `document.data` completo, ya modificado"), campaignId: z.string().optional().describe("Para moverla a otra campaña") },
  }, ({ id: item, revision, document, campaignId: target }) => call(contentItem.PATCH, { method: "PATCH", params: { id: item }, body: { revision, ...(target ? { campaignId: target } : {}), document: { schemaVersion: 1, data: document } } }));
  tool("duplicar_contenido", { description: "Duplica una pieza dentro de su campaña.", input: { id: id("la pieza") } }, ({ id: item }) => call(contentDuplicate.POST, { method: "POST", params: { id: item } }));
  tool("listar_assets", { description: "Imágenes, audios y videos de una campaña (los 100 más recientes). Su URL es /api/assets/{id}.", input: { campaignId, kind: z.enum(["all", "image", "audio", "video"]).default("all") }, readOnly: true },
    (query) => call(assets.GET, { query }));

  tool("ver_asset", {
    description: "Muestra una imagen guardada (slide de carrusel IA, imagen de escena, fondo de anuncio…) para revisarla. Para audio y video devuelve solo sus datos.",
    input: { id: id("el asset (ver listar_assets u obtener_contenido)") },
    readOnly: true,
  }, async ({ id: assetId }) => {
    const asset = await readAsset(assetId);
    if (!asset) throw new ToolError("Ese asset no existe.");
    const result = { id: assetId, mimeType: asset.mimeType, sizeBytes: asset.bytes.length, url: new URL(`/api/assets/${assetId}`, origin).href };
    // Más de ~4 MB en base64 revienta el contexto de muchos clientes; para revisar basta con menos.
    return asset.mimeType.startsWith("image/") && asset.bytes.length <= 4_000_000 ? new WithImage(result, asset.bytes, asset.mimeType) : result;
  });
  tool("subir_asset", {
    description: "Guarda en una campaña una imagen, audio o video (PNG, JPG, WebP, MP3, WAV o MP4) desde una URL pública o en base64, p. ej. un logo o una foto que te pasaron. Devuelve su ID y URL para usarla con editar_contenido.",
    input: {
      campaignId,
      url: z.string().url().max(2000).optional().describe("URL pública http(s) del archivo"),
      base64: z.string().max(14_000_000).optional().describe("Contenido en base64 (máx. ~10 MB), alternativa a url"),
      mimeType: z.enum(Object.keys(assetExtensions) as [string, ...string[]]).optional().describe("Obligatorio con base64"),
      filename: z.string().min(1).max(120).optional(),
      contentItemId: z.string().optional().describe("Pieza a la que pertenece, si aplica"),
    },
  }, async ({ campaignId: campaign, url, base64, mimeType, filename, contentItemId }) => {
    if (Boolean(url) === Boolean(base64)) throw new ToolError("Pasa url o base64, uno de los dos.");
    const file = url ? await downloadPublicFile(url) : { bytes: Buffer.from(base64 ?? "", "base64"), contentType: mimeType ?? "", filename: filename ?? "archivo" };
    const type = (mimeType ?? file.contentType).split(";")[0].trim().replace("image/jpg", "image/jpeg");
    if (!assetExtensions[type]) throw new ToolError(`Tipo no admitido (${type || "desconocido"}). Admitidos: ${Object.keys(assetExtensions).join(", ")}.`);
    // Lo mismo que exige la subida desde la app: que los bytes sean de verdad lo que dicen ser.
    try { assertAssetSignature(file.bytes, type); } catch { throw new ToolError(`El contenido no es un ${type} válido.`); }
    const asset = await storeAsset({ bytes: file.bytes, mimeType: type, filename: filename ?? file.filename, campaignId: campaign, contentItemId: contentItemId ?? null }) as { id: string };
    return { id: asset.id, mimeType: type, sizeBytes: file.bytes.length, url: `/api/assets/${asset.id}` };
  });
  tool("textos_campana", {
    description: "Lo listo para publicar de una campaña: el caption y los hashtags de cada pieza y la URL del último render terminado de cada video.",
    input: { campaignId },
    readOnly: true,
  }, async ({ campaignId: campaign }) => {
    const [items, jobs] = await Promise.all([
      call(contentItems.GET, { query: { campaignId: campaign } }) as Promise<{ id: string; type: "carousel" | "ad" | "video" | "article"; document: { data: unknown } }[]>,
      call(renderJobs.GET) as Promise<{ contentItemId: string; status: string; outputAssetId: string | null; completedAt: string | null }[]>,
    ]);
    return items.filter((item) => item.type !== "article").map((item) => {
      const render = jobs.filter((job) => job.contentItemId === item.id && job.status === "completed" && job.outputAssetId)
        .sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)))[0];
      // campaignCaptions antepone una etiqueta [tipo-id] pensada para el .txt del ZIP; aquí sobra.
      const text = campaignCaptions([{ id: item.id, type: item.type as "carousel" | "ad" | "video", document: item.document.data }]).split("\n").slice(1).join("\n").trim();
      return { id: item.id, type: item.type, title: contentTitle(item as never), texto: text || null, video: render ? new URL(`/api/assets/${render.outputAssetId}`, origin).href : null };
    });
  });

  /* --------------------------------- Carruseles --------------------------------- */

  tool("crear_carrusel", {
    description: "Genera un carrusel editable (layouts con texto) sobre un tema y lo guarda como borrador en la biblioteca. Unos $0.02, más fotos si se piden." + spendNote,
    input: {
      campaignId, topic: z.string().min(3).max(240), slideCount: z.number().int().min(3).max(20).default(6),
      imageSource: z.enum(["none", "unsplash", "openai", "illustration"]).default("none").describe("Fotos para los layouts que las llevan"),
      context: z.string().max(10000).optional().describe("Datos y fuentes que el guion debe respetar"),
      audience: z.string().optional(), tone: z.string().optional(), brandKitId,
    },
    spends: true,
  }, async (args) => {
    const { document, missingPhotos } = await call(carouselGenerate.POST, { method: "POST", body: args }) as { document: { topic: string }; missingPhotos: number };
    const saved = await saveContent(args.campaignId, "carousel", document);
    return { contentItemId: saved.id, title: document.topic, missingPhotos, abrir: `/carousel?id=${saved.id}` };
  });
  tool("crear_carrusel_imagenes_ia", {
    description: "Genera un carrusel donde cada slide es una imagen dibujada entera por IA (texto incluido, con la marca) y lo guarda como borrador. Nano Banana ~$0.07/slide, GPT Image ~$0.17/slide. Tarda 1-2 minutos." + spendNote,
    input: { campaignId, topic: z.string().min(3).max(500), slides: z.number().int().min(2).max(10).default(6), provider: z.enum(["gemini", "openai"]).default("gemini"), brandKitId },
    spends: true,
  }, async ({ campaignId: campaign, ...input }) => {
    const prepared = await prepareAiCarousel(input, campaign);
    const drawn = await drawAiCarousel(prepared.input, prepared.brand, { campaignId: campaign });
    const saved = await saveContent(campaign, "carousel", imagesToDocument(input.topic.slice(0, 240), drawn.slides));
    const failed = drawn.slides.filter((slide) => slide.error).length;
    return { contentItemId: saved.id, slides: drawn.slides.length - failed, failedSlides: failed, abrir: `/carousel?id=${saved.id}` };
  });
  tool("remix_carrusel", {
    description: "Toma un artículo o página web (URL) y lo convierte en un carrusel editable guardado como borrador." + spendNote,
    input: { campaignId, url: z.string().url(), slideCount: z.number().int().min(3).max(20).default(6), audience: z.string().optional(), tone: z.string().optional() },
    spends: true,
  }, async ({ campaignId: campaign, ...input }) => {
    const { document } = await call(carouselRemix.POST, { method: "POST", body: input }) as { document: { topic: string } };
    const saved = await saveContent(campaign, "carousel", document);
    return { contentItemId: saved.id, title: document.topic, abrir: `/carousel?id=${saved.id}` };
  });
  tool("modificar_slides_carrusel", {
    description: "Regenera una slide de un carrusel guardado (action=regenerate, con su índice desde 0) o añade una slide de contenido antes del CTA (action=add), y guarda el cambio." + spendNote,
    input: { contentItemId: id("el carrusel"), action: z.enum(["regenerate", "add"]), index: z.number().int().nonnegative().optional(), brandKitId },
    spends: true,
  }, async ({ contentItemId, ...input }) => {
    const current = await getContent(contentItemId);
    if (current.type !== "carousel") throw new ToolError("Esa pieza no es un carrusel.");
    const { document } = await call(carouselSlides.POST, { method: "POST", body: { ...input, document: current.document.data } }) as { document: unknown };
    const saved = await call(contentItem.PATCH, { method: "PATCH", params: { id: contentItemId }, body: { revision: current.revision, document: { schemaVersion: 1, data: { ...current.document.data, ...(document as object) } } } }) as { revision: number };
    return { contentItemId, revision: saved.revision };
  });
  tool("generar_imagen", {
    description: "Genera o busca una imagen (OpenAI, Unsplash o ilustración en el color dado) y la guarda como asset. Devuelve su URL para usarla en un slide con editar_contenido." + spendNote,
    input: { source: z.enum(["openai", "unsplash", "illustration"]), prompt: z.string().min(3).max(500), campaignId: z.string().optional(), color: z.string().max(60).optional() },
    spends: true,
  }, (args) => call(carouselImage.POST, { method: "POST", body: args }));

  /* --------------------------------- Anuncios --------------------------------- */

  tool("crear_anuncio", {
    description: "Genera un anuncio estático (titular, texto, CTA) y lo guarda como borrador." + spendNote,
    input: {
      campaignId, topic: z.string().min(3).max(240), format: z.enum(["story", "square", "landscape"]).default("square"),
      layout: z.enum(["comparison", "promo", "feature", "testimonial", "painSolution"]).default("promo"),
      audience: z.string().optional(), tone: z.string().optional(), context: z.string().max(10000).optional(), brandKitId,
    },
    spends: true,
  }, async (args) => {
    const { document } = await call(adGenerate.POST, { method: "POST", body: args }) as { document: { headline?: string } };
    const saved = await saveContent(args.campaignId, "ad", document);
    return { contentItemId: saved.id, headline: document.headline, abrir: `/ads?id=${saved.id}` };
  });
  tool("generar_imagen_anuncio", {
    description: "Dibuja con IA la imagen de un anuncio guardado (image) o solo su fondo (background, con descripción opcional) y guarda el cambio." + spendNote,
    input: { contentItemId: id("el anuncio"), mode: z.enum(["image", "background"]).default("image"), provider: z.enum(["openai", "gemini"]).default("gemini").describe("Solo para background"), description: z.string().max(500).optional(), brandKitId },
    spends: true,
  }, async ({ contentItemId, mode, ...input }) => {
    const current = await getContent(contentItemId);
    if (current.type !== "ad") throw new ToolError("Esa pieza no es un anuncio.");
    const body = { ...input, document: current.document.data, campaignId: current.campaignId };
    const result = await call(mode === "background" ? adBackground.POST : adImage.POST, { method: "POST", body }) as { document?: unknown };
    if (!result.document) return result;
    const saved = await call(contentItem.PATCH, { method: "PATCH", params: { id: contentItemId }, body: { revision: current.revision, document: { schemaVersion: 1, data: result.document } } }) as { revision: number };
    return { contentItemId, revision: saved.revision };
  });

  /* --------------------------------- Artículos --------------------------------- */

  tool("crear_articulo", {
    description: "Redacta un artículo de blog (opcionalmente investigando en la web con fuentes citadas) y lo guarda como borrador. Puede tardar un par de minutos con búsqueda web." + spendNote,
    input: { campaignId, prompt: z.string().min(10).max(4000).describe("El encargo del artículo"), words: z.number().int().min(300).max(3000).default(1200), webSearch: z.boolean().default(true), category: z.string().max(80).optional(), audience: z.string().optional(), tone: z.string().optional() },
    spends: true,
  }, async ({ campaignId: campaign, ...input }) => {
    const { article, sources } = await call(articleGenerate.POST, { method: "POST", body: input }) as { article: { title: string; slug: string }; sources?: unknown[] };
    const saved = await saveContent(campaign, "article", article);
    return { contentItemId: saved.id, title: article.title, slug: article.slug, sources: sources?.length ?? 0, abrir: "/articles" };
  });
  tool("exportar_articulo_blog", {
    description: "Escribe el artículo (.md y portada) en el repositorio local del sitio. No hace commit ni publica: el commit lo hace una persona.",
    input: { contentItemId: id("el artículo"), overwrite: z.boolean().default(false) },
  }, ({ contentItemId, overwrite }) => call(blogExport.POST, { method: "POST", params: { id: contentItemId }, body: { overwrite } }));

  /* ----------------------------------- Video ----------------------------------- */

  tool("crear_video", {
    description: "Escribe el guion de un video por escenas y lo guarda como borrador. Plantillas: standard (imágenes), timeline o explainer (educativo con animaciones). Luego: imágenes/animaciones, voz y render." + spendNote,
    input: { campaignId, topic: z.string().min(3).max(240), templateId: z.enum(["standard", "timeline", "explainer"]).default("standard"), targetDurationSeconds: z.number().int().min(15).max(180).default(45), context: z.string().max(12000).optional(), webSearch: z.boolean().default(true), audience: z.string().optional(), tone: z.string().optional() },
    spends: true,
  }, async (args) => {
    const { document } = await call(videoGenerate.POST, { method: "POST", body: args }) as { document: { title?: string; scenes: { id: string }[] } };
    const saved = await saveContent(args.campaignId, "video", document);
    return { contentItemId: saved.id, title: document.title, scenes: document.scenes.map((scene) => scene.id), abrir: args.templateId === "explainer" ? `/explainer?id=${saved.id}` : `/video?id=${saved.id}` };
  });
  tool("generar_video_completo", {
    description: "Genera un video de principio a fin: guion, imágenes (standard/timeline) o animaciones (explainer), narración si se pasa voiceId, caption y render automático con el motor elegido (engine). Con engine=canvas no genera imágenes ni animaciones HTML: genera el plan de Canvas y renderiza a 60 fps. Guarda un borrador y devuelve contentItemId y renderJob; el MP4 aún no está listo: consultar listar_renders hasta completed y abrir el outputAssetId con ver_asset. Si falla, devuelve el borrador y failedStep para continuar con las herramientas por escena, sin volver a crear ni gastar todo. Puede tardar varios minutos. No publica." + spendNote,
    input: {
      campaignId, topic: z.string().trim().min(3).max(240),
      templateId: z.enum(["standard", "timeline", "explainer"]).default("standard"),
      targetDurationSeconds: z.number().int().min(15).max(180).default(45),
      context: z.string().max(12000).optional(), webSearch: z.boolean().default(true),
      audience: z.string().max(160).optional(), tone: z.string().max(120).optional(),
      language: z.string().min(2).max(40).optional(),
      imageSource: z.enum(["none", "unsplash", "openai"]).default("unsplash").describe("Para standard/timeline; explainer siempre genera animaciones"),
      voiceId: z.string().min(8).max(64).optional().describe("Voz de listar_voces; si se omite, video sin narración"),
      modelId: z.string().min(3).max(80).default("eleven_multilingual_v2"),
      engine: z.enum(["remotion", "hyperframes", "canvas"]).optional().describe("Motor de render. Por defecto Remotion (standard/timeline) o HyperFrames (explainer); canvas = plantillas animadas a 60 fps sincronizadas con la voz"),
    },
    spends: true,
  }, async ({ imageSource, voiceId, modelId, engine, ...args }) => {
    const result = await runVideoPipeline({ topic: args.topic, imageSource, voiceId, modelId, engine }, {
      create: async () => {
        const generated = await call(videoGenerate.POST, { method: "POST", body: args }) as { document: unknown };
        const document = videoDocumentSchema.parse(generated.document);
        return (await saveContent(args.campaignId, "video", document)).id;
      },
      read: async (item) => {
        const current = await getContent(item);
        return { type: current.type, revision: current.revision, document: videoDocumentSchema.parse(current.document.data) };
      },
      image: (item, sceneId, prompt, source, revision) => call(sceneImage.POST, { method: "POST", params: { id: item, sceneId }, body: { prompt, source, revision } }),
      animation: (item, sceneId) => call(sceneAnimation.POST, { method: "POST", params: { id: item, sceneId }, body: {} }),
      voiceover: (item, revision) => call(voiceoverScript.POST, { method: "POST", params: { id: item }, body: { action: "generate", revision } }),
      audio: (item, sceneId, voiceId, modelId, revision) => call(sceneAudio.POST, { method: "POST", params: { id: item, sceneId }, body: { voiceId, modelId, revision } }),
      caption: (item, revision) => call(videoCaption.POST, { method: "POST", params: { id: item }, body: { action: "generate", revision } }),
      canvasPlan: (item) => call(canvasPlan.POST, { method: "POST", params: { id: item }, body: {} }),
      render: async (item, chosen) => {
        const job = await call(renderJobs.POST, { method: "POST", body: { contentItemId: item, ...(chosen === "hyperframes" || chosen === "canvas" ? { engine: chosen } : {}) } }) as { id: string; status: string };
        const jobs = await call(renderJobs.GET, { query: { contentItemId: item } }) as { id: string; status: string }[];
        const saved = jobs.find((candidate) => candidate.id === job.id);
        if (!saved) throw new ToolError(`No se pudo verificar el render ${job.id}. Consulta listar_renders antes de reintentarlo.`);
        return saved;
      },
    });
    return { ...result, abrir: args.templateId === "explainer" ? `/explainer?id=${result.contentItemId}` : `/video?id=${result.contentItemId}`, narracion: Boolean(voiceId), motor: engine ?? (args.templateId === "explainer" ? "hyperframes" : "remotion") };
  });
  const withRevision = async (contentItemId: string) => {
    const current = await getContent(contentItemId);
    if (current.type !== "video") throw new ToolError("Esa pieza no es un video.");
    return current.revision;
  };
  tool("generar_imagen_escena", {
    description: "Pone una imagen (OpenAI o Unsplash) en una escena de un video guardado." + spendNote,
    input: { contentItemId: id("el video"), sceneId: id("la escena"), source: z.enum(["openai", "unsplash"]), prompt: z.string().min(3).max(1500) },
    spends: true,
  }, async ({ contentItemId, sceneId, ...input }) => call(sceneImage.POST, { method: "POST", params: { id: contentItemId, sceneId }, body: { ...input, revision: await withRevision(contentItemId) } }));
  tool("generar_animacion_escena", {
    description: "Genera (o corrige con feedback) la animación HTML de una escena de un video educativo." + spendNote,
    input: { contentItemId: id("el video"), sceneId: id("la escena"), feedback: z.string().max(2000).optional() },
    spends: true,
  }, ({ contentItemId, sceneId, feedback }) => call(sceneAnimation.POST, { method: "POST", params: { id: contentItemId, sceneId }, body: feedback ? { feedback } : {} }));
  tool("generar_plan_canvas", {
    description: "Genera (o corrige con feedback) el plan del motor Canvas de todas las escenas de un video: plantilla animada, datos y momentos anclados a palabras de la narración. Hazlo antes de renderizar_video con engine=canvas; sin plan, Canvas solo muestra el título de cada escena." + spendNote,
    input: { contentItemId: id("el video"), feedback: z.string().max(2000).optional() },
    spends: true,
  }, ({ contentItemId, feedback }) => call(canvasPlan.POST, { method: "POST", params: { id: contentItemId }, body: feedback ? { feedback } : {} }));
  tool("generar_guion_voz", { description: "Escribe el texto del narrador de cada escena de un video guardado." + spendNote, input: { contentItemId: id("el video") }, spends: true },
    async ({ contentItemId }) => call(voiceoverScript.POST, { method: "POST", params: { id: contentItemId }, body: { action: "generate", revision: await withRevision(contentItemId) } }));
  tool("listar_voces", { description: "Voces de ElevenLabs disponibles para la narración.", input: {}, readOnly: true }, () => call(voices.GET));
  tool("generar_audio_escena", {
    description: "Genera con ElevenLabs la locución de una escena (requiere su texto de narrador)." + spendNote,
    input: { contentItemId: id("el video"), sceneId: id("la escena"), voiceId: z.string().min(8).max(64).describe("Ver listar_voces"), modelId: z.string().default("eleven_multilingual_v2") },
    spends: true,
  }, async ({ contentItemId, sceneId, ...input }) => call(sceneAudio.POST, { method: "POST", params: { id: contentItemId, sceneId }, body: { ...input, revision: await withRevision(contentItemId) } }));
  tool("generar_caption_video", { description: "Escribe el caption y hashtags de un video guardado." + spendNote, input: { contentItemId: id("el video") }, spends: true },
    async ({ contentItemId }) => call(videoCaption.POST, { method: "POST", params: { id: contentItemId }, body: { action: "generate", revision: await withRevision(contentItemId) } }));
  tool("renderizar_video", {
    description: "Encola el render del video con el motor elegido: remotion (por defecto en standard/timeline), hyperframes (por defecto en los educativos) o canvas (plantillas animadas a 60 fps; antes usa generar_plan_canvas). Devuelve el trabajo; consulta su avance con listar_renders.",
    input: { contentItemId: id("el video"), engine: z.enum(["remotion", "hyperframes", "canvas"]).optional() },
  }, ({ contentItemId, engine }) => call(renderJobs.POST, { method: "POST", body: { contentItemId, ...(engine === "hyperframes" || engine === "canvas" ? { engine } : {}) } }));
  tool("listar_renders", { description: "Trabajos de render con estado, progreso y el asset de salida cuando terminan.", input: { contentItemId: z.string().optional() }, readOnly: true },
    (query) => call(renderJobs.GET, { query }));
  tool("gestionar_render", { description: "Cancela un render en curso o reintenta uno fallido.", input: { id: id("el trabajo de render"), action: z.enum(["cancel", "retry"]) } },
    ({ id: job, action }) => call(renderJobItem.PATCH, { method: "PATCH", params: { id: job }, body: { action } }));

  /* --------------------------------- Cronograma --------------------------------- */

  tool("ver_calendario", { description: "Calendario de un mes: huecos de las pautas, qué pieza tiene cada uno y resumen.", input: { month: month.optional(), campaignId: z.string().optional() }, readOnly: true },
    (query) => call(schedule.GET, { query }));
  tool("listar_pautas", { description: "Pautas de publicación (días y horas por plataforma).", input: { campaignId: z.string().optional() }, readOnly: true }, (query) => call(rules.GET, { query }));
  const ruleFields = { name: z.string().min(1).max(120), platform, weekdays: z.array(z.number().int().min(0).max(6)).min(1).describe("0=domingo … 6=sábado"), times: z.array(clock).min(1).max(6), startDate: date, endDate: date.nullable().optional(), campaignId: z.string().nullable().optional(), active: z.boolean().optional() };
  tool("crear_pauta", { description: "Crea una pauta de publicación, p. ej. Instagram lunes, miércoles y viernes a las 19:00.", input: ruleFields },
    (args) => call(rules.POST, { method: "POST", body: args }));
  tool("editar_pauta", { description: "Cambia una pauta (días, horas, fechas, activa o pausada).", input: { id: id("la pauta"), ...Object.fromEntries(Object.entries(ruleFields).map(([key, schema]) => [key, schema.optional()])) } },
    ({ id: rule, ...patch }) => call(ruleItem.PATCH, { method: "PATCH", params: { id: rule }, body: patch }));
  tool("listar_publicaciones", {
    description: "Piezas planificadas en un rango de fechas. Con contentItemId dice en qué fechas está programada una pieza de la biblioteca.",
    input: { startDate: date.optional(), endDate: date.optional(), campaignId: z.string().optional(), contentItemId: z.string().optional().describe("ID de la pieza (ver listar_contenido)") },
    readOnly: true,
  }, (query) => call(posts.GET, { query }));
  // Las horas son de reloj, sin zona: las del estudio (por defecto America/Guayaquil, UTC-5).
  const postFields = {
    platform, date, time: clock.describe("Hora HH:MM, 24 h, en la zona horaria del estudio (UTC-5 por defecto)"),
    contentItemId: z.string().nullable().optional().describe("Pieza de la biblioteca (ver listar_contenido). Opcional: sin ella el hueco queda reservado; null la desvincula"),
    campaignId: z.string().nullable().optional(), title: z.string().max(200).optional(), notes: z.string().max(2000).optional(), status: z.enum(["planificada", "lista", "publicada", "omitida"]).optional(),
  };
  tool("planificar_publicacion", { description: "Programa en el calendario una pieza de la biblioteca (o un hueco sin pieza) en un día, hora y plataforma. Un hueco por plataforma, día y hora. No publica nada.", input: postFields },
    (args) => call(posts.POST, { method: "POST", body: args }));
  tool("editar_publicacion", { description: "Cambia una publicación planificada: pieza, fecha, hora, notas o estado (p. ej. marcarla como lista). contentItemId=null desvincula la pieza y deja el hueco reservado.", input: { id: id("la publicación"), ...Object.fromEntries(Object.entries(postFields).map(([key, schema]) => [key, schema.optional()])) } },
    ({ id: post, ...patch }) => call(postItem.PATCH, { method: "PATCH", params: { id: post }, body: patch }));
  tool("quitar_publicacion", { description: "Quita una publicación del calendario (desprograma la pieza). La pieza sigue en la biblioteca y, si el hueco venía de una pauta, vuelve a quedar libre.", input: { id: id("la publicación (ver listar_publicaciones)") }, destructive: true },
    ({ id: post }) => call(postItem.DELETE, { method: "DELETE", params: { id: post } }));

  /* ------------------------------- Automatizaciones ------------------------------- */

  tool("listar_automatizaciones", { description: "Automatizaciones de carruseles (las del radar están en listar_automatizaciones_radar) con su próximo hueco libre, temas pendientes y última ejecución.", input: {}, readOnly: true }, () => call(automations.GET));
  const automationFields = {
    name: z.string().min(1).max(120), ruleId: id("la pauta que rellena"), campaignId, brandKitId: z.string().nullable().optional(),
    kind: z.enum(["editable", "images"]), slides: z.number().int().min(3).max(10).optional(),
    imageSource: z.enum(["none", "unsplash", "openai", "illustration"]).optional().describe("Solo para editable"), provider: z.enum(["gemini", "openai"]).optional().describe("Solo para images"),
    topics: z.array(z.string().min(3).max(240)).max(200).optional().describe("Se usan en orden"), radarVertical: z.string().nullable().optional().describe("Vertical del radar cuando se acaba la lista"),
    daysAhead: z.number().int().min(1).max(30).optional(), active: z.boolean().optional(),
  };
  tool("crear_automatizacion", { description: "Crea una automatización que rellena los huecos libres de una pauta con carruseles en borrador (cada 15 min, uno por pasada). Nunca publica.", input: automationFields },
    (args) => call(automations.POST, { method: "POST", body: args }));
  tool("editar_automatizacion", { description: "Cambia una automatización: temas, tipo, pausarla (active=false) o reanudarla.", input: { id: id("la automatización"), ...Object.fromEntries(Object.entries(automationFields).map(([key, schema]) => [key, schema.optional()])) } },
    ({ id: automation, ...patch }) => call(automationItem.PATCH, { method: "PATCH", params: { id: automation }, body: patch }));
  tool("ejecutar_automatizacion", { description: "Ejecuta ya una automatización: genera un carrusel para su siguiente hueco libre." + spendNote, input: { id: id("la automatización") }, spends: true },
    ({ id: automation }) => call(automationRun.POST, { method: "POST", params: { id: automation } }));
  tool("historial_automatizacion", { description: "Últimas ejecuciones de una automatización (de carruseles o del radar): estado, mensaje, costo y lo que generó.", input: { id: id("la automatización") }, readOnly: true },
    ({ id: automation }) => call(automationRuns.GET, { query: { automationId: automation } }));

  /*
   * Búsquedas programadas del radar («Automatizar radar» en Automatizaciones). Pasan por las mismas
   * rutas que la pantalla, así que lo que se crea aquí aparece allí tal cual, con su historial.
   */
  tool("listar_automatizaciones_radar", { description: "Búsquedas del radar programadas (diarias, semanales o mensuales): verticales, ajustes de búsqueda, próxima ejecución y la última.", input: {}, readOnly: true },
    async () => (await call(radarAutomations.GET) as RadarAutomationRow[]).map(radarAutomationSummary));
  const radarScanFields = {
    verticals: z.array(z.string().min(1)).min(1).max(20).describe("Verticales a buscar (ver listar_verticales_radar)"),
    focus: z.string().max(300).nullable().optional().describe("Tema concreto dentro de los verticales; vacío es el barrido normal"),
    maxTopics: z.number().int().min(1).max(30).optional().describe("Tope de temas (10 por defecto)"),
    maxSearches: z.number().int().min(1).max(30).optional().describe("Tope de búsquedas por vertical: la palanca de costo (3 en la app)"),
    windowDays: z.number().int().min(1).max(90).optional().describe("Antigüedad máxima de los hechos, en días (7 por defecto)"),
    minSources: z.number().int().min(1).max(5).optional().describe("Fuentes independientes exigidas por tema (2 por defecto)"),
    searchContextSize: z.enum(["low", "medium", "high"]).optional().describe("Cuánto contenido de cada resultado entra; low es lo barato"),
    verifySources: z.boolean().optional(),
  };
  const radarScheduleFields = {
    name: z.string().min(1).max(120),
    frequency: z.enum(["day", "week", "month"]),
    time: clock.describe("Hora HH:MM, 24 h, en UTC (la app la muestra así)"),
    weekday: z.number().int().min(0).max(6).optional().describe("Solo semanal: 0=domingo … 6=sábado (lunes por defecto)"),
    monthDay: z.number().int().min(1).max(31).optional().describe("Solo mensual: si el mes no tiene ese día, usa el último"),
    active: z.boolean().optional().describe("Si se omite al crear, queda pausada"),
  };
  tool("crear_automatizacion_radar", {
    description: "Programa una búsqueda del radar que se lanza sola (diaria, semanal o mensual) y guarda los temas en el radar. Aparece en Automatizaciones. Cada ejecución gasta créditos de IA, con el tope de presupuesto de las automáticas.",
    input: { ...radarScheduleFields, ...radarScanFields },
  }, ({ name, frequency, time, weekday, monthDay, active, ...scan }) =>
    call(radarAutomations.POST, { method: "POST", body: { name, frequency, time, weekday, monthDay, active, scan: { maxSearches: 3, ...scan } } }));
  tool("editar_automatizacion_radar", {
    description: "Cambia una búsqueda programada del radar: horario, verticales, ajustes, o pausarla (active=false) y reanudarla. Solo cambia lo que se pasa.",
    input: { id: id("la búsqueda programada (ver listar_automatizaciones_radar)"), ...Object.fromEntries(Object.entries({ ...radarScheduleFields, ...radarScanFields }).map(([key, schema]) => [key, schema.optional()])) },
  }, async ({ id: automation, ...fields }) => {
    const scanKeys = Object.keys(radarScanFields);
    const scanPatch = Object.fromEntries(Object.entries(fields).filter(([key, value]) => scanKeys.includes(key) && value !== undefined));
    const patch: Record<string, unknown> = Object.fromEntries(Object.entries(fields).filter(([key, value]) => !scanKeys.includes(key) && value !== undefined));
    // La ruta reemplaza `scan` entero: se mezcla con el actual para no perder los ajustes que no se tocan.
    if (Object.keys(scanPatch).length) {
      const current = (await call(radarAutomations.GET) as RadarAutomationRow[]).find((row) => row.id === automation);
      if (!current) throw new ToolError("La búsqueda programada no existe.");
      patch.scan = { ...current.scan, ...scanPatch };
    }
    return radarAutomationSummary(await call(radarAutomationItem.PATCH, { method: "PATCH", params: { id: automation }, body: patch }) as RadarAutomationRow);
  });
  tool("ejecutar_automatizacion_radar", { description: "Lanza ya una búsqueda programada del radar sin esperar a su hora (1-4 min). Queda en su historial de Automatizaciones." + spendNote, input: { id: id("la búsqueda programada") }, spends: true },
    ({ id: automation }) => call(radarAutomationRun.POST, { method: "POST", params: { id: automation } }));
  tool("eliminar_automatizacion_radar", { description: "Borra una búsqueda programada del radar. Los temas que ya encontró siguen en el radar. Para solo detenerla, usa editar_automatizacion_radar con active=false.", input: { id: id("la búsqueda programada") }, destructive: true },
    ({ id: automation }) => call(radarAutomationItem.DELETE, { method: "DELETE", params: { id: automation } }));

  /* ----------------------------------- Radar ----------------------------------- */

  tool("ver_radar", {
    description: "Temas que encontró el radar, con puntuación, vertical, evidencia y estado; más contadores, verticales y gasto del mes.",
    input: { status: z.enum(["nuevo", "guardado", "descartado", "usado"]).optional(), vertical: z.string().optional(), sort: z.enum(["score", "recent", "oldest"]).default("score"), limit: z.number().int().min(1).max(100).default(20) },
    readOnly: true,
  }, async (query) => {
    const result = await call(radar.GET, { query }) as Record<string, unknown> & { runs: { id: string; status: string; startedAt: string; verticals: string[]; focus: string | null }[] };
    // Sin las notas de investigación de cada corrida: pesan mucho y solo sirven para reinterpretar.
    const runs = result.runs.slice(0, 5).map(({ id: run, status, startedAt, verticals, focus }) => ({ id: run, status, startedAt, verticals, focus }));
    return { topics: result.topics, counts: result.counts, verticals: result.verticals, spend: result.spend, runs };
  });
  tool("obtener_tema_radar", { description: "Detalle de un tema del radar y las piezas creadas a partir de él.", input: { id: id("el tema") }, readOnly: true },
    ({ id: topic }) => call(radarTopic.GET, { params: { id: topic } }));
  tool("cambiar_estado_tema", { description: "Marca un tema del radar como guardado, descartado, usado o nuevo.", input: { id: id("el tema"), status: z.enum(["nuevo", "guardado", "descartado", "usado"]) } },
    ({ id: topic, status }) => call(radarTopic.PATCH, { method: "PATCH", params: { id: topic }, body: { status } }));
  tool("lanzar_radar", {
    description: "Lanza una búsqueda del radar en la web (los verticales se buscan a la vez: 1-3 min, 4 como mucho; cancelable con cancelar_radar). Sin verticales, recorre los activos; `focus` dirige la búsqueda a un tema concreto." + spendNote,
    input: { verticals: z.array(z.string()).default([]), focus: z.string().max(300).optional(), windowDays: z.number().int().min(1).max(90).default(7), maxTopics: z.number().int().min(1).max(30).default(10) },
    spends: true,
  }, (args) => call(radarRun.POST, { method: "POST", body: args }));
  tool("cancelar_radar", {
    description: "Cancela la búsqueda del radar en marcha (o la indicada): corta las llamadas en curso para no pagar lo que faltaba y libera el radar. Sin runId cancela la que esté corriendo.",
    input: { runId: z.string().optional() },
  }, async ({ runId }) => {
    const run = runId ?? (await call(radar.GET, { query: { limit: 1 } }) as { runs: { id: string; status: string }[] }).runs.find((item) => item.status === "running")?.id;
    if (!run) throw new ToolError("No hay ninguna búsqueda del radar en marcha.");
    const cancelled = await call(radarCancel.POST, { method: "POST", params: { id: run } }) as { id: string; status: string; error: string | null };
    return { runId: cancelled.id, status: cancelled.status, detalle: cancelled.error };
  });
  tool("reinterpretar_radar", {
    description: "Vuelve a leer las notas de una búsqueda ya pagada del radar con otros ajustes (más temas, otro umbral de fuentes u otro modelo) sin buscar de nuevo. Cuesta céntimos. Sin runId usa la última corrida (ver_radar devuelve las corridas)." + spendNote,
    input: { runId: z.string().optional(), maxTopics: z.number().int().min(1).max(30).default(10), minSources: z.number().int().min(1).max(3).default(2), verifySources: z.boolean().default(true), structuringModel: z.string().optional() },
    spends: true,
  }, async ({ runId, ...settings }) => {
    const run = runId ?? (await call(radar.GET, { query: { limit: 1 } }) as { runs: { id: string }[] }).runs[0]?.id;
    if (!run) throw new ToolError("El radar todavía no tiene búsquedas que reinterpretar.");
    return call(radarRestructure.POST, { method: "POST", params: { id: run }, body: settings });
  });
  tool("listar_verticales_radar", { description: "Verticales que vigila el radar.", input: {}, readOnly: true }, () => call(watchlist.GET));
  const watchFields = { vertical: z.string().min(2).max(80), offering: z.string().min(3).max(600).describe("Qué vende la agencia en este vertical"), audience: z.string().max(200).optional(), brandKitId: z.string().nullable().optional(), active: z.boolean().optional() };
  tool("crear_vertical_radar", { description: "Agrega un vertical a la vigilancia del radar.", input: watchFields }, (args) => call(watchlist.POST, { method: "POST", body: args }));
  tool("editar_vertical_radar", { description: "Cambia un vertical del radar o lo pausa (active=false).", input: { id: id("el vertical"), ...Object.fromEntries(Object.entries(watchFields).map(([key, schema]) => [key, schema.optional()])) } },
    ({ id: entry, ...patch }) => call(watchlistItem.PATCH, { method: "PATCH", params: { id: entry }, body: patch }));

  /* ---------------------------- Costos y métricas ---------------------------- */

  tool("ver_costos", { description: "Gasto de IA del mes por operación, proveedor y pieza.", input: { month: month.optional() }, readOnly: true }, (query) => call(costs.GET, { query }));
  tool("ver_metricas", {
    description: "Métricas de las plataformas conectadas (Search Console, Analytics, TikTok…).",
    input: { platform: z.string().optional(), dimension: z.string().optional(), days: z.number().int().min(1).max(365).optional(), limit: z.number().int().min(1).max(500).optional() },
    readOnly: true,
  }, (query) => call(analytics.GET, { query }));
  tool("sincronizar_metricas", { description: "Trae las métricas recientes de las plataformas conectadas.", input: { days: z.number().int().min(1).max(90).optional() } },
    (args) => call(analyticsSync.POST, { method: "POST", body: args }));

  return server;
}
