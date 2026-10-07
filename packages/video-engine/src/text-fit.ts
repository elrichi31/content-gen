export const fontStack =
  '"Poppins", "Inter", "Avenir Next", "SF Pro Display", ui-sans-serif, system-ui, sans-serif';
export const monoStack =
  '"JetBrains Mono", "Fira Code", "SF Mono", "Cascadia Code", monospace';

/** Márgenes que `DarkShell` reserva alrededor del contenido de cada escena. */
export const safeBounds = { left: 86, right: 86, top: 108, bottom: 120 };

/** Ancho útil de una escena: el lienzo menos los márgenes seguros. */
export const safeContentWidth = (canvasWidth: number) => canvasWidth - safeBounds.left - safeBounds.right;

/** Relleno vertical de `ColLayout` y vaivén de `DarkShell` (translateY ±8): no son sitio para texto. */
const LAYOUT_PADDING = 60;
const DRIFT = 16;

/** Alto útil de una escena: el lienzo menos márgenes seguros, relleno del layout y vaivén. */
export const safeContentHeight = (canvasHeight: number) => canvasHeight - safeBounds.top - safeBounds.bottom - LAYOUT_PADDING * 2 - DRIFT;

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


type TextMetrics = { size: number; weight?: number; family?: string; letterSpacing?: number };

/**
 * Líneas que ocupa `text` a `size` en una caja de `maxWidth`: respeta los saltos `\n`
 * (`white-space: pre-line`) y parte por espacios como el navegador. Un 2% de holgura cubre
 * la diferencia entre la medida de canvas y el layout real.
 */
export const countLines = ({ text, maxWidth, size, weight = 700, family = fontStack, letterSpacing = 0 }: TextMetrics & { text: string; maxWidth: number }) => {
  const width = maxWidth * 0.98;
  const space = glyphWidth(" ", size, weight, family) + letterSpacing;
  let lines = 0;
  for (const paragraph of text.split("\n")) {
    lines += 1;
    let current = -1;
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const wordWidth = glyphWidth(word, size, weight, family) + letterSpacing * word.length;
      if (current < 0) current = wordWidth;
      else if (current + space + wordWidth <= width) current += space + wordWidth;
      else { lines += 1; current = wordWidth; }
    }
  }
  return lines;
};

const blockCache = new Map<string, number>();

/**
 * Mayor cuerpo <= `size` con el que `text` entra a lo ancho (ninguna palabra se sale) y a lo
 * alto (`líneas * cuerpo * lineHeight <= maxHeight`). Un texto largo de la IA ya no se corta
 * por abajo: baja de cuerpo hasta `minRatio`. Si ya entraba, el tamaño no cambia.
 */
export const fitTextBlock = ({ text, maxWidth, maxHeight, size, lineHeight, weight = 700, family = fontStack, letterSpacing = 0, minRatio = 0.4 }: TextMetrics & {
  text: string; maxWidth: number; maxHeight: number; lineHeight: number; minRatio?: number;
}) => {
  const key = [text, maxWidth, maxHeight, size, lineHeight, weight, family, letterSpacing, minRatio].join("|");
  const cached = blockCache.get(key);
  if (cached !== undefined) return cached;
  const min = Math.round(size * minRatio);
  let fitted = fitFontSize({ text, maxWidth, size, weight, family, letterSpacing, minRatio });
  if (maxHeight > 0) while (fitted > min && countLines({ text, maxWidth, size: fitted, weight, family, letterSpacing }) * fitted * lineHeight > maxHeight) fitted -= 1;
  blockCache.set(key, fitted);
  return fitted;
};

/**
 * Un cuerpo común para una lista (indicadores, acciones, consola): cada elemento entra a lo
 * ancho y la lista completa —con `itemExtra` px de relleno por elemento, `gap` entre ellos y
 * `extra` del contenedor— cabe en `maxHeight`.
 */
export const fitList = ({ items, maxWidth, maxHeight, size, lineHeight, weight = 600, family = fontStack, letterSpacing = 0, itemExtra = 0, gap = 0, extra = 0, minRatio = 0.5 }: TextMetrics & {
  items: readonly string[]; maxWidth: number; maxHeight: number; lineHeight: number; itemExtra?: number; gap?: number; extra?: number; minRatio?: number;
}) => {
  if (!items.length) return size;
  const key = [items.join("\u0000"), maxWidth, maxHeight, size, lineHeight, weight, family, letterSpacing, itemExtra, gap, extra, minRatio].join("|");
  const cached = blockCache.get(key);
  if (cached !== undefined) return cached;
  const min = Math.round(size * minRatio);
  let fitted = Math.min(...items.map((item) => fitFontSize({ text: item, maxWidth, size, weight, family, letterSpacing, minRatio })));
  const height = (s: number) => extra + gap * (items.length - 1) + items.reduce((total, item) => total + itemExtra + countLines({ text: item, maxWidth, size: s, weight, family, letterSpacing }) * s * lineHeight, 0);
  if (maxHeight > 0) while (fitted > min && height(fitted) > maxHeight) fitted -= 1;
  blockCache.set(key, fitted);
  return fitted;
};
