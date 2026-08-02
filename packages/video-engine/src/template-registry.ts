import {
  DEFAULT_ACCENTS, DEFAULT_TARGET_DURATION, SCENE_KEYS_BY_TEMPLATE, SCENE_KIND_BY_KEY, sceneDurationsFor,
  VIDEO_DEFAULTS, videoDocumentSchema, type VideoDocument, type VideoSceneKey, type VideoTemplateId,
} from "@content-gen/domain/video";
import { StandardVideo } from "./standard-video";
import { TimelineVideo } from "./timeline-video";
import { calculateVideoMetadata, videoDurationInFrames } from "./video-metadata";

// Contenido de arranque con la misma forma que produce el guion: cada escena
// trae los campos que su layout dibuja, para que el editor nunca abra en vacío.
const STARTER_CONTENT: Record<VideoSceneKey, Record<string, unknown>> = {
  intro: { tag: "DESCUBRE", title: "UN SOLO\nFLUJO", subtitle: "carruseles, anuncios y video en un mismo lugar" },
  layers: {
    tag: "CÓMO FUNCIONA",
    terminal: ["> campaña      = un brief", "> carrusel     = mismo contexto", "> video        = mismo contexto", "> biblioteca   = una sola fuente"],
    definition: "Un brief alimenta\ntodos los formatos\nsin repetir trabajo.",
    detail: "Cada pieza queda versionada en la biblioteca central.",
  },
  phase1: { phase: "GUION", timestamp: "PASO UNO", title: "Guion\nEstructurado", narrative: "El brief se convierte en siete escenas listas para editar.", detail: "Siete escenas fijas, como en el proyecto original.", indicator: ["Siete escenas por video", "Duración objetivo configurable"] },
  phase2: { phase: "IMAGEN Y VOZ", timestamp: "PASO DOS", title: "Imagen\ny Narración", narrative: "Cada escena recibe su imagen y su pista de voz.", detail: "El audio ajusta la duración real de la escena.", indicator: ["Una imagen por escena", "Una narración por escena"] },
  phase3: { phase: "RENDER", timestamp: "PASO TRES", title: "Render\nVertical", narrative: "Remotion arma el MP4 vertical con el mismo documento del editor.", detail: "1080x1920 a 30 FPS.", indicator: ["1080 x 1920", "30 FPS"] },
  reality: { tag: "REALIDAD · CONTEXTO", title: "Un documento\npara preview,\nguardado y render", actions: ["Edita el guion escena por escena", "Genera imagen y voz por escena", "Revisa el preview antes de renderizar", "Guarda todo en la campaña"] },
  close: { tag: "CONTENT GEN · CONCLUSIÓN", title: "Todo\nen una\nplataforma", subtitle: "El mismo video de siempre, ahora dentro del studio." },
  event1: { event: "EL ORIGEN", year: "2024", headline: "PRIMEROS\nCARRUSELES", impact: "El flujo de carruseles nace como proyecto aparte." },
  event2: { event: "LA SEGUNDA APP", year: "2025", headline: "VIDEOS\nEN REMOTION", impact: "La generación de video crece en su propio repositorio." },
  event3: { event: "EL PROBLEMA", year: "2026", headline: "DOS FLUJOS\nSEPARADOS", impact: "Cada formato obliga a repetir brief, marca y contexto." },
  event4: { event: "LA UNIFICACIÓN", year: "2026", headline: "UNA SOLA\nPLATAFORMA", impact: "Carrusel, anuncio y video comparten campaña y biblioteca." },
  today: { tag: "ACTUALIDAD · HOY", title: "Un brief,\ntodos los formatos", actions: ["Campañas con brief estructurado", "Carruseles y anuncios con la misma marca", "Videos con el motor original", "Biblioteca única de piezas y assets"] },
};

function starterDocument(templateId: VideoTemplateId, title: string, slug: string): VideoDocument {
  const durations = sceneDurationsFor(templateId, DEFAULT_TARGET_DURATION);
  return videoDocumentSchema.parse({
    schemaVersion: 1,
    slug,
    templateId,
    title,
    niche: "general",
    hookStyle: "curiosity",
    targetDurationSeconds: DEFAULT_TARGET_DURATION,
    ...VIDEO_DEFAULTS,
    scenes: SCENE_KEYS_BY_TEMPLATE[templateId].map((key) => ({
      id: key,
      kind: SCENE_KIND_BY_KEY[key],
      durationFrames: durations[key] * VIDEO_DEFAULTS.fps,
      accent: [...DEFAULT_ACCENTS[key]],
      content: STARTER_CONTENT[key],
    })),
  });
}

/** Documento en blanco para el editor: misma estructura de siete escenas del legacy. */
export const createVideoDocument = (templateId: VideoTemplateId) =>
  templateId === "timeline"
    ? starterDocument("timeline", "Historia de Content Gen", "historia-content-gen")
    : starterDocument("standard", "Content Gen", "content-gen");

const standardDocument = createVideoDocument("standard");
const timelineDocument = createVideoDocument("timeline");

export const videoTemplates = {
  standard: {
    compositionId: "StandardVideo",
    component: StandardVideo,
    defaultProps: { document: standardDocument },
    durationInFrames: videoDurationInFrames(standardDocument),
    fps: standardDocument.fps,
    width: standardDocument.width,
    height: standardDocument.height,
    calculateMetadata: calculateVideoMetadata,
  },
  timeline: {
    compositionId: "TimelineVideo",
    component: TimelineVideo,
    defaultProps: { document: timelineDocument },
    durationInFrames: videoDurationInFrames(timelineDocument),
    fps: timelineDocument.fps,
    width: timelineDocument.width,
    height: timelineDocument.height,
    calculateMetadata: calculateVideoMetadata,
  },
} as const;

export function getVideoTemplate(id: string) {
  return videoTemplates[id as keyof typeof videoTemplates] ?? null;
}
