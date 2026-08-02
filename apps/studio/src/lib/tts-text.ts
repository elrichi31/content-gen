/**
 * Pasada de pronunciación deliberadamente conservadora para los términos
 * habituales del proyecto, portada desde `video-autom/dashboard/lib/tts-text.ts`.
 * Mejora la claridad sin cambiar el significado ni adivinar cómo se leen cifras
 * arbitrarias.
 */
const ACRONYM_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bGPT\b/g, "ge pe te"],
  [/\bIA\b/g, "i a"],
  [/\bAI\b/g, "i a"],
  [/\bFBI\b/g, "efe be i"],
  [/\bCIA\b/g, "ce i a"],
  [/\bUSB-C\b/g, "u ese be ce"],
  [/\bUSB\b/g, "u ese be"],
  [/\bURL\b/g, "u erre ele"],
  [/\bVPN\b/g, "uve pe ene"],
  [/\b2FA\b/g, "doble factor de autenticación"],
  [/\bMFA\b/g, "autenticación multifactor"],
  [/\bCEO\b/g, "ce e o"],
  [/\bCTO\b/g, "ce te o"],
];

export function normalizeTextForTts(text: string): string {
  let normalized = text.replace(/\r?\n+/g, " ").replace(/\s+/g, " ").replace(/\.{3,}/g, "…").trim();
  for (const [pattern, replacement] of ACRONYM_REPLACEMENTS) normalized = normalized.replace(pattern, replacement);
  return normalized;
}

export const QUALITY_VOICE_MODEL = "eleven_multilingual_v2";
export const EXPRESSIVE_VOICE_MODEL = "eleven_v3";
export const isExpressiveVoiceModel = (modelId: string) => modelId === EXPRESSIVE_VOICE_MODEL;

/**
 * Mantiene la API alineada con los controles que soporta cada modelo: Eleven v3
 * dirige la interpretación con el texto y las etiquetas, no con los sliders.
 */
export function voiceSettingsFor(modelId: string) {
  return isExpressiveVoiceModel(modelId)
    ? { stability: 0.5 }
    : { stability: 0.55, similarity_boost: 0.75, style: 0, speed: 0.98 };
}
