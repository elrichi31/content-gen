import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";

const sourceRoot = resolve("apps/studio/src");
const files = [];
function collect(folder) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (entry.name.endsWith(".tsx")) files.push(path);
  }
}
collect(sourceRoot);

const issues = [];
const css = readFileSync(resolve("apps/studio/src/app/globals.css"), "utf8");
const layout = readFileSync(resolve("apps/studio/src/app/layout.tsx"), "utf8");
if (!css.includes("):focus-visible")) issues.push("globals.css no garantiza foco visible");
if (!/<html\s+lang="es"/.test(layout)) issues.push("layout.tsx no declara el idioma español");

const luminance = ([lightness, chroma, hue]) => {
  const angle = hue * Math.PI / 180;
  const a = chroma * Math.cos(angle);
  const b = chroma * Math.sin(angle);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (value) => Math.max(0, Math.min(1, value));
  const [red, green, blue] = [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};
const contrast = (first, second) => {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
};
const colors = {
  background: [0.08, 0, 0],
  card: [0.12, 0, 0],
  foreground: [0.95, 0, 0],
  mutedForeground: [0.6, 0, 0],
  primary: [0.54, 0.12, 145],
  primaryForeground: [0.98, 0, 0],
  accent: [0.45, 0.1, 145],
  accentForeground: [0.98, 0, 0],
};
const contrastPairs = [
  ["texto/fondo", colors.foreground, colors.background],
  ["texto/tarjeta", colors.foreground, colors.card],
  ["texto secundario/fondo", colors.mutedForeground, colors.background],
  ["texto secundario/tarjeta", colors.mutedForeground, colors.card],
  ["primario", colors.primaryForeground, colors.primary],
  ["acento", colors.accentForeground, colors.accent],
];
const ratios = contrastPairs.map(([name, foreground, background]) => [name, contrast(foreground, background)]);
for (const [name, ratio] of ratios) {
  if (ratio < 4.5) issues.push(`contraste ${name}: ${ratio.toFixed(2)}:1`);
}

for (const path of files) {
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const labels = new Set();
  const tagName = (node) => node.tagName.getText(source);
  const attribute = (node, name) => node.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.text === name);
  const value = (item) => {
    if (!item?.initializer) return "";
    if (ts.isStringLiteral(item.initializer)) return item.initializer.text;
    return ts.isJsxExpression(item.initializer) ? item.initializer.expression?.getText(source) ?? "" : "";
  };
  const walkLabels = (node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ["Label", "label"].includes(tagName(node))) {
      const target = value(attribute(node, "htmlFor"));
      if (target) labels.add(target);
    }
    ts.forEachChild(node, walkLabels);
  };
  walkLabels(source);

  const hasText = (node) => {
    if (ts.isJsxText(node)) return Boolean(node.text.trim());
    if (ts.isJsxExpression(node) && node.expression && !ts.isJsxElement(node.expression) && !ts.isJsxSelfClosingElement(node.expression)) return true;
    return node.getChildren(source).some(hasText);
  };
  const inspect = (node) => {
    if (ts.isJsxElement(node)) {
      const tag = tagName(node.openingElement);
      if (["button", "Button", "a", "Link"].includes(tag)) {
        const named = ["aria-label", "aria-labelledby", "title"].some((name) => attribute(node.openingElement, name)) || hasText(node);
        if (!named) issues.push(`${relative(".", path)}:${source.getLineAndCharacterOfPosition(node.pos).line + 1} ${tag} sin nombre accesible`);
      }
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = tagName(node);
      if (["Input", "Textarea", "input", "textarea", "select", "SelectTrigger"].includes(tag)) {
        const type = value(attribute(node, "type"));
        const id = value(attribute(node, "id"));
        const named = node.attributes.properties.some(ts.isJsxSpreadAttribute) || ["aria-label", "aria-labelledby"].some((name) => attribute(node, name)) || (id && labels.has(id));
        if (!["file", "hidden"].includes(type) && !named) issues.push(`${relative(".", path)}:${source.getLineAndCharacterOfPosition(node.pos).line + 1} ${tag} sin label programático`);
      }
      if (tag === "img" && !attribute(node, "alt")) issues.push(`${relative(".", path)}:${source.getLineAndCharacterOfPosition(node.pos).line + 1} img sin alt`);
    }
    ts.forEachChild(node, inspect);
  };
  inspect(source);
}

if (issues.length) {
  console.error(issues.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Accesibilidad estática: ${files.length} archivos TSX sin controles o imágenes sin nombre.`);
}
