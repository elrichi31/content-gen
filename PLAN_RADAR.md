# Plan del Radar de contenido y control de costos

> Plan independiente de `PLAN_MAESTRO.md` y de `PLAN_PUBLICACION.md`. El maestro cubre la creación
> y exportación; el de publicación cubre llevar lo publicado a su destino. Este cubre el paso
> anterior a ambos: **de dónde sale el tema**, y **cuánto cuesta producirlo**.
>
> Los identificadores `D-`, `T-` y `R-` de este documento son locales a este plan y no se
> corresponden con los de los otros dos.

## 1. Control del documento

| Campo | Valor |
|---|---|
| Fecha de creación | 2026-08-17 |
| Última actualización | 2026-08-18 |
| Estado general | F0 a F3 implementadas (T-01 a T-20) + T-27 adelantada; gates pendientes de ejecución real con claves |
| Próxima tarea ejecutable | T-21 — botones de generación desde el tema (F4) |
| Personalización | Perfil de negocio en Marcas y lista de vigilancia editable desde `/radar` (D-11, T-27) |
| Control de gasto | Tope de búsquedas y umbral de corroboración por corrida; freno de presupuesto activo (D-12, D-13, T-26) |
| Relación con los otros planes | No modifica ninguno. Consume los generadores existentes; no los reemplaza. |

Estados permitidos: los mismos del plan maestro (`PENDIENTE`, `LISTA`, `EN_PROGRESO`, `BLOQUEADA`,
`PENDIENTE_USUARIO`, `EN_VERIFICACION`, `COMPLETADA`, `CANCELADA`).

## 2. Objetivo

Dos objetivos que comparten la misma infraestructura de registro:

1. **Radar.** Que una ejecución semanal automática busque en la web las tendencias de los verticales
   que vende la agencia y devuelva **temas revisables**: con evidencia, fuentes fechadas y un ángulo
   editorial concreto. El histórico queda consultable dentro de la aplicación.
2. **Costos.** Saber cuánto cuesta cada cosa: un artículo, un carrusel, un video, y la investigación
   por separado. Con un tope de gasto que frene la ejecución automática, no solo un informe que se
   mira después de gastar.

No es objetivo que el radar genere contenido. Genera **temas**; la persona decide cuáles se
convierten en pieza y en qué formato. Esto es deliberado: ver D-01 y R-02.

## 3. Decisiones de arquitectura

