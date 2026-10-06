import assert from "node:assert/strict";
import type { PublishingRule, ScheduledPost } from "@content-gen/domain/schedule";
import { automationInputSchema, imagesToDocument, nextListTopic, nextOpenSlot } from "./carousel-automation-rules.ts";

const stamp = "2026-10-01T00:00:00.000Z";
// Lunes, miércoles y viernes a las 19:00. 2026-10-05 es lunes.
const rule: PublishingRule = { id: "r1", schemaVersion: 1, name: "IG", platform: "instagram", weekdays: [1, 3, 5], times: ["19:00"], campaignId: null, active: true, startDate: "2026-10-01", endDate: null, createdAt: stamp, updatedAt: stamp };
const post = (date: string, contentItemId: string | null, status: ScheduledPost["status"] = "planificada"): ScheduledPost => ({ id: `p-${date}`, schemaVersion: 1, platform: "instagram", date, time: "19:00", contentItemId, campaignId: null, ruleId: "r1", title: "", notes: "", status, createdAt: stamp, updatedAt: stamp });
const monday10am = new Date(2026, 9, 5, 10, 0);

assert.equal(nextOpenSlot(rule, [], 7, monday10am)?.date, "2026-10-05", "hoy cuenta si la hora aún no pasó");
assert.equal(nextOpenSlot(rule, [], 7, new Date(2026, 9, 5, 20, 0))?.date, "2026-10-07", "un hueco de hoy ya pasado se salta");
assert.equal(nextOpenSlot(rule, [post("2026-10-05", "c1")], 7, monday10am)?.date, "2026-10-07", "un hueco con pieza no se toca");
const reserved = nextOpenSlot(rule, [post("2026-10-05", null)], 7, monday10am);
assert.equal(reserved?.post?.id, "p-2026-10-05", "un hueco reservado sin pieza se rellena");
assert.equal(nextOpenSlot(rule, [post("2026-10-05", null, "omitida")], 7, monday10am)?.date, "2026-10-07", "un hueco omitido a propósito no se rellena");
assert.equal(nextOpenSlot(rule, [post("2026-10-05", "a"), post("2026-10-07", "b")], 3, monday10am), null, "fuera del horizonte no hay huecos");
assert.equal(nextOpenSlot({ ...rule, active: false }, [], 7, monday10am), null, "una pauta pausada no genera huecos");

assert.equal(nextListTopic(["a", "b", "c"], ["a"]), "b", "toma el primero sin usar, en orden");
assert.equal(nextListTopic(["a"], ["a"]), null, "lista agotada");

const base = { name: "x", ruleId: "r1", campaignId: "c1", kind: "editable" };
assert.equal(automationInputSchema.safeParse(base).success, false, "sin temas ni radar no hay de dónde sacar contenido");
assert.equal(automationInputSchema.safeParse({ ...base, radarVertical: "ecommerce" }).success, true, "el radar solo basta");
assert.equal(automationInputSchema.safeParse({ ...base, topics: ["Tema uno"] }).success, true, "la lista sola basta");

const document = imagesToDocument("Tema", [{ headline: "Uno", body: "", url: "/api/assets/1" }, { headline: "Dos", body: "", url: null }]);
assert.equal(document.slides.length, 1, "las slides que no se dibujaron se descartan");
assert.equal(document.slides[0].layoutVariant, "full", "la imagen va a sangre, sin texto encima");
assert.throws(() => imagesToDocument("Tema", [{ headline: "Uno", body: "", url: null }]), /ninguna slide/, "sin ninguna slide no hay carrusel");

console.log("carousel-automation: ok");
