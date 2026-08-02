import { z } from "zod";

export const VIDEO_DEFAULTS = { fps: 30, width: 1080, height: 1920 } as const;

// Silencio de respiro tras la narración de cada escena y margen extra por el
// sub-reporte de duración de los MP3. Mismos valores que `video-autom`.
export const SIL_FRAMES = 12;
export const TAIL_FRAMES = 4;

export const VIDEO_NICHES = ["cybersecurity", "ai", "history", "fraud", "news", "general"] as const;
export const HOOK_STYLES = ["shock", "curiosity", "contrarian", "countdown", "real-story"] as const;
export type VideoNiche = (typeof VIDEO_NICHES)[number];
export type HookStyle = (typeof HOOK_STYLES)[number];

export const STANDARD_SCENE_KEYS = ["intro", "layers", "phase1", "phase2", "phase3", "reality", "close"] as const;
export const TIMELINE_SCENE_KEYS = ["intro", "event1", "event2", "event3", "event4", "today", "close"] as const;
export type StandardSceneKey = (typeof STANDARD_SCENE_KEYS)[number];
export type TimelineSceneKey = (typeof TIMELINE_SCENE_KEYS)[number];
export type VideoSceneKey = StandardSceneKey | TimelineSceneKey;

export const SCENE_KEYS_BY_TEMPLATE = { standard: STANDARD_SCENE_KEYS, timeline: TIMELINE_SCENE_KEYS } as const;
export type VideoTemplateId = keyof typeof SCENE_KEYS_BY_TEMPLATE;

// Cada clave de escena tiene un layout fijo; el `kind` es ese layout.
export const SCENE_KIND_BY_KEY = {
  intro: "intro", layers: "layers", phase1: "phase", phase2: "phase", phase3: "phase",
  reality: "reality", close: "close", event1: "event", event2: "event", event3: "event", event4: "event", today: "today",
} as const satisfies Record<VideoSceneKey, string>;

export const SCENE_LABELS = {
  intro: "Introducción", layers: "Explicación", phase1: "Fase 01", phase2: "Fase 02", phase3: "Fase 03",
  reality: "Realidad", close: "Cierre", event1: "Evento 01", event2: "Evento 02", event3: "Evento 03", event4: "Evento 04", today: "Actualidad",
} as const satisfies Record<VideoSceneKey, string>;

export const DEFAULT_ACCENTS = {
  intro: ["#FF4500", "#FFD700"], layers: ["#00FF7F", "#32CD32"], phase1: ["#1E90FF", "#00BFFF"],
  phase2: ["#9400D3", "#9932CC"], phase3: ["#FF6347", "#FF4500"], reality: ["#FFD700", "#FF8C00"],
  close: ["#00FA9A", "#7CFC00"], event1: ["#1E90FF", "#00BFFF"], event2: ["#9400D3", "#9932CC"],
  event3: ["#FF6347", "#FF4500"], event4: ["#FF4500", "#FFD700"], today: ["#FFD700", "#FF8C00"],
} as const satisfies Record<VideoSceneKey, readonly [string, string]>;

export const DEFAULT_TARGET_DURATION = 45;
// Español documental: se mantiene inteligible y humano en torno a 130-145 WPM.
export const WORDS_PER_SECOND = 145 / 60;

// Proporciones derivadas de la estructura original de 41s (standard) y 45s (timeline).
const STANDARD_PROPORTIONS: Record<StandardSceneKey, number> = { intro: 3 / 41, layers: 6 / 41, phase1: 7 / 41, phase2: 7 / 41, phase3: 7 / 41, reality: 7 / 41, close: 4 / 41 };
const TIMELINE_PROPORTIONS: Record<TimelineSceneKey, number> = { intro: 3 / 45, event1: 7 / 45, event2: 7 / 45, event3: 7 / 45, event4: 7 / 45, today: 8 / 45, close: 6 / 45 };

