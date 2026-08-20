import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = await mkdtemp(join(tmpdir(), "content-gen-radar-"));
process.env.DATABASE_URL = `file:${join(root, "radar.sqlite")}`;
process.env.CONTENT_GEN_AI_PROVIDER = "openai";
process.env.OPENAI_API_KEY = "test";
process.env.OPENAI_TEXT_MODEL = "modelo-texto";
process.env.OPENAI_RESEARCH_MODEL = "modelo-investigacion";
process.env.OPENAI_STRUCTURING_MODEL = "modelo-barato";

const pricingFile = join(root, "pricing.json");
await writeFile(pricingFile, JSON.stringify({
  version: "2026-08-18",
  currency: "USD",
  models: {
    "modelo-texto": { inputPerMillion: 5, cachedInputPerMillion: 0.5, outputPerMillion: 30 },
    "modelo-investigacion": { inputPerMillion: 5, cachedInputPerMillion: 0.5, outputPerMillion: 30 },
    "modelo-elegido": { inputPerMillion: 3, cachedInputPerMillion: 0.3, outputPerMillion: 18 },
    "modelo-barato": { inputPerMillion: 1, cachedInputPerMillion: 0.1, outputPerMillion: 4 },
  },
  tools: { webSearchPerCall: 0.01 },
  speech: { perThousandCharacters: null },
}), "utf8");
process.env.PRICING_FILE = pricingFile;