| ID | Decisión | Estado | Motivo |
|---|---|---|---|
| D-01 | El radar produce temas, nunca piezas. La conversión a carrusel / video / artículo la dispara una persona | `PROPUESTA` | Generar piezas automáticamente llena la base de borradores que nadie publica y reproduce el riesgo R-03 de `PLAN_PUBLICACION.md` (*scaled content abuse*). |
| D-02 | Un tema puede producir varios formatos. La relación tema ↔ pieza es una tabla puente, no una columna | `PROPUESTA` | Un mismo hallazgo da carrusel **y** artículo **y** video. Con una columna se pierde la trazabilidad y no se puede sumar el costo total del tema. |
| D-03 | El costo se calcula localmente (consumo registrado × tabla de precios) y se **congela** en el registro al terminar la operación | `PROPUESTA` | La API de OpenAI devuelve tokens, no dólares. La Admin API de costos es agregada por día y por organización: no permite atribuir gasto a una pieza. Ver §7. |
| D-04 | La tabla de precios vive en configuración versionada (`config/pricing.json`), no en el código | `PROPUESTA` | Los precios cambian. Sin versión de tarifa, actualizar un precio reescribiría el significado de todo el histórico. |
| D-05 | El consumo se registra normalizado en cinco unidades, no como blob | `PROPUESTA` | Se cobran cosas distintas: tokens de entrada, tokens cacheados, tokens de salida, llamadas de `web_search` e imágenes. Contar solo tokens subestima el radar justamente donde más gasta. |
| D-06 | La contabilidad (F0/F1) se implementa **antes** que el radar | `PROPUESTA` | Hoy solo los videos registran generaciones. Si el radar va primero, nace midiéndose contra un tablero vacío y no se puede evaluar si vale lo que cuesta. |
| D-07 | La investigación de un artículo se registra como un run **separado** de su redacción | `PROPUESTA` | Es la única forma de responder «cuánto cuesta la investigación» — que es una pregunta explícita del objetivo. |
| D-08 | Los verticales vigilados viven en una tabla editable (`radar_watchlist`), no en el prompt | `PROPUESTA` | Cuando la agencia añade un servicio se añade una fila, no se toca código. |
| D-09 | Ningún tema se borra. Los descartados se conservan | `PROPUESTA` | Son memoria negativa: alimentan el prompt para que la corrida siguiente no repita lo ya rechazado. Ver R-01. |
| D-10 | El tope de presupuesto frena la corrida **automática**; la manual avisa pero procede | `PROPUESTA` | Un control de costos que solo informa no controla nada. Bloquear también lo manual convertiría el tope en un obstáculo y acabaría desactivado. |
| D-12 | Un tema exige **fuentes de medios distintos** (`minSources`, por defecto 2) para llegar a la revisión | `ACORDADA` (usuario, 2026-08-18) | Con una sola fuente no hay forma de contrastar: publicar sobre ella es fiarse de que ese medio acertó. Dos enlaces del mismo sitio no son dos confirmaciones, así que se cuentan **dominios**, no enlaces. |
| D-13 | El gasto se limita con un **tope de búsquedas por vertical** (`maxSearches`, por defecto 8), no bajando la calidad del modelo | `ACORDADA` (usuario, 2026-08-18) | Medido en la primera corrida real: de $0.99, **$0.60 fueron tokens del contenido buscado** y solo $0.18 las llamadas de búsqueda. El tope ataca la partida grande; cambiar de modelo degradaría la investigación, que es lo único que el radar aporta. |
| D-11 | El **giro del negocio** vive en la marca (`brand_kits.business`); la lista de vigilancia lo **referencia**, no lo duplica | `ACORDADA` (usuario, 2026-08-18) | Una marca ya representa un negocio, así que es su sitio natural, y lo aprovechan también los generadores. Pero *qué vigilar* cambia por su cuenta —se añaden y quitan verticales sin que el negocio cambie—, así que la vigilancia sigue siendo su propia tabla con un `brand_kit_id` nulable. Un vertical sin marca es de la agencia. |

## 4. Estado de partida (verificado el 2026-08-17)

| Área | Situación real |
|---|---|
| `generation_runs` | Solo lo usan las 5 rutas de video. `beginGenerationRun` filtra `AND type = 'video'` en el SQL: hoy es imposible registrar otra cosa. |
| Carruseles, artículos, ads | **No registran nada.** Ni consumo, ni duración, ni errores. |
| Imágenes y audio | Llaman a `finishGenerationRun` sin pasar `usage`: queda el run, no el consumo. |
| `usage` | Se guarda tal cual lo devuelve la API, como `Record<string, unknown>`. No distingue tokens cacheados ni llamadas de herramienta. |
| Búsqueda web | Ya resuelta en `article-generation.ts`: investigar (texto + `web_search`) y redactar (JSON) son dos pasos, porque la API no admite `web_search` con modo JSON. El radar reutiliza ese patrón. |
| Fuentes citadas | `webSources()` en `openai.ts` ya extrae y limpia las anotaciones `url_citation`. El radar las reutiliza tal cual. |

## 5. Fases

### F0 — Contabilidad del consumo · `EN_VERIFICACION`

Instrumentar lo que hoy no se mide. Sin esto no hay ni costos ni radar evaluable (D-06).

