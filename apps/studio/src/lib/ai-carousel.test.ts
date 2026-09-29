import assert from "node:assert/strict";
import { buildSlidePrompt, parsePlan } from "./ai-carousel.ts";

const plan = parsePlan({ style: "flat illustration, #111 background", slides: [{ headline: "Uno" }, { headline: "Dos", body: "b" }, { headline: "Tres" }] }, 2);
assert.equal(plan.slides.length, 2, "recorta a las slides pedidas");
assert.match(buildSlidePrompt(plan, 1), /slide 2 of 2[\s\S]*#111[\s\S]*"Dos"[\s\S]*Body: "b"[\s\S]*"2\/2"/, "cada slide lleva estilo, texto e índice");
assert.doesNotMatch(buildSlidePrompt(plan, 0), /Body:/, "sin body no pide body");
assert.match(buildSlidePrompt(plan, 0, { name: "Zenlor", primaryColor: "#ff0000", hasLogo: true }), /"Zenlor"[\s\S]*#ff0000[\s\S]*logo/, "incluye marca, color y logo");
assert.doesNotMatch(buildSlidePrompt(plan, 0, { name: "Zenlor" }), /attached image/, "sin logo no menciona la imagen adjunta");
