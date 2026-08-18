import assert from "node:assert/strict";
import {
  canTransition,
  independentSources,
  dedupeTopics,
  normalizeGeneratedTopic,
  radarRunSchema,
  radarTopicSchema,
  radarWatchlistSchema,
  RadarTopicError,
  scoreTopic,
  topicBrief,
  topicFingerprint,
} from "./radar.ts";

const now = "2026-08-18T10:00:00.000Z";
const today = new Date("2026-08-18T10:00:00.000Z");
let counter = 0;
const makeId = () => `topic-${++counter}`;

/* ------------------------------- Esquemas ------------------------------- */

const watchlist = radarWatchlistSchema.parse({ id: "w1", schemaVersion: 1, vertical: "Ciberseguridad", offering: "Auditorías y hardening para PyMEs", createdAt: now, updatedAt: now });
assert.equal(watchlist.active, true, "un vertical nace activo");
assert.equal(watchlist.priority, 5, "prioridad media por defecto");

const run = radarRunSchema.parse({ id: "r1", schemaVersion: 1, status: "running", startedAt: now });
assert.equal(run.windowDays, 7, "la ventana por defecto es de una semana");
assert.equal(run.cost, null, "una corrida en marcha todavía no tiene importe");

/* ------------------------------- Huella ------------------------------- */

const base = { title: "Ransomware golpea hospitales de Colombia", evidence: [{ url: "https://www.bleepingcomputer.com/news/uno" }] };
assert.equal(
  topicFingerprint(base),
  topicFingerprint({ title: "En Colombia, un hospital golpeado por ransomware", evidence: [{ url: "https://bleepingcomputer.com/news/otro" }] }),
  "reordenar, cambiar el plural y cambiar de ruta en el mismo dominio no crea un tema nuevo",
);
// Límite conocido y aceptado: la huella es léxica, no entiende familias de palabras. De esto se
// encarga la memoria de titulares recientes que se le pasa al modelo.
assert.notEqual(
  topicFingerprint(base),
  topicFingerprint({ title: "Ataque de ransomware a hospitales de Colombia", evidence: [{ url: "https://bleepingcomputer.com/news/tres" }] }),
  "la derivación entre familias de palabras se le escapa a la huella",
);
assert.notEqual(
  topicFingerprint(base),
  topicFingerprint({ title: "Phishing masivo contra bancos mexicanos", evidence: [{ url: "https://www.bleepingcomputer.com/news/tres" }] }),
  "temas distintos del mismo medio no colisionan",
);
assert.equal(topicFingerprint({ title: "Que es esto" }), topicFingerprint({ title: "Que es esto" }), "es determinista");
assert.match(topicFingerprint({ title: "!!! ???" }), /sin-titulo|\|/, "un titular sin palabras útiles no degenera en cadena vacía");
assert.equal(topicFingerprint({ title: "Fuga de datos", evidence: [{ url: "no-es-una-url" }] }).includes("no-es-una-url"), true, "una URL ilegible conserva su texto en vez de perderse");

const { fresh, repeated } = dedupeTopics(
  [{ fingerprint: "a" }, { fingerprint: "b" }, { fingerprint: "a" }, { fingerprint: "c" }],
  { known: ["c"] },
);
assert.deepEqual(fresh.map((topic) => topic.fingerprint), ["a", "b"], "descarta repetidos dentro de la corrida y contra el histórico");
assert.equal(repeated.length, 2, "cuenta las repeticiones: es la señal de que la corrida aporta poco");

/* ----------------------------- Puntuación ----------------------------- */

const tres = (fechas: string[]) => fechas.map((publishedAt, index) => ({ url: `https://medio-${index}.com/nota`, publishedAt }));
const reciente = scoreTopic({ confidence: 0.9, evidence: tres(["2026-08-17", "2026-08-16", "2026-08-15"]), shelfLife: "perecedero" }, { today });
const viejo = scoreTopic({ confidence: 0.9, evidence: tres(["2026-06-01", "2026-06-02", "2026-06-03"]), shelfLife: "perecedero" }, { today });
assert.ok(reciente > viejo, "lo de ayer puntúa por encima de lo de hace tres meses");
assert.ok(reciente <= 100 && viejo >= 0, "la puntuación se mantiene entre 0 y 100");

const sinFuentes = scoreTopic({ confidence: 1, evidence: [] }, { today });
assert.ok(sinFuentes <= 25, "sin fuentes el techo es bajo por mucha confianza que declare el modelo");