| Tarea | Descripción | Criterio de verificación |
|---|---|---|
| T-01 ✅ | Normalizar `usage` en el dominio: `inputTokens`, `cachedInputTokens`, `outputTokens`, `webSearchCalls`, `images`, `characters` | Tests de dominio en verde; una respuesta real de la Responses API se mapea sin campos perdidos |
| T-02 ✅ | `config/pricing.json` con precio por modelo y unidad, y `version` con fecha de vigencia | `npm run check:env` avisa si un modelo configurado no tiene precio en la tabla |
| T-03 ✅ | Cálculo de costo puro en el dominio: consumo + tarifa → `{ amount, currency, pricingVersion }` | Casos de prueba con tokens cacheados, llamadas de búsqueda e imágenes dan el importe esperado |
| T-04 ✅ | Migración de `generation_runs`: quitar `AND type = 'video'`, `content_item_id` nullable, añadir `radar_topic_id`, y columnas `operation`, `provider`, `cost_amount`, `completed_at` | Registros antiguos siguen leyéndose; se puede agrupar por operación sin abrir el `data_json` |
| T-05 ✅ | Instrumentar carruseles: `generate`, `remix`, `slides`, `image` | Generar un carrusel deja 1 run por operación con su consumo |
| T-06 ✅ | Instrumentar artículos como **dos** runs: `article-research` y `article-write` (D-07) | Un artículo con búsqueda web deja 2 runs; sin búsqueda, 1 |
| T-07 ✅ | Instrumentar ads, y completar el `usage` que hoy falta en imágenes y audio | Ninguna operación de IA queda sin consumo registrado |

Gate F0: generar una pieza de cada tipo y que las cuatro dejen consumo y costo en la base.

Evidencia (2026-08-18):

- `packages/domain/src/cost.ts` con consumo normalizado, tarifas e importes congelados;
  `config/pricing.json` con los precios **sin cargar**; `check:env` informa `pricing.status`.
- Migración 5 aplicada sobre la base real: **29 registros conservados**, `usage` reconvertido a
  las nuevas unidades, `PRAGMA foreign_key_check` limpio y `check:integrity` correcto.
- Instrumentadas las rutas de carrusel (`generate`, `remix`, `slides` ×2, `image`), artículo
  (`article-research` + `article-write`), anuncio (`generate`/`regenerate`), y completado el
  consumo que se perdía en la imagen y el audio de video.
- `trackGeneration` en `generation-runs.ts` centraliza el registro: cerrar el run nunca puede
  tapar el error real de la generación.
- Suite local 45/45, integración 4/4 (incluido el E2E de campaña, carrusel, anuncio y video),
  `typecheck` y `lint` limpios.

**El gate sigue abierto**: comprobar que las cuatro piezas dejan consumo *y* importe exige
generar de verdad con las claves configuradas (`CONTENT_GEN_AI_PROVIDER=openai`) y con la tarifa
cargada. Hasta entonces la contabilidad registra consumo pero deja el importe en nulo.

Hallazgo colateral: `scripts/run-test-suite.mjs` no ejecutaba **ningún** test desde que Node
20.12 dejó de permitir lanzar `npm.cmd` sin shell (EINVAL). La suite reportaba «fallaron todos»
sin haber corrido nada. Corregido junto a T-01, ya que bloqueaba cualquier verificación.

### F1 — Pantalla de costos · `EN_VERIFICACION`

| Tarea | Descripción | Criterio de verificación |
|---|---|---|
| T-08 ✅ | `/costs`: total del mes contra presupuesto configurable | El total coincide con la suma de los runs del período |
| T-09 ✅ | Costo promedio por operación (artículo con y sin investigación, carrusel, video) | Responde «cuánto me cuesta un video» de un vistazo |
| T-10 ✅ | Desglose por proveedor: OpenAI texto / OpenAI imagen / ElevenLabs | Los tres suman el total |
| T-11 ✅ | Piezas más caras y operaciones más lentas (`durationMs` ya se registra) | Una pieza regenerada muchas veces aparece arriba |

Gate F1: la pantalla contesta, con datos reales, cuánto cuesta cada tipo de pieza.

Evidencia (2026-08-18): tarifas de OpenAI cargadas y verificadas en la documentación oficial
(gpt-5.6-sol $5 / $0.50 / $30 por millón; gpt-image-2 $0.005 por imagen en 1024x1536 low;
`web_search` $10 por 1000 llamadas). `/costs` renderizada contra la base real: 15 operaciones de
agosto agrupadas por operación y proveedor, con medianas de duración y la pieza más cara
resuelta por título. `check:env` da `pricing.status: configured`. Suite local 46/46.

**Los importes siguen en cero** porque los 29 registros históricos son anteriores a la tarifa: se
guardaron sin importe y no se recalculan (D-03). La pantalla lo dice explícitamente («Mínimo: 15
de 15 operaciones no tienen importe») en vez de presentar el cero como gasto real. El gate se
cierra con la primera generación posterior a la tarifa.