const database = new DatabaseSync(join(root, "radar.sqlite"));
database.exec(`
  CREATE TABLE campaigns (id TEXT PRIMARY KEY);
  CREATE TABLE content_items (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, type TEXT NOT NULL, archived_at TEXT);
  CREATE TABLE generation_runs (
    id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL, content_item_id TEXT, radar_topic_id TEXT,
    operation TEXT NOT NULL, provider TEXT NOT NULL, status TEXT NOT NULL, cost_amount REAL,
    data_json TEXT NOT NULL, created_at TEXT NOT NULL, completed_at TEXT
  );
  CREATE TABLE brand_kits (id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT);
  CREATE TABLE radar_watchlist (id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL, vertical TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1, priority INTEGER NOT NULL DEFAULT 5, brand_kit_id TEXT, data_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (brand_kit_id) REFERENCES brand_kits(id));
  CREATE TABLE radar_runs (id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL, status TEXT NOT NULL, started_at TEXT NOT NULL, completed_at TEXT, cost_amount REAL, data_json TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE radar_topics (id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL, run_id TEXT NOT NULL, vertical TEXT NOT NULL, status TEXT NOT NULL, score INTEGER NOT NULL, fingerprint TEXT NOT NULL, origin TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (run_id) REFERENCES radar_runs(id));
  CREATE TABLE radar_topic_items (topic_id TEXT NOT NULL, content_item_id TEXT NOT NULL, format TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (topic_id, content_item_id), FOREIGN KEY (topic_id) REFERENCES radar_topics(id), FOREIGN KEY (content_item_id) REFERENCES content_items(id));
`);
database.prepare("INSERT INTO campaigns VALUES (?)").run("campaign");
database.prepare("INSERT INTO content_items VALUES (?, ?, ?, ?)").run("pieza", "campaign", "carousel", null);
database.prepare("INSERT INTO brand_kits VALUES (?, 1, ?, ?, ?, NULL)").run(
  "marca-1",
  JSON.stringify({ id: "marca-1", schemaVersion: 1, name: "Zenlor Labs", primaryColor: "#2f7d40", logoAssetId: null, business: { sector: "Consultora de ciberseguridad", offering: "Auditorías y automatización", audience: "PyMEs", valueProposition: "Implementamos, no solo diagnosticamos" }, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", archivedAt: null }),
  "2026-08-01T00:00:00.000Z",
  "2026-08-01T00:00:00.000Z",
);
database.close();

const { beginRadarRun, createWatchlistEntry, listTopics, listRadarRuns, saveTopics, setTopicStatus, linkTopicToContent, topicContentItems, recentMemory, RadarError } = await import("./radar.ts");
const { scanRadar } = await import("./radar-scan.ts");

await createWatchlistEntry({ vertical: "Ciberseguridad", offering: "Auditorías y hardening para PyMEs", priority: 1, brandKitId: "marca-1" });
await createWatchlistEntry({ vertical: "Automatización", offering: "Flujos de n8n para negocios", priority: 2 });
await createWatchlistEntry({ vertical: "Inactivo", offering: "No se vigila", active: false });

await assert.rejects(() => createWatchlistEntry({ vertical: "Ciberseguridad", offering: "Duplicado" }), (error: unknown) => error instanceof RadarError && error.status === 409, "no se vigila dos veces el mismo vertical");
await assert.rejects(() => createWatchlistEntry({ vertical: "Fantasma", offering: "Marca inexistente", brandKitId: "no-existe" }), (error: unknown) => error instanceof RadarError && error.status === 400, "no se puede colgar un vertical de una marca que no existe");

/* ----------------------------- Corrida feliz ----------------------------- */

const topicFor = (title: string, vertical: string) => ({
  title,
  why_now: "Ocurrió esta semana según dos fuentes primarias.",
  vertical,
  angle_for_agency: "Conecta directamente con lo que vende la agencia.",
  evidence: [
    { url: "https://ejemplo.com/uno", title: "Fuente uno", published_at: "2026-08-17" },
    { url: "https://otro-medio.org/dos", title: "Fuente dos", published_at: "2026-08-17" },
  ],
  formats: [{ type: "carousel", reason: "Se explica en cinco pasos", hook: "Un gancho" }],
  shelf_life: "perecedero",
  confidence: 0.8,
});

const calls: { body: string; tools: boolean }[] = [];
const fakeFetch = (async (_url: string, init?: RequestInit) => {
  const body = String(init?.body ?? "");
  const parsed = JSON.parse(body) as { model: string; tools?: unknown[]; text?: unknown };
  calls.push({ body, tools: Array.isArray(parsed.tools) && parsed.tools.length > 0 });
  if (parsed.tools) {
    // Las notas nombran los dos dominios que luego se citan: es lo que la comprobación de fuentes
    // busca, y una fuente que no aparezca aquí es una que el estructurador se inventó.
    return new Response(JSON.stringify({
      output_text: `Notas de ${parsed.model}: ejemplo.com y otro-medio.org lo publicaron`,
      usage: { input_tokens: 2000, output_tokens: 500, input_tokens_details: { cached_tokens: 1500 } },
      output: [{ type: "web_search_call" }, { type: "web_search_call" }, { type: "message", content: [{ type: "output_text", text: "Notas", annotations: [{ type: "url_citation", url: "https://ejemplo.com/uno?utm_source=openai", title: "Fuente uno" }] }] }],
    }));
  }
  return new Response(JSON.stringify({
    output_text: JSON.stringify({ topics: [topicFor("Ransomware golpea clínicas", "Ciberseguridad"), topicFor("n8n publica su versión 2", "Automatización"), { title: "roto" }] }),
    usage: { input_tokens: 3000, output_tokens: 800 },
  }));
}) as unknown as typeof fetch;

const first = await scanRadar({ windowDays: 7, maxTopics: 10 }, { request: fakeFetch, now: new Date("2026-08-18T10:00:00.000Z") });

assert.equal(calls.filter((call) => call.tools).length, 2, "una búsqueda por vertical activo, no por tema");
assert.equal(calls.filter((call) => !call.tools).length, 1, "una sola llamada de estructuración, sin herramientas");
assert.match(calls[0].body, /modelo-investigacion/, "investigar usa su propio modelo, no el de texto general");
assert.equal(calls[0].body.includes("modelo-texto"), false, "y no hereda OPENAI_TEXT_MODEL: es donde está el gasto");
assert.match(calls[2].body, /modelo-barato/, "estructurar usa el modelo barato configurado");
assert.match(calls[0].body, /últimos 7 días/, "la ventana temporal va explícita en el prompt");
assert.match(calls[0].body, /no hagas más de 8 búsquedas/, "el tope de búsquedas va en el prompt: es la palanca de costo principal");
// El tope de búsquedas es una peticion al modelo y puede ignorarla; `search_context_size` es lo
// unico que la API aplica de verdad, asi que tiene que viajar en el propio tool.
assert.match(calls[0].body, /"search_context_size":"low"/, "la busqueda limita el contenido descargado por defecto");
// Investigar y estructurar tienen su propio modelo y no heredan OPENAI_TEXT_MODEL: son los pasos
// donde esta el gasto, y seguir al modelo general significaba pagar el mas caro sin decidirlo.
assert.match(calls[0].body, /modelo-investigacion/, "investigar usa su propio modelo");
assert.match(calls[0].body, /Reporta TODO hecho relevante/, "el investigador trae todo: filtrar es del sistema, no suyo");
assert.match(calls[0].body, /llegar a 2 dominios distintos/, "pero se le pide buscar confirmacion");
assert.match(calls[2].body, /es el sistema quien cuenta, no tú/, "y al estructurar tampoco decide el modelo");
assert.match(calls[0].body, /Zenlor Labs.*Consultora de ciberseguridad/s, "el vertical ligado a una marca hereda su giro");
assert.equal(calls[1].body.includes("Zenlor Labs"), false, "el vertical sin marca no arrastra contexto ajeno");
assert.equal(calls[2].body.includes("web_search"), false, "el paso de estructuración no busca nada");

assert.equal(first.run.status, "completed", "la corrida se cierra");
assert.equal(first.summary.found, 3, "cuenta lo que devolvió el modelo");
assert.equal(first.summary.kept, 2, "guarda los temas utilizables");
assert.equal(first.summary.rejected, 1, "un tema malformado se descarta sin tumbar a los demás");
assert.equal(first.run.topicsKept, 2, "la corrida registra cuántos temas sobrevivieron");

// 2 investigaciones (2000 in / 1500 cacheados / 500 out / 2 búsquedas) + 1 estructuración.
assert.deepEqual(first.run.usage, { inputTokens: 7000, cachedInputTokens: 3000, outputTokens: 1800, webSearchCalls: 4, images: 0, characters: 0 }, "agrega el consumo de las tres llamadas");
// Investigación, por llamada: 500×5/1e6 + 1500×0.5/1e6 + 500×30/1e6 + 2×0.01 = 0.03825 → ×2 = 0.0765
// Estructuración: (3000×1 + 800×4)/1e6 = 0.0062
assert.equal(first.run.cost?.amount, 0.0827, "tarifa cada parte con su propio modelo y luego suma");
assert.equal(first.run.cost?.pricingVersion, "2026-08-18", "congela la versión de tarifa");

const stored = await listTopics();
assert.equal(stored.length, 2, "los temas quedan persistidos");
assert.deepEqual(stored.map((topic) => topic.vertical).sort(), ["Automatización", "Ciberseguridad"], "cada tema conserva su vertical");
assert.equal(stored.every((topic) => topic.status === "nuevo"), true, "todos nacen pendientes de revisión");
assert.equal(stored.every((topic) => topic.runId === first.run.id), true, "los temas quedan ligados a su corrida");
assert.equal(stored[0].evidence[0]?.url.includes("utm_source"), false, "las fuentes llegan limpias de rastreo");

/* ------------------- Corroboración: una sola fuente no basta ------------------- */

const unaSolaFuente = (async (_url: string, init?: RequestInit) => {
  const parsed = JSON.parse(String(init?.body ?? "{}")) as { tools?: unknown[] };
  if (parsed.tools) return new Response(JSON.stringify({ output_text: "Notas", usage: { input_tokens: 10, output_tokens: 10 }, output: [{ type: "web_search_call" }] }));
  return new Response(JSON.stringify({
    output_text: JSON.stringify({ topics: [
      { ...topicFor("Filtracion masiva sin confirmar por nadie mas", "Ciberseguridad"), evidence: [{ url: "https://rumor.com/a", title: "Unico medio", published_at: "2026-08-17" }] },
      { ...topicFor("Otra filtracion con dos enlaces del mismo sitio", "Ciberseguridad"), evidence: [{ url: "https://rumor.com/a", title: "Una", published_at: "2026-08-17" }, { url: "https://www.rumor.com/b", title: "Otra", published_at: "2026-08-17" }] },
    ] }),
    usage: { input_tokens: 10, output_tokens: 10 },
  }));
}) as unknown as typeof fetch;

const sinCorroborar = await scanRadar({}, { request: unaSolaFuente, now: new Date("2026-08-18T12:00:00.000Z") });
assert.equal(sinCorroborar.summary.kept, 0, "un tema que solo publica un medio no llega a la revisión");
assert.equal(sinCorroborar.summary.insufficientSources, 2, "dos enlaces del mismo dominio tampoco corroboran");
assert.equal(sinCorroborar.summary.rejected, 0, "falta de corroboración se cuenta aparte de un tema malformado");

const permisivo = await scanRadar({ minSources: 1 }, { request: unaSolaFuente, now: new Date("2026-08-18T13:00:00.000Z") });
assert.equal(permisivo.summary.kept, 2, "el umbral se puede bajar cuando interesa ver lo no contrastado");

/* -------------------- Segunda corrida: no debe repetir -------------------- */

const memory = await recentMemory({ now: new Date("2026-08-18T10:00:00.000Z") });
assert.equal(memory.titles.length, 4, "la memoria reciente recoge los titulares ya cubiertos");

const second = await scanRadar({}, { request: fakeFetch, now: new Date("2026-08-19T10:00:00.000Z") });
assert.equal(second.summary.kept, 0, "la misma respuesta no vuelve a guardar nada");
assert.equal(second.summary.repeated, 2, "los repetidos se cuentan: es la señal de que la corrida aporta poco");
assert.equal((await listTopics()).length, 4, "la base no crece con duplicados");
assert.match(calls.at(-3)!.body, /no los repitas/, "los titulares ya cubiertos se le pasan al modelo");

/* --------------------------- Estados y piezas --------------------------- */

const target = stored[0];
await setTopicStatus(target.id, "guardado");
const usado = await setTopicStatus(target.id, "usado");
assert.equal(usado.status, "usado", "el tema avanza de estado");
await assert.rejects(() => setTopicStatus(target.id, "nuevo"), (error: unknown) => error instanceof RadarError && error.status === 409, "lo usado no vuelve a la bandeja de revisión");

await linkTopicToContent({ topicId: target.id, contentItemId: "pieza", format: "carousel" });
await linkTopicToContent({ topicId: target.id, contentItemId: "pieza", format: "carousel" });
assert.equal((await topicContentItems(target.id)).length, 1, "ligar dos veces la misma pieza no duplica");

/* ------------------------- Fallos que no tumban ------------------------- */

let attempt = 0;
const flakyFetch = (async (_url: string, init?: RequestInit) => {
  const parsed = JSON.parse(String(init?.body ?? "{}")) as { tools?: unknown[] };
  if (parsed.tools) {
    attempt += 1;
    // El primer vertical se cae; el segundo responde.
    if (attempt === 1) return new Response(JSON.stringify({ error: { message: "Se agotó la cuota" } }), { status: 429 });
    return new Response(JSON.stringify({ output_text: "Notas", usage: { input_tokens: 10, output_tokens: 10 }, output: [{ type: "web_search_call" }] }));
  }
  return new Response(JSON.stringify({ output_text: JSON.stringify({ topics: [topicFor("Tema totalmente distinto sobre facturación", "Automatización")] }), usage: { input_tokens: 10, output_tokens: 10 } }));
}) as unknown as typeof fetch;

const partial = await scanRadar({}, { request: flakyFetch, now: new Date("2026-08-20T10:00:00.000Z") });
assert.equal(partial.run.status, "completed", "un vertical caído no tumba la corrida");
assert.equal(partial.summary.failedVerticals.length, 1, "se informa de qué vertical falló");
assert.match(partial.run.error ?? "", /Ciberseguridad/, "la corrida deja constancia del fallo aunque termine bien");
assert.equal(partial.summary.kept, 1, "lo que sí se pudo investigar se aprovecha");

const runs = await listRadarRuns();
assert.equal(runs.length, 5, "todas las corridas quedan registradas");

/* ------------------- Elegir el modelo en cada corrida ------------------- */

const antesDeElegir = calls.length;
const elegido = await scanRadar(
  { researchModel: "modelo-elegido", structuringModel: "modelo-elegido" },
  { request: fakeFetch, now: new Date("2026-08-19T09:00:00.000Z") },
);
assert.match(calls[antesDeElegir].body, /modelo-elegido/, "la corrida puede fijar su modelo de investigacion");
assert.match(calls.at(-1)!.body, /modelo-elegido/, "y el de estructuracion");
// El importe tiene que salir del modelo que se uso de verdad, no del configurado por defecto:
// registrar un gasto con otra tarifa haria que el historico mintiera.
assert.equal(elegido.run.cost?.missing.length, 0, "la corrida con modelo elegido queda tarifada");
assert.ok((elegido.run.cost?.amount ?? 0) > 0, "y con importe mayor que cero");

/* ------------- Reinterpretar sin volver a buscar (data cruda) ------------- */

const { restructureRun } = await import("./radar-scan.ts");
const primeraCorrida = (await listRadarRuns()).find((item) => item.id === first.run.id)!;
assert.equal(primeraCorrida.research.length, 2, "la corrida guarda las notas crudas de cada vertical");
assert.match(primeraCorrida.research[0].notes, /Notas de/, "y guarda el texto tal cual lo devolvió el modelo");

const antesDeReinterpretar = calls.length;
const reinterpretado = await restructureRun(first.run.id, { minSources: 1 }, { request: fakeFetch, now: new Date("2026-08-20T12:00:00.000Z") });
assert.equal(calls.length, antesDeReinterpretar + 1, "reinterpretar cuesta UNA llamada: no vuelve a buscar");
assert.equal(calls.at(-1)!.tools, false, "y esa llamada no lleva la herramienta de búsqueda");
assert.equal(reinterpretado.cost?.amount, 0.0062, "solo se paga la estructuración, con la tarifa del modelo barato");
assert.equal(reinterpretado.summary.repeated, 2, "los temas que ya existían no se duplican");

const original = (await listRadarRuns()).find((item) => item.id === first.run.id)!;
assert.equal(original.cost?.amount, 0.0827, "reinterpretar no reescribe lo que costó la corrida original");

await assert.rejects(
  () => restructureRun(partial.run.id.replace(/.$/, "z"), {}, { request: fakeFetch }),
  (error: unknown) => error instanceof RadarError && error.status === 404,
  "reinterpretar una corrida inexistente falla claro",
);

/* --------------------- Freno de presupuesto (D-10) --------------------- */

process.env.COST_BUDGET_MONTHLY = "0.0001";
const antes = calls.length;
const frenada = await scanRadar({ automatic: true }, { request: fakeFetch, now: new Date("2026-08-21T10:00:00.000Z") });
assert.equal(frenada.run.status, "skipped", "la corrida automática no arranca con el presupuesto agotado");
assert.equal(calls.length, antes, "y sobre todo: no llama a la API, que es de lo que se trata");
assert.match(frenada.run.error ?? "", /Presupuesto del mes agotado/, "queda registrado por qué no corrió");

const manual = await scanRadar({}, { request: fakeFetch, now: new Date("2026-08-22T10:00:00.000Z") });
assert.equal(manual.run.status, "completed", "la manual sí corre: un tope que bloquea el trabajo deliberado acaba desactivado");
assert.equal(manual.summary.overBudget, true, "pero avisa de que se pasó del presupuesto");
delete process.env.COST_BUDGET_MONTHLY;

/* ------------------------ Orden de la revision ------------------------ */

const porPuntuacion = await listTopics({ sort: "score" });
const porFecha = await listTopics({ sort: "recent" });
const porAntiguedad = await listTopics({ sort: "oldest" });
assert.ok(porPuntuacion.length > 1, "hay temas suficientes para comprobar el orden");
assert.deepEqual(
  porPuntuacion.map((t) => t.score),
  [...porPuntuacion.map((t) => t.score)].sort((a, b) => b - a),
  "por puntuacion baja de mayor a menor",
);
assert.deepEqual(
  porFecha.map((t) => t.createdAt),
  [...porFecha.map((t) => t.createdAt)].sort().reverse(),
  "por fecha pone lo ultimo que trajo el radar primero",
);
// No se compara con el inverso exacto de `recent`: los temas de una misma corrida comparten
// createdAt al milisegundo y el desempate por puntuacion no se invierte con el orden.
assert.deepEqual(
  porAntiguedad.map((t) => t.createdAt),
  [...porAntiguedad.map((t) => t.createdAt)].sort(),
  "por antiguedad sube de mas viejo a mas nuevo",
);
// El ORDER BY sale de una tabla fija: un valor arbitrario cae al orden por defecto en vez de
// llegar al SQL, que es lo unico que impide una inyeccion por este camino.
const inyectado = await listTopics({ sort: "created_at; DROP TABLE radar_topics" as never });
assert.equal(inyectado.length, porPuntuacion.length, "un orden desconocido no rompe ni borra nada");

/* ---------------------- Sin verticales no hay corrida ---------------------- */

await assert.rejects(
  () => scanRadar({ verticals: ["No existe"] }, { request: fakeFetch }),
  (error: unknown) => error instanceof RadarError && error.status === 400,
  "pedir un vertical inexistente falla antes de gastar nada",
);

const total = calls.length;
await assert.rejects(() => scanRadar({ windowDays: 999 }, { request: fakeFetch }), /válida/, "una ventana imposible se rechaza");
assert.equal(calls.length, total, "una solicitud inválida no llega a llamar a la API");

/* ------------- Lo caro se guarda antes de interpretarlo ------------- */

// Buscar es el ~80% del gasto. Si la estructuración falla, la corrida termina en error, pero las
// notas ya pagadas tienen que quedar en la base: guardarlas solo al final era tirarlas justo
// cuando fallaba, y con ellas la única forma barata de recuperar la corrida.
const estructuracionRota = (async (_url: string, init?: RequestInit) => {
  const parsed = JSON.parse(String(init?.body ?? "{}")) as { tools?: unknown[] };
  if (parsed.tools) {
    return new Response(JSON.stringify({
      output_text: "Notas caras de ejemplo.com",
      usage: { input_tokens: 100, output_tokens: 10 },
      output: [{ type: "web_search_call" }, { type: "message", content: [{ type: "output_text", text: "Notas", annotations: [{ type: "url_citation", url: "https://ejemplo.com/uno", title: "Fuente" }] }] }],
    }));
  }
  return new Response(JSON.stringify({ error: { message: "El modelo de estructuración se cayó" } }), { status: 500 });
}) as unknown as typeof fetch;

await assert.rejects(() => scanRadar({}, { request: estructuracionRota, now: new Date("2026-08-23T10:00:00.000Z") }), "si la estructuración falla, la corrida falla");
const rota = (await listRadarRuns({ limit: 1 }))[0]!;
assert.equal(rota.status, "failed", "y queda registrada como fallida");
assert.equal(rota.research.length, 2, "pero las notas de investigación sobreviven: ya estaban pagadas");
const rescatada = await restructureRun(rota.id, { minSources: 1 }, { request: fakeFetch, now: new Date("2026-08-23T11:00:00.000Z") });
assert.ok(rescatada.summary.found > 0, "y la corrida fallida se puede reinterpretar sin volver a buscar");

/* ----------------- Una corrida a la vez, y ninguna colgada ----------------- */

const colgada = await beginRadarRun({ verticals: ["Ciberseguridad"], windowDays: 7 });
const durante = calls.length;
await assert.rejects(
  // Con la hora real: el barrido de corridas colgadas mide desde que empezaron, y una recién
  // abierta no es una colgada.
  () => scanRadar({}, { request: fakeFetch, now: new Date() }),
  (error: unknown) => error instanceof RadarError && error.status === 409,
  "con una corrida viva, la segunda no arranca: buscar dos veces lo mismo se paga dos veces",
);
assert.equal(calls.length, durante, "y sobre todo no llama a la API");

// Un proceso que muere deja su corrida en «running» para siempre. Sin barrerlas, el cerrojo
// anterior dejaría el radar bloqueado hasta que alguien tocara la base a mano.
const despues = await scanRadar({}, { request: fakeFetch, now: new Date(Date.now() + 2 * 60 * 60 * 1000) });
assert.equal(despues.run.status, "completed", "una corrida colgada se cierra sola y deja pasar la siguiente");
const barrida = (await listRadarRuns({ limit: 50 })).find((item) => item.id === colgada.id)!;
assert.equal(barrida.status, "failed", "la colgada queda como fallida, no como eterna");
assert.match(barrida.error ?? "", /interrumpi/, "diciendo qué le pasó");

/* -------------------- Fuentes que el modelo se inventa -------------------- */

const inventaFuentes = (async (_url: string, init?: RequestInit) => {
  const parsed = JSON.parse(String(init?.body ?? "{}")) as { tools?: unknown[] };
  if (parsed.tools) {
    return new Response(JSON.stringify({
      output_text: "Solo se encontro en ejemplo.com",
      usage: { input_tokens: 10, output_tokens: 10 },
      output: [{ type: "web_search_call" }, { type: "message", content: [{ type: "output_text", text: "Notas", annotations: [{ type: "url_citation", url: "https://ejemplo.com/real", title: "Real" }] }] }],
    }));
  }
  return new Response(JSON.stringify({
    output_text: JSON.stringify({ topics: [{
      ...topicFor("Brecha inedita en proveedores de nomina", "Ciberseguridad"),
      evidence: [
        { url: "https://ejemplo.com/real", title: "Real", published_at: "2026-08-17" },
        { url: "https://periodico-inventado.com/nota", title: "Inventada", published_at: "2026-08-17" },
      ],
    }] }),
    usage: { input_tokens: 10, output_tokens: 10 },
  }));
}) as unknown as typeof fetch;

const inventado = await scanRadar({}, { request: inventaFuentes, now: new Date("2026-08-24T10:00:00.000Z") });
assert.equal(inventado.summary.unverified, 1, "un tema que cita dominios ausentes de la investigacion no pasa");
assert.equal(inventado.summary.kept, 0, "y no llega a la revision aparentando dos fuentes");
assert.equal(inventado.summary.insufficientSources, 0, "inventar fuentes se cuenta aparte de no tenerlas");

const permitiendoInventadas = await scanRadar({ verifySources: false }, { request: inventaFuentes, now: new Date("2026-08-24T11:00:00.000Z") });
assert.equal(permitiendoInventadas.summary.kept, 1, "la comprobacion se puede apagar para ver que esta tirando");
const conSinComprobar = permitiendoInventadas.topics[0]!;
assert.deepEqual(conSinComprobar.evidence.map((item) => item.verified), [true, false], "pero la fuente queda marcada como no comprobada");

/* ------------- El vertical sale de las fuentes, no del primero ------------- */

const etiquetaEquivocada = (async (_url: string, init?: RequestInit) => {
  const body = String(init?.body ?? "{}");
  const parsed = JSON.parse(body) as { tools?: unknown[] };
  if (parsed.tools) {
    // Cada vertical trae dominios propios: es lo que permite reconocer de cual salio un tema.
    const host = body.includes("Vertical a vigilar: Automatizaci") ? "flujos.dev" : "seguridad.dev";
    return new Response(JSON.stringify({
      output_text: `Notas de ${host}`,
      usage: { input_tokens: 10, output_tokens: 10 },
      output: [{ type: "web_search_call" }, { type: "message", content: [{ type: "output_text", text: "Notas", annotations: [{ type: "url_citation", url: `https://${host}/nota`, title: "Fuente" }] }] }],
    }));
  }
  return new Response(JSON.stringify({
    output_text: JSON.stringify({ topics: [{
      ...topicFor("Integraciones sin codigo para conciliar pagos", "Un vertical que nadie pidio"),
      evidence: [{ url: "https://flujos.dev/nota", title: "Fuente", published_at: "2026-08-17" }],
    }] }),
    usage: { input_tokens: 10, output_tokens: 10 },
  }));
}) as unknown as typeof fetch;

const clasificado = await scanRadar({ minSources: 1 }, { request: etiquetaEquivocada, now: new Date("2026-08-25T10:00:00.000Z") });
assert.equal(clasificado.summary.kept, 1, "una etiqueta inventada no tira el tema si sus fuentes lo situan");
assert.equal(clasificado.topics[0]?.vertical, "Automatización", "el tema va al vertical cuya investigacion trajo esos dominios, no al primero de la lista");

/* --------------- Lo repetido caduca: la memoria tiene ventana --------------- */

// Vetar una huella para siempre no es deduplicar, es ir olvidando verticales: un asunto que
// vuelve medio ano despues con novedades reales no podia volver a entrar nunca.
const yaGuardado = (await listTopics({ limit: 1 }))[0]!;
const mismoMedioAno = await saveTopics(
  [{ ...yaGuardado, id: "tema-reincidente" }],
  { now: new Date(Date.parse(yaGuardado.createdAt) + 9 * 7 * 24 * 60 * 60 * 1000) },
);
assert.equal(mismoMedioAno.inserted, 1, "pasada la ventana, un asunto que reaparece vuelve a entrar");
const dentroDeVentana = await saveTopics([{ ...yaGuardado, id: "tema-repetido" }], { now: new Date(yaGuardado.createdAt) });
assert.equal(dentroDeVentana.inserted, 0, "dentro de la ventana sigue siendo un duplicado");

await rm(root, { recursive: true, force: true });
console.log("Radar (corrida): dos pasos, modelos separados, deduplicación entre semanas, costo por partes y fallos aislados validados.");
