// Regenera src/fonts.js desde fonts/*.woff2. Los woff2 son subconjuntos de Inter Display (OFL):
//   pyftsubset InterDisplay-Black.otf --unicodes="U+0020-007E,U+00A0-00FF,…" --flavor=woff2
//   node packages/canvas-engine/scripts/embed-fonts.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { URL } from "node:url";

const root = new URL("../", import.meta.url);
const weights = { 500: "Medium", 700: "Bold", 900: "Black" };
const lines = Object.entries(weights).map(([weight, name]) => `  ${weight}: "${readFileSync(new URL(`fonts/InterDisplay-${name}.woff2`, root)).toString("base64")}",`);
writeFileSync(new URL("src/fonts.js", root), `// Generado por scripts/embed-fonts.mjs desde fonts/*.woff2 (Inter Display, licencia OFL en fonts/OFL.txt).
// Van en base64 dentro del HTML: el render no depende de las fuentes del sistema ni de la red.
export const INTER_DISPLAY = {
${lines.join("\n")}
};
`);
