/**
 * Utilidades de color compartidas por los anuncios y los carruseles. Sin dependencias, para poder
 * probarlas con Node. Entienden hex (#rgb, #rrggbb) y `oklch(L C H)`, que es como llegan los colores
 * de marca de los temas del carrusel.
 */

function oklchToRgb(l: number, c: number, hue: number): [number, number, number] {
  const h = (hue * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_, -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_, -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_];
  const gamma = (v: number) => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)));
  return [gamma(linear[0]), gamma(linear[1]), gamma(linear[2])];
}

export function rgb(color: string): [number, number, number] | null {
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    const n = parseInt(digits, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const oklch = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/i.exec(color.trim());
  if (oklch) return oklchToRgb(Number(oklch[1]) / (oklch[2] ? 100 : 1), Number(oklch[3]), Number(oklch[4]));
  return null;
}

/** Color con transparencia. Si el color no se entiende se devuelve tal cual: mejor opaco que roto. */
export function alpha(color: string, opacity: number) {
  const c = rgb(color);
  return c ? `rgba(${c[0]},${c[1]},${c[2]},${opacity})` : color;
}

/** Negro o blanco, el que más contraste dé sobre `color`. */
export function onColor(color: string) {
  const c = rgb(color);
  return c && luminance(c) <= 0.179 ? "#ffffff" : c ? "#0b0b0b" : "#ffffff";
}

function luminance(c: [number, number, number]) {
  const linear = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * linear(c[0]) + 0.7152 * linear(c[1]) + 0.0722 * linear(c[2]);
}

/** Relación de contraste WCAG entre dos colores; 1 si alguno no se entiende. */
export function contrast(a: string, b: string) {
  const ca = rgb(a), cb = rgb(b);
  if (!ca || !cb) return 1;
  const [hi, lo] = [luminance(ca), luminance(cb)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Aclara `color` hacia blanco hasta que se lea sobre `background` con al menos `min`:1. Sirve para
 * texto pequeño en color de marca: el verde de un tema da 4.1:1 sobre tinta y no llega a 4.5.
 * Los bloques y filetes conservan el color puro; solo el texto se corrige.
 */
export function readableOn(color: string, background: string, min = 4.5) {
  const c = rgb(color);
  if (!c || contrast(color, background) >= min) return color;
  for (let mix = 0.08; mix <= 1; mix += 0.08) {
    const lifted = c.map((v) => Math.round(v + (255 - v) * mix)) as [number, number, number];
    const hex = `#${lifted.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    if (contrast(hex, background) >= min) return hex;
  }
  return "#ffffff";
}
