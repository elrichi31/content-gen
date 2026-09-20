import assert from "node:assert/strict";
import { adGenerationInputSchema, buildAdPrompt } from "./ad-generation.ts";
import { brandBrief, brandDefaults, brandIndustry } from "./brand-prompt.ts";
import { buildCarouselPrompt, carouselGenerationInputSchema } from "./carousel-generation.ts";

const brand = { name: "Norte Seguro", primaryColor: "#0a8f52", business: { sector: "Consultora de ciberseguridad", offering: "Auditorías y monitoreo", audience: "PyMEs de Latinoamérica", valueProposition: "Implementamos, no solo recomendamos", voice: "Cercano y directo, sin tecnicismos", avoid: "Prometer «100% seguro»" } };

const brief = brandBrief(brand);
for (const fact of ["Norte Seguro", "#0a8f52", "Consultora de ciberseguridad", "Auditorías y monitoreo", "PyMEs de Latinoamérica", "Implementamos", "Cercano y directo", "100% seguro"]) assert.match(brief, new RegExp(fact.replace(/[%]/g, "\\%")), `el perfil incluye «${fact}»`);
assert.match(brief, /genéricas/, "pide evitar frases que servirían para cualquier negocio");

assert.equal(brandBrief({ name: "Norte", primaryColor: "#111111" }), "Marca: Norte; color principal #111111.", "una marca sin perfil aporta solo nombre y color");
assert.doesNotMatch(brandBrief({ name: "Norte", business: { sector: "Café", voice: "  " } }), /habla así|ofrece|nunca/, "los campos vacíos no dejan huecos en el prompt");
assert.equal(brandBrief(undefined), "", "sin marca no hay perfil");

assert.deepEqual(brandDefaults(brand), { audience: "PyMEs de Latinoamérica", tone: "Cercano y directo, sin tecnicismos" }, "la marca aporta audiencia y tono");
assert.deepEqual(brandDefaults({ name: "Norte" }), {}, "sin perfil no inventa valores");
assert.equal(brandIndustry(brand), "Consultora de ciberseguridad — Auditorías y monitoreo");

// La marca llega al prompt de cada generador, y una solicitud explícita gana sobre los valores de la marca.
const ad = adGenerationInputSchema.parse({ ...brandDefaults(brand), topic: "Auditoría gratis" });
assert.equal(ad.audience, "PyMEs de Latinoamérica", "el anuncio parte de la audiencia de la marca");
assert.match(buildAdPrompt({ ...ad, brandName: brand.name, brandBrief: brief }), /Perfil de la marca[\s\S]*Cercano y directo/, "el prompt del anuncio lleva el perfil completo");
assert.equal(adGenerationInputSchema.parse({ ...brandDefaults(brand), topic: "Auditoría gratis", audience: "Contadores" }).audience, "Contadores", "lo que se pide a mano gana sobre la marca");

const carousel = carouselGenerationInputSchema.parse({ ...brandDefaults(brand), topic: "Cinco señales de phishing", slideCount: 6 });
assert.equal(carousel.tone, "Cercano y directo, sin tecnicismos", "el carrusel parte del tono de la marca");
assert.match(buildCarouselPrompt({ ...carousel, brandName: brand.name, brandBrief: brief }), /Perfil de la marca[\s\S]*100% seguro/, "el prompt del carrusel lleva el perfil completo");
assert.match(buildCarouselPrompt({ ...carousel, brandName: "Norte", primaryColor: "#111111" }), /Marca: Norte; color principal #111111/, "sin perfil conserva el prompt de siempre");

assert.match(buildCarouselPrompt({ ...carousel }), /\*asteriscos\*/, "el prompt del carrusel explica el énfasis opt-in");

console.log("Marca en la generación: perfil, valores por defecto y prompts de anuncio y carrusel verificados.");