**Falta cargar el precio de ElevenLabs** (`speech.perThousandCharacters`): su facturación es por
plan de suscripción con cuota de créditos, no una tarifa pública por carácter, así que depende del
plan contratado. Mientras tanto el audio se registra sin importe y la pantalla lo señala.

### F2 — Núcleo del radar · `EN_VERIFICACION`

| Tarea | Descripción | Criterio de verificación |
|---|---|---|
| T-12 ✅ | Dominio `radar.ts`: schemas, huella de deduplicación, puntuación, máquina de estados | Tests de dominio en verde |
| T-13 ✅ | Tablas `radar_watchlist`, `radar_runs`, `radar_topics`, `radar_topic_items` (§6) | `init-db` las crea; `check:integrity` no reporta huérfanos |
| T-14 ✅ | Investigación en dos pasos: una llamada con `web_search` **por vertical**, y una sola de estructuración a JSON sin herramientas | Una corrida sobre 4 verticales hace 4 búsquedas, no 4 por tema |
| T-15 ✅ | Propósitos de modelo separados `research` y `structuring`, con su variable de entorno | Se puede abaratar la estructuración sin tocar la investigación |
| T-16 ✅ | Deduplicación: huella + títulos de las últimas 8 semanas en el prompt + ventana temporal explícita | Dos corridas seguidas sobre el mismo vertical no devuelven los mismos temas |
| T-17 ✅ | Endpoint de corrida manual, con el consumo atribuido al run del radar | Una corrida deja su costo visible en `/costs` |

Gate F2: una corrida manual devuelve ~10 temas con fuentes fechadas, y su costo aparece en la
pantalla de costos.

Evidencia (2026-08-18): migraciones 6 y 7 aplicadas (15 tablas, `foreign_key_check` limpio,
`check:integrity` correcto); la 7 añade por fin la clave foránea de `generation_runs.radar_topic_id`
que la 5 dejó pendiente. `radar-scan.test.ts` ejerce la corrida completa con `fetch` falso y
comprueba: **una búsqueda por vertical** (no por tema), estructuración sin herramientas y con el
modelo barato, ventana temporal en el prompt, deduplicación entre corridas (segunda corrida:
0 guardados, 2 repetidos), tarifa por partes con el modelo de cada paso, un vertical caído que no
tumba la corrida, y una solicitud inválida que no llega a llamar a la API. Suite local 48/48,
integración 4/4.

**El gate sigue abierto**: hace falta una corrida real con claves para comprobar que los temas que
devuelve el modelo son utilizables, y que su costo aparece en `/costs`. Falta además poblar la
lista de vigilancia: sin verticales activos la corrida se niega a arrancar en vez de gastar.

Límite conocido y aceptado de la huella: es léxica, absorbe plural y reordenación pero no la
derivación entre familias de palabras («ataca» / «ataque»). De ese caso se encarga la memoria de
titulares recientes que se le pasa al modelo, que sí razona sobre el significado.

### F3 — Revisión de temas · `EN_VERIFICACION`

| Tarea | Descripción | Criterio de verificación |
|---|---|---|
| T-18 ✅ | `/radar`: tarjetas de tema con ángulo, evidencia, formatos sugeridos y caducidad | Un tema se entiende sin abrir las fuentes |
| T-19 ✅ | Estados `nuevo → guardado → usado`, y `descartado` (D-09) | Descartar un tema lo saca de la revisión y lo conserva en el histórico |
| T-20 ✅ | Histórico filtrable por vertical, estado y fecha de corrida | Se pueden revisar los temas de hace dos meses |

Evidencia (2026-08-18): `/radar` verificada en el navegador con datos sembrados y luego
eliminados (integridad comprobada tras la limpieza). Se comprobó: estado vacío con «Correr ahora»
deshabilitado y el aviso de que no hay verticales; tarjetas con puntuación, formatos, gancho,
fuentes con fecha relativa y el aviso de «sin fuentes verificadas»; transición `nuevo → guardado`
en vivo con los contadores actualizándose y las acciones cambiando a «Marcar usado»; sin errores
en consola. El tema no se puede editar por API: solo cambia de estado, porque es el registro de lo
que se encontró aquel día.

### F4 — Puente a los generadores · `PENDIENTE`

