import assert from "node:assert/strict";
import {
  addDays,
  buildCalendar,
  currentMonth,
  eachDate,
  generateSlots,
  monthGrid,
  monthRange,
  publishingRuleSchema,
  scheduledPostSchema,
  slotKey,
  summarizeCalendar,
  todayLocal,
  weekdayOf,
} from "./schedule.ts";

const now = "2026-08-01T10:00:00.000Z";
const rule = publishingRuleSchema.parse({
  id: "r1", schemaVersion: 1, name: "Instagram base", platform: "instagram",
  weekdays: [5, 1, 3, 1], times: ["19:00", "09:30", "19:00"], startDate: "2026-08-01",
  createdAt: now, updatedAt: now,
});

assert.deepEqual(rule.weekdays, [1, 3, 5], "ordena y deduplica los días de la pauta");
assert.deepEqual(rule.times, ["09:30", "19:00"], "ordena y deduplica las horas");
assert.equal(rule.endDate, null, "sin fin la pauta se repite indefinidamente");
assert.throws(() => publishingRuleSchema.parse({ ...rule, weekdays: [] }), "una pauta sin días no generaría huecos");
assert.throws(() => publishingRuleSchema.parse({ ...rule, times: ["9:30"] }), /HH:MM/, "exige hora de dos dígitos");
assert.throws(() => publishingRuleSchema.parse({ ...rule, times: ["24:00"] }), /HH:MM/, "rechaza horas fuera del reloj de 24 h");
assert.throws(() => publishingRuleSchema.parse({ ...rule, platform: "threads" }), "rechaza plataformas desconocidas");

// Fechas civiles: ningún cálculo puede desplazar el día por husos ni por cambio de hora.
assert.equal(weekdayOf("2026-08-03"), 1, "el 3 de agosto de 2026 es lunes");
assert.equal(addDays("2026-08-31", 1), "2026-09-01", "cruza el fin de mes");
assert.equal(addDays("2026-03-29", 1), "2026-03-30", "el cambio de hora no mueve el día");
assert.equal(addDays("2026-01-01", -1), "2025-12-31", "retrocede de año");
assert.equal(eachDate("2026-08-01", "2026-08-03").length, 3, "el rango es inclusivo");
assert.deepEqual(eachDate("2026-08-03", "2026-08-01"), [], "un rango invertido no produce fechas");
assert.throws(() => eachDate("2026-01-01", "2028-01-01"), /460 días/, "acota rangos absurdos");

// De noche en América, `toISOString()` ya devuelve el día siguiente: la pauta creada a las
// 22:16 del lunes se saltaba ese mismo lunes. La fecha civil local es la buena.
assert.equal(todayLocal(new Date(2026, 7, 3, 22, 16)), "2026-08-03", "hoy es el día local, no el de UTC");
assert.equal(todayLocal(new Date(2026, 0, 1, 0, 5)), "2026-01-01", "rellena mes y día a dos dígitos");
assert.equal(currentMonth(new Date(2026, 11, 31, 23, 59)), "2026-12", "el mes en curso tampoco se adelanta");

assert.deepEqual(monthRange("2026-02"), { startDate: "2026-02-01", endDate: "2026-02-28" }, "febrero de un año normal");
assert.deepEqual(monthRange("2028-02"), { startDate: "2028-02-01", endDate: "2028-02-29" }, "febrero bisiesto");
assert.throws(() => monthRange("2026-13"), /YYYY-MM/, "valida el mes");

const grid = monthGrid("2026-08");
assert.ok(grid.every((week) => week.length === 7), "la rejilla son semanas completas");
assert.equal(grid[0][0], "2026-07-27", "la primera semana empieza en lunes con relleno del mes anterior");
assert.equal(grid.at(-1)?.at(-1), "2026-09-06", "la última semana llega hasta domingo");
assert.ok(grid.flat().includes("2026-08-01") && grid.flat().includes("2026-08-31"), "la rejilla contiene el mes entero");

