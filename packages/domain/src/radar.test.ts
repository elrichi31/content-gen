import assert from "node:assert/strict";
import {
  canTransition,
  independentSources,
  dedupeTopics,
  fingerprintSubject,
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

const base = "Ransomware golpea hospitales de Colombia";
assert.equal(
  topicFingerprint(base),
  topicFingerprint("En Colombia, un hospital golpeado por ransomware"),
  "reordenar y cambiar el plural no crea un tema nuevo",
);
// Los dominios no entran en la huella: la misma historia contada la semana siguiente por otros
// medios es la misma historia. Cuando los llevaba, volvía a entrar como tema nuevo.
assert.equal(
  topicFingerprint(base),
  topicFingerprint("Ransomware golpea hospitales de Colombia"),
  "quién lo publica no cambia qué pasó: la huella no depende de las fuentes",
);
// Límite conocido y aceptado: la huella es léxica, no entiende familias de palabras. De esto se
// encarga la memoria de titulares recientes que se le pasa al modelo.
assert.notEqual(
  topicFingerprint(base),
  topicFingerprint("Ataque de ransomware a hospitales de Colombia"),
  "la derivación entre familias de palabras se le escapa a la huella",
);
assert.notEqual(
  topicFingerprint(base),
  topicFingerprint("Phishing masivo contra bancos mexicanos"),
  "temas distintos no colisionan",
);
assert.equal(topicFingerprint("Que es esto"), topicFingerprint("Que es esto"), "es determinista");
assert.equal(topicFingerprint("!!! ???"), "sin-titulo", "un titular sin palabras útiles no degenera en cadena vacía");

// Las corridas viejas guardaron `asunto|dominios`. Al comparar manda el asunto, o el histórico
// entero dejaría de reconocerse y todo volvería a entrar como nuevo.
assert.equal(fingerprintSubject("ransom-hospi|bleepingcomputer.com"), "ransom-hospi", "de una huella antigua se queda el asunto");
assert.equal(fingerprintSubject("ransom-hospi"), "ransom-hospi", "y una nueva ya es solo el asunto");
const conHistoricoViejo = dedupeTopics([{ fingerprint: "ransom-hospi" }], { known: ["ransom-hospi|bleepingcomputer.com"] });
assert.equal(conHistoricoViejo.fresh.length, 0, "un tema guardado con el formato antiguo se sigue reconociendo como repetido");

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
// Un agregador no confirma: reproduce. Tres portales sirviendo el mismo teletipo son una sola
// fuente, y contarlos como tres era la forma barata de aparentar corroboración.
assert.equal(
  independentSources([{ url: "https://news.google.com/x" }, { url: "https://www.msn.com/y" }, { url: "https://finance.yahoo.com/z" }]),
  1,
  "los agregadores cuentan todos juntos como uno",
);
assert.equal(
  independentSources([{ url: "https://news.google.com/x" }, { url: "https://medio.com/y" }]),
  2,
  "pero un medio propio más un agregador siguen siendo dos cosas distintas",
);

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
assert.equal(topic.fingerprint, topicFingerprint(topic.title), "la huella se deriva del tema ya normalizado");
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

/* --------------------- Fuentes comprobadas contra la búsqueda --------------------- */

// El paso que escribe las fuentes no busca nada: si cita un dominio que no salió de la
// investigación, se lo inventó. Y una cita inventada es peor que ninguna, porque aparenta
// corroborar justo donde el sistema mira para decidir si el tema pasa.
const conInventada = {
  ...generado,
  evidence: [
    { url: "https://www.bleepingcomputer.com/news/uno", title: "Real", published_at: "2026-08-17" },
    { url: "https://medio-que-no-existe.com/dos", title: "Inventada", published_at: "2026-08-17" },
  ],
};

const marcado = normalizeGeneratedTopic(conInventada, { runId: "r1", vertical: "Ciberseguridad", now, today, makeId, knownHosts: ["bleepingcomputer.com"] });
assert.deepEqual(marcado.evidence.map((item) => item.verified), [true, false], "cada fuente queda marcada según haya aparecido o no en la búsqueda");

const rechazado = (() => {
  try { normalizeGeneratedTopic(conInventada, { runId: "r1", vertical: "Ciberseguridad", now, today, makeId, minSources: 2, knownHosts: ["bleepingcomputer.com"] }); }
  catch (error) { return error as RadarTopicError; }
  return null;
})();
assert.ok(rechazado instanceof RadarTopicError, "con dos dominios pero uno inventado, el tema no pasa el umbral");
assert.equal(rechazado.reason, "unverified", "y el motivo lo distingue de un tema simplemente flojo");

const sinComprobar = normalizeGeneratedTopic(conInventada, { runId: "r1", vertical: "Ciberseguridad", now, today, makeId, minSources: 2 });
assert.equal(sinComprobar.evidence.every((item) => item.verified === null), true, "sin nada contra lo que comparar no se marca nada como inventado");

// La nota tampoco puede subir por una fuente que no se pudo comprobar: si contara, inventar
// fuentes seguiría siendo rentable aunque el tema no se rechace.
const conRuido = scoreTopic({ confidence: 0.9, evidence: [{ url: "https://a.com/1", publishedAt: "2026-08-17", verified: true }, { url: "https://b.com/2", publishedAt: "2026-08-17", verified: false }] }, { today });
const soloReal = scoreTopic({ confidence: 0.9, evidence: [{ url: "https://a.com/1", publishedAt: "2026-08-17", verified: true }] }, { today });
assert.equal(conRuido, soloReal, "una fuente sin comprobar no puntúa");

const flojo = (() => {
  try { normalizeGeneratedTopic({ ...generado, evidence: [{ url: "https://unico.com/a", title: "Una", published_at: "2026-08-17" }] }, { runId: "r1", vertical: "Ciberseguridad", now, today, makeId, minSources: 2 }); }
  catch (error) { return error as RadarTopicError; }
  return null;
})();
assert.equal(flojo?.reason, "insufficient-sources", "faltar fuentes e inventarlas son dos diagnósticos distintos");

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
