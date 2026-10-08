// Regenera src/world.js: la tierra del mapa de puntos como una rejilla de 3° (Natural Earth 1:110m, dominio público).
//   node packages/canvas-engine/scripts/embed-world.mjs
import { writeFileSync } from "node:fs";
import { URL } from "node:url";

const SOURCE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson";
const STEP = 3, LAT0 = 84, LAT1 = -60, COLS = 360 / STEP, ROWS = (LAT0 - LAT1) / STEP;
const land = await (await globalThis.fetch(SOURCE)).json();
const rings = land.features.flatMap((feature) => (feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates).flat());
// Par-impar sobre todos los anillos: los huecos (lagos) quedan fuera solos.
const inside = (lon, lat) => rings.reduce((hit, ring) => {
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}, false);
let bits = "";
for (let row = 0; row < ROWS; row++) {
  let nibbles = 0, value = 0;
  for (let col = 0; col < COLS; col++) {
    value = (value << 1) | (inside(-180 + (col + 0.5) * STEP, LAT0 - (row + 0.5) * STEP) ? 1 : 0);
    if (++nibbles === 4) { bits += value.toString(16); nibbles = value = 0; }
  }
}
writeFileSync(new URL("../src/world.js", import.meta.url), `// Generado por scripts/embed-world.mjs desde Natural Earth 1:110m (dominio público).
// Tierra en una rejilla de ${STEP}° (lat ${LAT0}…${LAT1}), una fila por línea de latitud y 4 celdas por dígito hex.
export const WORLD = { step: ${STEP}, lat0: ${LAT0}, cols: ${COLS}, rows: ${ROWS}, bits: "${bits}" };
`);