function scaleDurations<K extends string>(proportions: Record<K, number>, totalSeconds: number, remainderKey: K) {
  const result = {} as Record<K, number>;
  let sum = 0;
  for (const key of Object.keys(proportions) as K[]) { result[key] = Math.max(2, Math.round(proportions[key] * totalSeconds)); sum += result[key]; }
  const diff = totalSeconds - sum;
  if (diff !== 0) result[remainderKey] = Math.max(2, result[remainderKey] + diff);
  return result;
}

/** Escala las duraciones de escena proporcionalmente al total objetivo, corrigiendo el redondeo en phase2. */
export const getSceneDurations = (totalSeconds = DEFAULT_TARGET_DURATION) => scaleDurations(STANDARD_PROPORTIONS, totalSeconds, "phase2");
/** Igual que `getSceneDurations`, con el redondeo corregido en today. */
export const getTimelineSceneDurations = (totalSeconds = DEFAULT_TARGET_DURATION) => scaleDurations(TIMELINE_PROPORTIONS, totalSeconds, "today");

export const sceneDurationsFor = (templateId: string, totalSeconds = DEFAULT_TARGET_DURATION): Record<string, number> =>
  templateId === "timeline" ? getTimelineSceneDurations(totalSeconds) : getSceneDurations(totalSeconds);

export const videoSlugSchema = z.string().trim().min(1).max(160)
  .refine((value) => !/[\\/:]/.test(value), "El slug no puede contener una ruta.")
  .transform((value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))
  .pipe(z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).refine((value) => !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(value), "Slug reservado por el sistema."));

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cada accent debe ser un color hexadecimal #RRGGBB.");
export const accentPairSchema = z.tuple([hexColor, hexColor]);
export type AccentPair = z.infer<typeof accentPairSchema>;

const scene = z.object({
  id: videoSlugSchema,
  kind: z.enum(["intro", "layers", "phase", "reality", "close", "event", "today"]),
  durationFrames: z.number().int().positive(),
  accent: accentPairSchema.optional(),
  imageAssetId: z.string().uuid().nullable().optional(),
  audioAssetId: z.string().uuid().nullable().optional(),
  content: z.record(z.string(), z.unknown()),
}).passthrough();

export const videoDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  slug: videoSlugSchema,
  templateId: videoSlugSchema,
  title: z.string().trim().min(1),
  niche: z.enum(VIDEO_NICHES).default("general"),
  hookStyle: z.enum(HOOK_STYLES).default("curiosity"),
  targetDurationSeconds: z.number().int().min(15).max(180).default(DEFAULT_TARGET_DURATION),
  width: z.literal(VIDEO_DEFAULTS.width),
  height: z.literal(VIDEO_DEFAULTS.height),
  fps: z.literal(VIDEO_DEFAULTS.fps),
  scenes: z.array(scene).min(1),
}).passthrough().superRefine((document, context) => {
  if (new Set(document.scenes.map((item) => item.id)).size !== document.scenes.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["scenes"], message: "Los IDs de escena deben ser únicos." });
  const keys = SCENE_KEYS_BY_TEMPLATE[document.templateId as VideoTemplateId] as readonly string[] | undefined;
  if (!keys) return;
  if (document.scenes.length !== keys.length || document.scenes.some((item, index) => item.id !== keys[index])) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["scenes"], message: `La plantilla ${document.templateId} requiere exactamente estas escenas en orden: ${keys.join(", ")}.` });
    return;
  }
  document.scenes.forEach((item, index) => {
    const expected = SCENE_KIND_BY_KEY[keys[index] as VideoSceneKey];
    if (item.kind !== expected) context.addIssue({ code: z.ZodIssueCode.custom, path: ["scenes", index, "kind"], message: `La escena ${keys[index]} debe usar el layout ${expected}.` });
  });
});

export type VideoDocument = z.infer<typeof videoDocumentSchema>;
export type VideoScene = VideoDocument["scenes"][number];

export const sceneAccent = (scene: VideoScene): AccentPair =>
  scene.accent ?? ([...(DEFAULT_ACCENTS[scene.id as VideoSceneKey] ?? DEFAULT_ACCENTS.intro)] as AccentPair);
