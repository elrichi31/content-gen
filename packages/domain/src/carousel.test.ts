import assert from "node:assert/strict";
import { carouselDocumentSchema, convertLegacyCarousel } from "./carousel.ts";

const layouts = ["cover", "content", "list", "bigNumber", "quote", "split", "imageOverlay", "timeline", "statGrid", "cta"] as const;
const legacy = { id: "legacy-1", topic: "Seguridad", platform: "instagram" as const, caption: { text: "Texto", hashtags: ["#seguridad"] }, formData: { topic: "Seguridad", audience: "Developers", tone: "Educational", slideCount: 10, visualStyle: "Modern", withImages: true, imageSource: "unsplash" as const }, slides: layouts.map((layout, index) => ({ id: `slide-${index}`, layout, title: "Título", subtitle: "Subtítulo", content: "Contenido", emoji: "✨", listItems: [{ emoji: "•", text: "Punto" }], bigNumber: "95%", bigNumberLabel: "Métrica", quote: "Cita", quoteAuthor: "Autor", ctaText: "Actúa", ctaSubtext: "Ahora", imageUrl: "https://example.com/image.png", imagePosition: "background" as const, imagePrompt: "Prompt", imageSource: "unsplash" as const, layoutVariant: "v1", backgroundColor: "bg-card", textColor: "text-foreground", accentColor: "text-primary", bgStyleOverride: "grid", titleSize: "display" as const, preservedField: index })), preservedTopLevel: "legacy" };
const converted = convertLegacyCarousel(legacy);
assert.deepEqual(converted.slides, legacy.slides, "las slides legacy se conservan sin pérdida");
assert.equal(converted.preservedTopLevel, "legacy", "los campos adicionales se conservan");
assert.equal(carouselDocumentSchema.safeParse({ ...converted, slides: [converted.slides[0], converted.slides[0]] }).success, false, "IDs duplicados deben fallar");
console.log("CarouselDocument: fixture legacy de 10 layouts convertido sin pérdida.");