| Tarea | Descripción | Criterio de verificación |
|---|---|---|
| T-21 | Botones «Generar artículo / carrusel / video» que prellenan el generador existente con el ángulo y las fuentes del tema | El generador se abre con el encargo escrito, sin copiar y pegar |
| T-22 | Registrar la pieza creada en `radar_topic_items` | El tema muestra sus piezas; la pieza, su tema de origen |
| T-23 | Costo total por tema: investigación + todas sus piezas | Un tema con artículo y carrusel muestra la suma de los tres runs |

Gate F4: un tema del radar llega a artículo publicable sin escribir el encargo a mano.

### F5 — Corrida automática · `PENDIENTE`

| Tarea | Descripción | Criterio de verificación |
|---|---|---|
| T-24 | `scripts/radar-scan.mjs` con resumen por consola y `process.exitCode = 1` si falla, siguiendo el patrón de `analytics-sync.mjs` | `npm run radar:scan` funciona desde la terminal |
| T-25 | Programación local semanal (Programador de tareas de Windows), lunes temprano | Aparecen temas nuevos sin intervención |
| T-26 ✅ | Freno por presupuesto: si el mes supera el tope, la corrida automática registra un run `skipped` con el motivo y no gasta (D-10) | Bajando el tope por debajo de lo gastado, la corrida no llama a la API |
| T-27 ✅ | Edición de la watchlist desde la interfaz | Añadir un vertical cambia la corrida siguiente sin tocar código |

Aplica la misma limitación aceptada en F2 de `PLAN_PUBLICACION.md`: con el equipo apagado, la
corrida se ejecuta la próxima vez.

### F6 — Search Console como segunda fuente · `PENDIENTE`

Cruzar los temas con las consultas que ya generan impresiones sin clics: demanda probada en vez de
tendencia genérica. El campo `origin` (`"web" | "search-console"`) se incluye desde F2 aunque solo
se use `"web"`, para no migrar después.

## 6. Modelo de datos

Mismo patrón que el resto del proyecto (`id`, `schema_version`, `data_json`, `created_at`), sacando
a columna **solo lo que se filtra, ordena o deduplica** — como ya se hizo en `scheduled_posts`.

```
radar_watchlist   (id, schema_version, vertical, active, priority, brand_kit_id,
                   data_json, created_at, updated_at,
                   FOREIGN KEY (brand_kit_id) → brand_kits(id))

radar_runs        (id, schema_version, status, started_at, completed_at,
                   data_json, created_at)

radar_topics      (id, schema_version, run_id, vertical, status, score,
                   fingerprint, origin, data_json, created_at, updated_at,
                   FOREIGN KEY (run_id) REFERENCES radar_runs(id))

radar_topic_items (topic_id, content_item_id, format, created_at,
                   PRIMARY KEY (topic_id, content_item_id),
                   FOREIGN KEY (topic_id) REFERENCES radar_topics(id),
                   FOREIGN KEY (content_item_id) REFERENCES content_items(id))

INDEX idx_radar_topics_review      ON radar_topics (status, score DESC)
INDEX idx_radar_topics_fingerprint ON radar_topics (fingerprint)
```

Las fuentes de cada tema van dentro de su `data_json`; no justifican tabla propia.

### Contrato del tema

Lo que se le exige a la IA en el paso de estructuración. Se valida al normalizar: no se confía en
que lo cumpla, igual que en `normalizeGeneratedArticle`.

```jsonc
{
  "title": "…",
  "why_now": "qué ocurrió que lo hace relevante ahora",
  "vertical": "ciberseguridad",
  "evidence": [{ "url": "…", "title": "…", "published_at": "2026-08-14" }],
  "formats": [
    { "type": "carousel", "reason": "…", "hook": "primera slide" },
    { "type": "video",    "reason": "…", "hook": "primeros 3 segundos" },
    { "type": "article",  "reason": "…", "keyword": "…", "intent": "informacional" }
  ],
  "angle_for_agency": "cómo conecta con lo que vende la agencia",
  "shelf_life": "perecedero | evergreen",
  "confidence": 0.0
}
```

`formats` alimenta el prellenado de F4. `shelf_life` decide qué se publica ya y qué puede esperar.
`confidence` baja manda el tema al fondo de la revisión, no lo descarta.