const evergreenViejo = scoreTopic({ confidence: 0.9, evidence: [{ url: "https://a.com/1", publishedAt: "2026-06-01" }], shelfLife: "evergreen" }, { today });
const perecederoViejo = scoreTopic({ confidence: 0.9, evidence: [{ url: "https://a.com/1", publishedAt: "2026-06-01" }], shelfLife: "perecedero" }, { today });
assert.ok(evergreenViejo > perecederoViejo, "lo evergreen no se castiga por antiguo");

assert.ok(scoreTopic({ confidence: 0.5, evidence: [{ url: "https://a.com/1", publishedAt: null }] }, { today }) > 0, "una fuente sin fecha no invalida el tema");
assert.ok(scoreTopic({ confidence: 0.9, evidence: [{ url: "https://a.com/1", publishedAt: "2030-01-01" }] }, { today }) > 0, "una fecha futura no rompe el cálculo");

/* --------------------------- Corroboración --------------------------- */

assert.equal(independentSources([{ url: "https://www.medio.com/a" }, { url: "https://medio.com/b" }]), 1, "dos notas del mismo medio son una sola fuente");
assert.equal(independentSources([{ url: "https://medio.com/a" }, { url: "https://otro.org/b" }]), 2, "medios distintos sí corroboran");
assert.equal(independentSources([]), 0, "sin evidencia no hay fuentes");

const mismoMedio = scoreTopic({ confidence: 0.9, evidence: [{ url: "https://medio.com/a", publishedAt: "2026-08-17" }, { url: "https://medio.com/b", publishedAt: "2026-08-17" }, { url: "https://medio.com/c", publishedAt: "2026-08-17" }] }, { today });
const variosMedios = scoreTopic({ confidence: 0.9, evidence: [{ url: "https://medio.com/a", publishedAt: "2026-08-17" }, { url: "https://otro.org/b", publishedAt: "2026-08-17" }, { url: "https://tercero.net/c", publishedAt: "2026-08-17" }] }, { today });
assert.ok(variosMedios > mismoMedio, "tres enlaces del mismo sitio puntúan menos que tres medios distintos");

/* ------------------------------- Estados ------------------------------- */

assert.equal(canTransition("nuevo", "descartado"), true, "un tema nuevo se puede descartar");
assert.equal(canTransition("descartado", "guardado"), true, "un descarte por error se puede rescatar");
assert.equal(canTransition("usado", "nuevo"), false, "lo ya usado no vuelve a la bandeja de revisión");
assert.equal(canTransition("usado", "usado"), true, "reafirmar el mismo estado no es un error");

/* --------------------------- Contrato con la IA --------------------------- */

const generado = {
  title: "  Ransomware ataca hospitales de Colombia  ",
  why_now: "Tres hospitales reportaron cifrado de historiales esta semana.",
  vertical: "lo-que-diga-el-modelo",
  angle_for_agency: "Conecta con las auditorías de respaldo que vendemos.",
  evidence: [
    { url: "https://www.bleepingcomputer.com/news/uno", title: "Hospitales afectados", published_at: "2026-08-17" },
    { url: "ftp://archivo-invalido", title: "No abre", published_at: "2026-08-17" },
    { url: "https://ejemplo.com/dos", title: "Segunda fuente", published_at: "no es fecha" },
  ],
  formats: [
    { type: "CAROUSEL", reason: "Se explica bien en cinco pasos", hook: "Tu hospital ya fue escaneado" },
    { type: "podcast", reason: "No lo hacemos" },
    { type: "article", reason: "Hay demanda de búsqueda", keyword: "ransomware hospitales", intent: "informacional" },
  ],
  shelf_life: "PERECEDERO",
  confidence: 1.4,
};

