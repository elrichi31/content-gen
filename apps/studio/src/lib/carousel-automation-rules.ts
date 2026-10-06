import { carouselDocumentSchema, type CarouselDocument } from "@content-gen/domain/carousel";
import { buildCalendar, todayLocal, type PublishingRule, type ScheduledPost, type Slot } from "@content-gen/domain/schedule";
import { z } from "zod";

/** Reglas de las automatizaciones de carruseles, sin base ni IA: lo que se puede probar solo. */

export class AutomationError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

const topic = z.string().trim().min(3).max(240);

export const automationInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  active: z.boolean().default(true),
  ruleId: z.string().min(1),
  campaignId: z.string().min(1),
  /** Nulo: la marca de la campaña. */
  brandKitId: z.string().min(1).nullable().default(null),
  /** `editable`: layouts que se pueden retocar en el editor. `images`: cada slide dibujada por IA. */
  kind: z.enum(["editable", "images"]),
  slides: z.number().int().min(3).max(10).default(6),
  imageSource: z.enum(["none", "unsplash", "openai", "illustration"]).default("none"),
  provider: z.enum(["gemini", "openai"]).default("gemini"),
  topics: z.array(topic).max(200).default([]),
  /** Vertical del radar del que tirar cuando la lista se acaba. Nulo: solo la lista. */
  radarVertical: z.string().trim().min(1).nullable().default(null),
  /** Compatibilidad con configuraciones anteriores: solo se genera el día de publicación. */
  daysAhead: z.number().int().min(1).max(30).default(1).transform(() => 1),
}).refine((value) => value.topics.length > 0 || value.radarVertical, { message: "Pon temas en la lista o elige un vertical del radar.", path: ["topics"] });

export type Automation = z.infer<typeof automationInputSchema> & {
  id: string;
  /** Temas de la lista ya convertidos en carrusel. */
  usedTopics: string[];
  lastRunAt: string | null;
  lastResult: string | null;
  lastFailed: boolean;
  createdAt: string;
  updatedAt: string;
};

/* ------------------------------ Lógica pura ------------------------------ */

/** Primer hueco libre de hoy, antes de su hora. La antelación antigua se ignora. */
export function nextOpenSlot(rule: PublishingRule, posts: ScheduledPost[], _daysAhead: number, now = new Date()): Slot | null {
  const today = todayLocal(now);
  const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const days = buildCalendar({ rules: [rule], posts, startDate: today, endDate: today });
  return days.flatMap((day) => day.slots).find((slot) =>
    slot.ruleId === rule.id
    && !(slot.date === today && slot.time <= clock)
    // Un hueco reservado a mano sin pieza también vale; uno con pieza o ya decidido, no.
    && (!slot.post || (!slot.post.contentItemId && slot.post.status === "planificada"))) ?? null;
}

/** Siguiente tema de la lista que aún no se usó, en el orden en que se escribieron. */
export function nextListTopic(topics: string[], used: string[]) {
  const done = new Set(used);
  return topics.find((item) => !done.has(item)) ?? null;
}

/** El carrusel dibujado por IA se guarda como carrusel normal: una slide de imagen completa por dibujo. */
export function imagesToDocument(topicTitle: string, slides: { headline: string; body: string; url: string | null }[]): CarouselDocument {
  const drawn = slides.filter((slide) => slide.url);
  if (!drawn.length) throw new AutomationError("No se pudo dibujar ninguna slide.", 502);
  return carouselDocumentSchema.parse({
    schemaVersion: 1,
    topic: topicTitle,
    slides: drawn.map((slide, index) => ({ id: `slide-${index + 1}`, layout: "imageOverlay", layoutVariant: "full", title: slide.headline, content: slide.body, imageUrl: slide.url, imagePosition: "background", backgroundColor: "#000000", textColor: "#ffffff" })),
  });
}
