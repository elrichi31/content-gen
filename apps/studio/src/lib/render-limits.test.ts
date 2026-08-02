import assert from "node:assert/strict";
import { parseActiveRenderJobLimit } from "./render-limits.ts";

assert.equal(parseActiveRenderJobLimit(undefined), 2);
assert.equal(parseActiveRenderJobLimit("3"), 3);
assert.equal(parseActiveRenderJobLimit("0"), 2);
assert.equal(parseActiveRenderJobLimit("99"), 2);
console.log("Límite de render: valores seguros validados.");
