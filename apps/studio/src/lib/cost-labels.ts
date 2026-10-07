// Etiquetas y formato compartidos por la pantalla de costos y el desglose por pieza.

/** Etiquetas de las operaciones que registra la aplicación; una nueva se muestra con su clave. */
export const OPERATION_LABEL: Record<string, string> = {
  "article-research": "Artículo · investigación",
  "article-write": "Artículo · redacción",
  "carousel-generate": "Carrusel · generar",
  "carousel-remix": "Carrusel · remix",
  "carousel-slide-add": "Carrusel · añadir slide",
  "carousel-slide-regenerate": "Carrusel · rehacer slide",
  "carousel-image": "Carrusel · imagen",
  "ad-generate": "Anuncio · generar",
  "ad-regenerate": "Anuncio · rehacer",
  "video-standard-script": "Video · guion",
  "video-timeline-script": "Video · guion timeline",
  "video-voiceover-script": "Video · guion de voz",
  "video-caption": "Video · caption",
  "video-scene-image": "Video · imagen de escena",
  "video-scene-audio": "Video · audio de escena",
  "radar-research": "Radar · investigación",
  "radar-structure": "Radar · estructurar",
  "radar-restructure": "Radar · reestructurar",
  "ai-carousel-plan": "Carrusel IA · plan",
  "ai-carousel-slide": "Carrusel IA · imagen",
  "explainer-script": "Animación · guion",
};
export const TOOL_LABEL: Record<string, string> = { "web-search": "Búsqueda web", image: "Imágenes IA", speech: "Síntesis de voz", "stock-photo": "Fotos de stock", text: "Generación de texto" };

export const PROVIDER_LABEL: Record<string, string> = { openai: "OpenAI", gemini: "Gemini", elevenlabs: "ElevenLabs", unsplash: "Unsplash", local: "Local" };

/**
 * Los importes son céntimos de dólar: con dos decimales casi todo saldría «$0.00». Se muestran
 * cuatro, que es donde estas cifras empiezan a distinguirse entre sí.
 */
export function money(amount: number, currency: string) {
  return `${amount.toLocaleString("es", { minimumFractionDigits: amount >= 1 ? 2 : 4, maximumFractionDigits: 6 })} ${currency}`;
}