// Agosto de 2026: lunes 3, miércoles 5, viernes 7 → 3 días × 2 horas.
const slots = generateSlots({ rules: [rule], startDate: "2026-08-03", endDate: "2026-08-07" });
assert.equal(slots.length, 6, "genera un hueco por día de pauta y hora");
assert.deepEqual(slots.slice(0, 2).map((slot) => slot.time), ["09:30", "19:00"], "ordena por fecha y hora");
assert.ok(slots.every((slot) => [1, 3, 5].includes(weekdayOf(slot.date))), "solo cae en los días de la pauta");

const inactive = publishingRuleSchema.parse({ ...rule, id: "r2", active: false });
assert.equal(generateSlots({ rules: [inactive], startDate: "2026-08-03", endDate: "2026-08-07" }).length, 0, "una pauta inactiva no genera huecos");
const ended = publishingRuleSchema.parse({ ...rule, id: "r3", endDate: "2026-08-04" });
assert.equal(generateSlots({ rules: [ended], startDate: "2026-08-03", endDate: "2026-08-07" }).length, 2, "la fecha de fin corta la pauta");
const twin = publishingRuleSchema.parse({ ...rule, id: "r4", name: "Duplicada" });
assert.equal(generateSlots({ rules: [rule, twin], startDate: "2026-08-03", endDate: "2026-08-07" }).length, 6, "dos pautas iguales describen los mismos huecos, no el doble");

const post = (overrides: Record<string, unknown>) => scheduledPostSchema.parse({
  id: "p1", schemaVersion: 1, platform: "instagram", date: "2026-08-03", time: "19:00",
  createdAt: now, updatedAt: now, ...overrides,
});

const assigned = post({ contentItemId: "c1", title: "Carrusel de lanzamiento", status: "lista" });
const calendar = buildCalendar({ rules: [rule], posts: [assigned], startDate: "2026-08-03", endDate: "2026-08-07" });
assert.equal(calendar.length, 5, "devuelve todos los días del rango, tengan huecos o no");
assert.deepEqual(calendar.map((day) => day.slots.length), [2, 0, 2, 0, 2], "los días sin pauta quedan vacíos");
const lunes = calendar[0].slots.find((slot) => slot.time === "19:00");
assert.equal(lunes?.post?.id, "p1", "la publicación cae en su hueco");
assert.equal(lunes?.ruleId, "r1", "el hueco recuerda de qué pauta viene");
assert.equal(calendar[0].slots[0].post, null, "el hueco sin pieza se queda libre");

// Si la pauta cambia después de planificar, la publicación tiene que seguir apareciendo.
const huerfana = post({ id: "p2", date: "2026-08-04", time: "12:00", title: "Fuera de pauta" });
const conHuerfana = buildCalendar({ rules: [rule], posts: [assigned, huerfana], startDate: "2026-08-03", endDate: "2026-08-07" });
assert.equal(conHuerfana[1].slots.length, 1, "una publicación fuera de pauta crea su propio hueco");
assert.equal(conHuerfana[1].slots[0].ruleId, null, "el hueco suelto no finge venir de una pauta");
assert.equal(buildCalendar({ rules: [], posts: [post({ id: "p3", date: "2026-07-30" })], startDate: "2026-08-03", endDate: "2026-08-07" }).length, 5, "ignora publicaciones fuera del rango");

assert.equal(slotKey(assigned), slotKey({ platform: "instagram", date: "2026-08-03", time: "19:00" }), "la clave del hueco es plataforma, día y hora");
assert.notEqual(slotKey(assigned), slotKey({ ...assigned, platform: "tiktok" }), "cada plataforma tiene su propio hueco a la misma hora");

const resumen = summarizeCalendar(conHuerfana);
assert.deepEqual(resumen, { slots: 7, empty: 5, unassigned: 1, ready: 1, published: 0 }, "resume huecos libres, pendientes de pieza y listos");

console.log("Cronograma: pautas, generación de huecos, rejilla del mes y calendario validados.");
