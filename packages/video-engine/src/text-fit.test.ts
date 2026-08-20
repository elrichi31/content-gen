import assert from "node:assert/strict";

// `fitFontSize` mide con canvas, que en Node no existe. Se instala un doble determinista
// ANTES de importar el módulo, porque el contexto se resuelve una sola vez y queda cacheado.
const CHAR_RATIO = 0.7;
let font = "";
(globalThis as { document?: unknown }).document = {
  createElement: () => ({
    getContext: () => ({
      set font(value: string) { font = value; },
      get font() { return font; },
      measureText: (text: string) => ({ width: text.length * Number(font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 0) * CHAR_RATIO }),
    }),
  }),
};

const { fitFontSize, safeContentWidth } = await import("./text-fit.ts");

const SAFE = safeContentWidth(1080);
assert.equal(SAFE, 908, "el ancho útil de un lienzo vertical descuenta los márgenes seguros");

/** Ancho real de la palabra más ancha con el cuerpo devuelto. */
const widestWord = (text: string, size: number, letterSpacing = 0) =>
  Math.max(...text.split(/\s+/).map((word) => word.length * size * CHAR_RATIO + letterSpacing * word.length));

// 1. Si ya entra, no se toca nada: el render queda igual al de `video-autom`.
assert.equal(fitFontSize({ text: "ALERTA", maxWidth: SAFE, size: 148, weight: 900, letterSpacing: -6 }), 148,
  "un título que entra conserva su cuerpo");

// 2. El caso reportado: «COMPROMETIDA» a 148 no entra en 908 y salía recortada por los dos lados.
const title = "CONFIANZA\nCOMPROMETIDA";
const fitted = fitFontSize({ text: title, maxWidth: SAFE, size: 148, weight: 900, letterSpacing: -6, minRatio: 0.45 });
assert.ok(fitted < 148, "un título más ancho que el área segura baja de cuerpo");
assert.ok(widestWord(title, fitted, -6) <= SAFE, `la palabra más larga entra en el área segura (${widestWord(title, fitted, -6)} <= ${SAFE})`);
assert.ok(widestWord(title, fitted + 1, -6) > SAFE, "y se queda con el mayor cuerpo posible, no con uno cualquiera");

// 3. La medida es por palabra, no por longitud total: una frase larga de palabras cortas no encoge.
assert.equal(fitFontSize({ text: "de la red al banco en un solo clic", maxWidth: SAFE, size: 64 }), 64,
  "un texto largo que parte por espacios conserva su cuerpo");

// 4. `letterSpacing` negativo da margen; positivo lo quita.
const apretado = fitFontSize({ text: "INFRAESTRUCTURA", maxWidth: SAFE, size: 130, letterSpacing: -6 });
const suelto = fitFontSize({ text: "INFRAESTRUCTURA", maxWidth: SAFE, size: 130, letterSpacing: 5 });
assert.ok(apretado > suelto, "el interletraje entra en el cálculo");
assert.ok(widestWord("INFRAESTRUCTURA", suelto, 5) <= SAFE, "también cuando el interletraje suma ancho");

// 5. `minRatio` es el suelo: nunca se encoge hasta volverse ilegible.
const imposible = fitFontSize({ text: "A".repeat(200), maxWidth: SAFE, size: 148, minRatio: 0.45 });
assert.equal(imposible, Math.round(148 * 0.45), "una palabra imposible se queda en el suelo legible");

// 6. Casos límite: sin texto o sin ancho no se calcula nada.
assert.equal(fitFontSize({ text: "   ", maxWidth: SAFE, size: 96 }), 96, "un texto vacío conserva su cuerpo");
assert.equal(fitFontSize({ text: "HOLA", maxWidth: 0, size: 96 }), 96, "sin ancho medible no se ajusta");

console.log("Ajuste de texto: los títulos y bloques entran en el área segura sin recortes.");
