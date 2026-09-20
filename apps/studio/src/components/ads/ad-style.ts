/**
 * Utilidades puras de las plantillas de anuncio. Sin JSX para poder probarlas con Node.
 * Todo se mide en `u` = 1% del lado corto del lienzo: la plantilla se ve igual en la vista previa
 * de 340 px que a 1080 px de exportación.
 */

export type Geometry = { u: number; tall: boolean; wide: boolean; pad: number; top: number; bottom: number };

/** `top` y `bottom` reservan la zona que las apps tapan en historias y reels (~10% y ~14%). */
export function geometry(w: number, h: number): Geometry {
  const u = Math.min(w, h) / 100;
  const tall = h > w * 1.2;
  return { u, tall, wide: w > h * 1.2, pad: u * 7, top: tall ? h * 0.1 : u * 6, bottom: tall ? h * 0.14 : u * 6 };
}

export { alpha, onColor } from "../../lib/color.ts";

/** Líneas que ocupa `text` si caben `perLine` caracteres por línea, partiendo por palabras. */
function lineCount(text: string, perLine: number) {
  let lines = 1;
  let current = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (current === 0) current = word.length;
    else if (current + 1 + word.length <= perLine) current += 1 + word.length;
    else { lines += 1; current = word.length; }
  }
  return lines;
}

/**
 * Tamaño de letra más grande, entre `min` y `max`, con el que `text` cabe en una caja. Los titulares
 * de la IA van de 15 a 70 caracteres y un tamaño fijo o se queda corto o se desborda.
 * `charWidth` es el ancho medio de un carácter en em: ~0.5 para el titular condensado en mayúsculas.
 */
export function fitSize(text: string, boxWidth: number, boxHeight: number, { max, min, charWidth = 0.5, leading = 0.95 }: { max: number; min: number; charWidth?: number; leading?: number }) {
  const longest = Math.max(1, ...text.split(/\s+/).map((word) => word.length));
  for (let size = max; size > min; size -= max * 0.04) {
    const perLine = Math.floor(boxWidth / (size * charWidth));
    if (perLine < longest) continue;
    if (lineCount(text, perLine) * size * leading <= boxHeight) return size;
  }
  return min;
}
