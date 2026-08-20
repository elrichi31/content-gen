export const fontStack =
  '"Poppins", "Inter", "Avenir Next", "SF Pro Display", ui-sans-serif, system-ui, sans-serif';
export const monoStack =
  '"JetBrains Mono", "Fira Code", "SF Mono", "Cascadia Code", monospace';

/** Márgenes que `DarkShell` reserva alrededor del contenido de cada escena. */
export const safeBounds = { left: 86, right: 86, top: 108, bottom: 120 };

/** Ancho útil de una escena: el lienzo menos los márgenes seguros. */
export const safeContentWidth = (canvasWidth: number) => canvasWidth - safeBounds.left - safeBounds.right;

// El texto llega de la IA o del editor, así que una palabra suelta puede ser más ancha
// que el área segura. Una palabra no parte en varias líneas: el navegador la desborda y
// `DarkShell` (overflow hidden) la recorta por los dos lados. Medimos con canvas y bajamos
// el cuerpo hasta que la palabra más larga entre; si ya entraba, el tamaño no cambia y el
// render queda idéntico al de `video-autom`.
let measureCtx: CanvasRenderingContext2D | null | undefined;
const glyphCache = new Map<string, number>();

/** Ancho de la palabra sin contar `letterSpacing`, medido al `size` pedido. */
const glyphWidth = (word: string, size: number, weight: number, family: string) => {
  const key = `${weight}|${size}|${family}|${word}`;
  const cached = glyphCache.get(key);
  if (cached !== undefined) return cached;
  if (measureCtx === undefined) measureCtx = globalThis.document?.createElement("canvas").getContext("2d") ?? null;
  if (measureCtx) measureCtx.font = `${weight} ${size}px ${family}`;
  // Sin canvas (SSR) se estima por número de caracteres: prefiere quedarse corto antes que recortar.
  const width = measureCtx ? measureCtx.measureText(word).width : word.length * size * 0.62;
  glyphCache.set(key, width);
  return width;
};

/**
 * Mayor cuerpo <= `size` con el que ninguna palabra de `text` supera `maxWidth`.
 * `letterSpacing` es fijo en px (no escala con el cuerpo), por eso entra en la ecuación
 * `s * glifos/size + letterSpacing * letras <= maxWidth` en vez de un simple factor.
 */
export const fitFontSize = ({ text, maxWidth, size, weight = 700, family = fontStack, letterSpacing = 0, minRatio = 0.5 }: {
  text: string;
  maxWidth: number;
  size: number;
  weight?: number;
  family?: string;
  letterSpacing?: number;
  minRatio?: number;
}) => {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length || !(maxWidth > 0)) return size;
  const allowed = words.reduce((smallest, word) => {
    const perUnit = glyphWidth(word, size, weight, family) / size;
    if (!(perUnit > 0)) return smallest;
    return Math.min(smallest, (maxWidth - letterSpacing * word.length) / perUnit);
  }, size);
  return Math.max(Math.round(size * minRatio), Math.min(size, Math.floor(allowed)));
};

