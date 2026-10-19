// Sin dependencias de servidor: lo usa también el paso de animaciones en el navegador.
const DEFAULT_ACCENT = "#22d3ee";

/** Mezcla un #RRGGBB con blanco: el segundo color de la paleta es un tono claro del mismo acento. */
const tint = (hex: string, amount: number) => `#${[1, 3, 5].map((index) => {
  const channel = Number.parseInt(hex.slice(index, index + 2), 16);
  return Math.round(channel + (255 - channel) * amount).toString(16).padStart(2, "0");
}).join("")}`;

/** Una sola paleta para todo el video: el color de la marca (o cian) y un tono claro del mismo. */
export function explainerPalette(primaryColor?: string): [string, string] {
  const accent = primaryColor && /^#[0-9a-fA-F]{6}$/.test(primaryColor) ? primaryColor.toLowerCase() : DEFAULT_ACCENT;
  return [accent, tint(accent, 0.55)];
}