## 7. Nota sobre el costo de la API

Aclaración registrada porque determina D-03: **OpenAI no devuelve el costo de una llamada**. La
Responses API devuelve consumo en tokens. Existe una Admin API de costos, pero está agregada por
día y por organización: sirve para conciliar la factura, nunca para atribuir gasto a una pieza.

Por tanto el importe se calcula aquí y se guarda con su versión de tarifa. Consecuencias:

- Los precios se cargan a mano desde la página de precios de OpenAI al crear `config/pricing.json`
  y cada vez que cambien. No hay forma automática de obtenerlos.
- Se cobran unidades distintas y hay que contarlas por separado (D-05). En particular
  **`web_search` se cobra por llamada ejecutada**, aparte de los tokens: es la línea que hace que
  el radar parezca barato si solo se cuentan tokens.
- Los **tokens cacheados** valen bastante menos que los normales. Registrarlos aparte es lo que
  permite comprobar que el prompt caching está funcionando de verdad.

### Medidas de eficiencia del radar

Por orden de impacto:

1. Una búsqueda por vertical y corrida, no por tema.
2. Modelo barato en la estructuración; el caro solo investiga (T-15).
3. Ventana temporal estricta en el prompt de investigación.
4. Tope de temas de salida (10): los tokens de salida son los caros.
5. Prompt caching — sistema y watchlist idénticos entre verticales y entre semanas, colocados al
   principio e invariables.
6. Freno duro por presupuesto (T-26).

La métrica que decide si el radar vale la pena no es el costo por corrida, sino el **costo por tema
aprobado**: si una corrida cuesta X y se aprueban 2 de 10 temas, cada idea usable cuesta X/2.

## 8. Riesgos

| ID | Riesgo | Impacto | Mitigación | Estado |
|---|---|---|---|---|
| R-01 | El radar repite los mismos temas cada semana | Alto | Triple defensa de T-16: huella, memoria de títulos recientes y ventana temporal. Los descartados (D-09) alimentan la memoria negativa. | Abierto |
| R-02 | Se produce en volumen contenido generado sin criterio | **Alto** | D-01: el radar no genera piezas. Se mantiene D-04 de `PLAN_PUBLICACION.md` (revisión humana obligatoria). | Abierto |
| R-03 | El gasto de la API se dispara sin que nadie lo note | Alto | F0/F1 antes que el radar (D-06); freno por presupuesto (T-26) | Abierto |
| R-04 | La tabla de precios queda desactualizada y el histórico miente | Medio | `pricingVersion` congelada por run (D-03/D-04); el importe pasado nunca se recalcula | Abierto |
| R-05 | El modelo devuelve tendencias genéricas en vez de hechos de la semana | Medio | Ventana temporal explícita, `evidence` con `published_at` obligatorio y `confidence` visible en la revisión | Abierto |
| R-06 | La instrumentación de F0 rompe las rutas de video que ya funcionan | Medio | La migración T-04 solo relaja restricciones y añade columnas; los registros antiguos deben seguir leyéndose | Abierto |
| R-07 | Buscar solo en español deja fuera la mitad de las fuentes de ciberseguridad | Medio | Investigar en inglés y español; redactar el tema en español | Abierto |

## 9. Orden de ejecución

1. **F0** — contabilidad. Bloquea la evaluación de todo lo demás (D-06).
2. **F1** — pantalla de costos. Tiene valor por sí sola: mide lo que ya se genera hoy.
3. **F2 → F3 → F4** — el radar, en secuencia. Cada fase deja algo utilizable.
4. **F5** — automatización, una vez que la corrida manual demuestre que los temas sirven.
5. **F6** — solo cuando haya suficiente histórico de Search Console para que aporte señal.

## 10. Fuera de alcance

- Modificar `PLAN_MAESTRO.md`, `PLAN_PUBLICACION.md` o sus decisiones.
- Generar piezas automáticamente a partir de un tema (D-01).
- Publicar lo que salga del radar: eso es competencia de `PLAN_PUBLICACION.md`.
- Fuentes de tendencias distintas de la búsqueda web y Search Console (redes sociales, herramientas
  de SEO de pago).
- Conciliación automática con la factura de OpenAI.