const topic = normalizeGeneratedTopic(generado, { runId: "r1", vertical: "Ciberseguridad", now, today, makeId, minSources: 2 });
assert.equal(topic.vertical, "Ciberseguridad", "el vertical lo fija quien buscó, no el modelo");
assert.equal(topic.title, "Ransomware ataca hospitales de Colombia", "recorta el titular");
assert.equal(topic.status, "nuevo", "todo tema nace pendiente de revisión");
assert.equal(topic.confidence, 1, "una confianza fuera de rango se acota en vez de rechazarse");
assert.equal(topic.shelfLife, "perecedero", "normaliza la caducidad sin importar mayúsculas");
assert.equal(topic.evidence.length, 2, "descarta la fuente cuya URL no se puede abrir");
assert.equal(topic.evidence[1]?.publishedAt, null, "una fecha ilegible queda nula, no inventada");
assert.deepEqual(topic.formats.map((format) => format.type), ["carousel", "article"], "ignora formatos que la aplicación no produce");
assert.equal(topic.formats[0]?.keyword, null, "los campos que no aplican al formato quedan nulos");
assert.ok(topic.score > 0, "la puntuación la calcula el sistema");
assert.equal(topic.fingerprint, topicFingerprint({ title: topic.title, evidence: topic.evidence }), "la huella se deriva del tema ya normalizado");
assert.equal(radarTopicSchema.safeParse(topic).success, true, "el resultado cumple el esquema del sistema");

assert.throws(
  () => normalizeGeneratedTopic({ ...generado, formats: [{ type: "podcast", reason: "No lo hacemos" }] }, { runId: "r1", vertical: "Ciberseguridad", now, today, makeId }),
  RadarTopicError,
  "un tema sin ningún formato producible se rechaza",
);
assert.throws(
  () => normalizeGeneratedTopic({ title: "Corto" }, { runId: "r1", vertical: "Ciberseguridad", now, today, makeId }),
  RadarTopicError,
  "un tema incompleto se rechaza con un mensaje que dice qué falta",
);

const sinEvidencia = normalizeGeneratedTopic({ ...generado, evidence: [] }, { runId: "r1", vertical: "Ciberseguridad", now, today, makeId });
assert.ok(sinEvidencia.score <= 25, "sin umbral, un tema sin fuentes entra pero al fondo de la revisión");

// Con umbral, corroborar deja de ser una preferencia y pasa a ser requisito.
assert.throws(
  () => normalizeGeneratedTopic({ ...generado, evidence: [{ url: "https://unico.com/a", title: "Fuente única", published_at: "2026-08-17" }] }, { runId: "r1", vertical: "Ciberseguridad", now, today, makeId, minSources: 2 }),
  /solo tiene 1 fuente.+se exigen 2/,
  "un tema con un solo medio se rechaza y dice por qué",
);
assert.throws(
  () => normalizeGeneratedTopic({ ...generado, evidence: [{ url: "https://unico.com/a", title: "Una", published_at: null }, { url: "https://www.unico.com/b", title: "Otra", published_at: null }] }, { runId: "r1", vertical: "Ciberseguridad", now, today, makeId, minSources: 2 }),
  /solo tiene 1 fuente/,
  "dos enlaces del mismo medio no cuentan como corroboración",
);

console.log("Radar: esquemas, huella, deduplicación, puntuación, estados y contrato con la IA validados.");

/* --------------------- Del tema al encargo de la pieza --------------------- */

const encargo = topicBrief(topic, "carousel");
assert.equal(encargo.topic, topic.title, "el titular del tema es el tema de la pieza");
assert.match(encargo.context, /Por que ahora|Por qué ahora/, "el contexto explica por que es relevante ahora");
assert.match(encargo.context, /Angulo para la agencia|Ángulo para la agencia/, "y como conecta con lo que se vende");
assert.match(encargo.context, /bleepingcomputer.com/, "las fuentes viajan con el encargo: sin ellas la pieza sale generica");
assert.match(encargo.context, /2026-08-17/, "con su fecha, para no citar algo viejo como nuevo");
assert.equal(encargo.hook, "Tu hospital ya fue escaneado", "el gancho propuesto llega al generador");
assert.equal(encargo.keyword, null, "la keyword no aplica al carrusel");

const encargoArticulo = topicBrief(topic, "article");
assert.equal(encargoArticulo.keyword, "ransomware hospitales", "al articulo si le llega la keyword");
assert.equal(encargoArticulo.hook, null, "y no arrastra el gancho, que es de los formatos visuales");
assert.match(encargoArticulo.prompt, /Escribe sobre/, "el encargo en una sola cadena sirve para los generadores de texto libre");

// Un formato que el tema no propone sigue dando un encargo utilizable: la decision de producirlo
// es de la persona, y negarle el contexto por no haberlo sugerido la IA seria absurdo.
const noSugerido = topicBrief(topic, "video");
assert.equal(noSugerido.topic, topic.title, "un formato no sugerido tambien recibe el tema");
assert.match(noSugerido.context, /bleepingcomputer/, "y sus fuentes");
