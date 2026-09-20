import type { BusinessProfile } from "@content-gen/domain/schemas";

export type PromptBrand = { name: string; primaryColor?: string; business?: Partial<BusinessProfile> };

const FACTS: [keyof BusinessProfile, string][] = [
  ["sector", "giro"],
  ["offering", "ofrece"],
  ["audience", "se dirige a"],
  ["valueProposition", "se diferencia por"],
  ["voice", "habla así"],
  ["avoid", "nunca dice ni promete"],
];

/**
 * Lo que la IA debe saber de la marca para no escribir en abstracto. Solo entran los campos con
 * contenido: un perfil a medias no debe rellenar el prompt con huecos ni con «no especificado».
 */
export function brandBrief(brand: PromptBrand | undefined) {
  if (!brand) return "";
  const head = `Marca: ${brand.name}${brand.primaryColor ? `; color principal ${brand.primaryColor}` : ""}.`;
  const facts = FACTS.map(([key, label]) => { const value = brand.business?.[key]?.trim(); return value ? `${label}: ${value}` : ""; }).filter(Boolean);
  if (!facts.length) return head;
  return `${head} Perfil de la marca — ${facts.join("; ")}. Escribe como esta marca y sobre lo que vende de verdad; evita frases genéricas que servirían para cualquier negocio.`;
}

/** Audiencia y tono que la marca aporta cuando la solicitud no los trae. */
export function brandDefaults(brand: PromptBrand | undefined) {
  const audience = brand?.business?.audience?.trim();
  const tone = brand?.business?.voice?.trim();
  return { ...(audience ? { audience } : null), ...(tone ? { tone } : null) };
}

/** Giro y oferta para los fondos de imagen: dan ambiente sin meter texto de marca en la imagen. */
export function brandIndustry(brand: PromptBrand | undefined) {
  return [brand?.business?.sector, brand?.business?.offering].map((part) => part?.trim()).filter(Boolean).join(" — ");
}
