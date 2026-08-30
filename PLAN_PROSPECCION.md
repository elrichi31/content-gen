# Plan de prospección de clientes

> Plan independiente de `PLAN_MAESTRO.md`, `PLAN_PUBLICACION.md` y `PLAN_RADAR.md`. El maestro
> cubre crear las piezas; el de publicación, llevarlas a su destino; el radar, de dónde sale el
> tema. Este cubre el paso anterior a todos: **para quién se produce**, es decir, cómo se encuentra
> y se califica a quien va a pagar por el contenido.
>
> Los identificadores `D-`, `T-` y `R-` de este documento son locales a este plan y no se
> corresponden con los de los otros tres.

## 1. Control del documento

| Campo | Valor |
|---|---|
| Fecha de creación | 2026-08-30 |
| Última actualización | 2026-08-30 |
| Estado general | `PROPUESTA`. Ninguna fase implementada |
| Próxima tarea ejecutable | T-01 — unidad de costo de Places (F0) |
| Territorio inicial | La Armenia, Valle de los Chillos, Quito. Radio 8 km (§6) |
| Categoría inicial | Clínicas dentales y consultorios odontológicos |
| Control de gasto | Reutiliza el freno de presupuesto del radar (`monthSpend`), con una unidad de consumo nueva |
| Relación con los otros planes | No modifica ninguno. Consume los generadores existentes en F5; no los reemplaza |

Estados permitidos: los mismos del plan maestro (`PENDIENTE`, `LISTA`, `EN_PROGRESO`, `BLOQUEADA`,
`PENDIENTE_USUARIO`, `EN_VERIFICACION`, `COMPLETADA`, `CANCELADA`).

## 2. Objetivo

Que la aplicación encuentre negocios reales en un territorio definido, los **califique** por lo mal
que está su presencia digital, y sostenga el seguimiento comercial hasta que se cierren o se
descarten. El histórico queda consultable dentro de la aplicación, igual que el del radar.

No es objetivo que la aplicación contacte a nadie. Produce **prospectos calificados con un ángulo
de venta**; la persona decide a quién escribe y qué le dice. Esto es deliberado: ver D-01 y R-05.

Tampoco es objetivo construir un directorio de negocios. Ver D-02.

### 2.1 Cómo se mide que esto sirve

| Indicador | Por qué ese y no otro |
|---|---|
| Prospectos calificados / prospectos encontrados | Si el barrido trae 300 y solo 20 son comprables, el problema es el filtro, no la cobertura |
| Respuestas / contactos enviados | Mide si el ángulo de venta es bueno. Es lo único que separa esto de una lista comprada |
| Costo por cliente cerrado | El número que decide si el módulo se queda o se apaga |

El costo por prospecto encontrado **no** es un indicador: va a salir ridículo (§7) y eso no
significa nada. Lo caro nunca fue la lista.

## 3. Decisiones de arquitectura

| ID | Decisión | Estado | Motivo |
|---|---|---|---|
| D-01 | El scan produce prospectos revisables, nunca mensajes enviados | `PROPUESTA` | El envío automático quema el dominio de correo y convierte un error de criterio en cientos de mensajes ya entregados. Es el mismo razonamiento del D-01 del radar: la máquina propone, la persona decide. |
| D-02 | De lo que devuelve Google solo se almacena `place_id` de forma permanente. El resto de campos vive con `fetched_at` y se considera vencido a los 30 días | `PROPUESTA` | Los términos de Maps Platform permiten guardar el identificador indefinidamente pero tratan el resto como caché temporal, y prohíben usarlo para armar una base propia. Aparte del contrato, es lo correcto igual: una ficha de hace dos meses ya miente. |
| D-03 | El email, las redes y las señales de marketing salen del **sitio web del negocio**, no de Google, y se guardan sin caducidad | `PROPUESTA` | Es dato público del negocio recogido por nosotros, así que no lo alcanza D-02. Además Places no devuelve email: no hay alternativa. |
| D-04 | El descubrimiento usa `searchText` con máscara de campos Enterprise en **una sola pasada**. No hay llamada de `Place Details` por negocio | `PROPUESTA` | Teléfono, sitio, rating y número de reseñas vienen en la misma respuesta del barrido. Pedirlos con un Details por ficha son ~630 llamadas en vez de ~30 para el mismo resultado. |
| D-05 | El filtro por radio lo aplica la aplicación con distancia haversine sobre `places.location`, no la API | `PROPUESTA` | `locationBias` sesga pero no restringe: devuelve resultados fuera del círculo. Y el `locationRestriction` de `searchText` solo acepta rectángulo, que no es lo que se pidió. Filtrar en casa es exacto y gratis. |
| D-06 | Las llamadas a Places se registran como unidad propia en `usageSchema`, con su tarifa en `config/pricing.json` | `PROPUESTA` | Es el D-05 del radar aplicado aquí: ninguna de las seis unidades actuales sirve para una llamada de Places, y no registrarla la contaría como cero, que es justo el error que ese esquema existe para evitar. |
| D-07 | La puntuación se **recalcula al leer**; la guardada es la del día en que entró el prospecto | `PROPUESTA` | Misma razón que el D-17 del radar: la nota depende de datos que envejecen (reseñas, actividad en redes). Congelada, un prospecto calificado en enero sigue encabezando el tablero en junio con méritos que ya no tiene. |
| D-08 | Ganar un cliente **bloquea** a sus competidores dentro del mismo radio y categoría. El bloqueo es un estado del prospecto, no un borrado | `PROPUESTA` | Un dentista no acepta que su agencia trabaje también para la clínica de la esquina, y descubrirlo después del contrato es perder los dos. Convertir la exclusividad en dato hace que el tablero deje de ofrecer prospectos que ya no se pueden vender. |
| D-09 | La expansión es **geográfica dentro de la misma categoría** antes que cambiar de categoría | `PROPUESTA` | El segundo cliente dental es mucho más barato de cerrar que el primero de un rubro nuevo: el caso de éxito se transfiere, las plantillas se reutilizan y el argumento ya está probado. Y por D-08 el crecimiento dentro del mismo radio está topado, así que el eje natural es el mapa, no el rubro. |
| D-10 | Ningún prospecto se borra. Los descartados se conservan con su motivo | `PROPUESTA` | Son memoria negativa, igual que el D-09 del radar: sin ellos, el barrido siguiente vuelve a proponer al que ya dijo que no, y el motivo del descarte es lo que enseña a afinar el filtro. |
| D-11 | La pieza de muestra se genera **a mano** sobre un prospecto ya calificado, nunca durante el scan | `PROPUESTA` | Generar una muestra por cada ficha encontrada es pagar imágenes y tokens para gente que no va a contestar. La muestra es cara justamente porque es buena; se gasta donde hay intención de contactar. |
| D-12 | Cadenas y franquicias se detectan y se excluyen por defecto, sin borrarse | `PROPUESTA` | Deciden en una central que no está en el territorio y compran por licitación, no por mensaje. Ocupan las primeras posiciones del barrido justo por ser las más visibles, así que sin excluirlas contaminan la cabecera del tablero. |
| D-13 | Una corrida a la vez, y las que quedan colgadas se cierran solas | `PROPUESTA` | Copiado del D-16 del radar, por la misma razón: el segundo clic durante una operación lenta paga dos veces el mismo barrido. Se reutiliza `expireStaleRuns` con otro tipo de corrida. |
| D-14 | Toda baja solicitada se registra y es permanente, por encima de cualquier estado | `PROPUESTA` | Es requisito legal en la práctica (R-05) y es una columna. Volver a escribir a quien pidió no ser contactado es el único error de este módulo que no tiene arreglo. |
| D-15 | El scan distingue **clínica** de **consultorio unipersonal** y lo expone como señal, no como filtro | `PROPUESTA` | En odontología la mayoría de fichas son un profesional solo, que rara vez tiene presupuesto de agencia. Pero no siempre: filtrarlo en duro esconde al que sí. Se puntúa a la baja y se deja ver. |

## 4. Estado de partida (verificado el 2026-08-30)

| Área | Situación real |
|---|---|
| Credenciales de Google | `google-auth.ts` resuelve **service account** para Search Console y GA4. Places usa **API key**, que es otro mecanismo: no se reutiliza nada de ahí salvo la cuenta de Cloud. |
| `usageSchema` (`cost.ts`) | Seis unidades: tokens de entrada, cacheados, salida, `webSearchCalls`, `images`, `characters`. Ninguna sirve para una llamada de Places (D-06). |
| `config/pricing.json` | Tiene `models` y `tools`. No tiene sección para proveedores que cobran por llamada con niveles de campo. |
| Corridas y costos | `generation_runs`, `beginRadarRun`/`finishRadarRun`, `monthSpend` y `expireStaleRuns` ya existen y son reutilizables tal cual. |
| Patrón de corrida larga | `app/api/radar/run/route.ts` transmite progreso por *server-sent events*. El scan tarda menos, pero el enriquecimiento de F4 tarda igual: mismo patrón. |
| Tablero de revisión | `radar-board.tsx` ya resuelve listado, cambio de estado y detalle. Es el modelo de la interfaz, no un componente a compartir: los estados son otros. |
| Generadores | `carousel-generation.ts` produce carruseles a partir de una marca y un tema. Es lo que F5 necesita, sin tocarlo. |
| Crawler de sitios | **No existe.** F4 lo trae desde cero. |

## 5. Fases

### F0 — Contabilidad de Places · `PENDIENTE`

Sin esto el módulo nace sin medirse, que es el error que el D-06 del radar ya documentó.

| Tarea | Descripción | Criterio de verificación |
|---|---|---|
| T-01 | Añadir `placesCalls` a `usageSchema`, `EMPTY_USAGE` y `addUsage`, desglosado por nivel de campo (`essentials`, `pro`, `enterprise`) | `npm run test:cost` pasa; sumar dos consumos con llamadas de distinto nivel las mantiene separadas |
| T-02 | Sección `places` en `config/pricing.json` con los tres niveles y `version` nueva, con las tarifas copiadas a mano de la página de precios de Maps Platform y la fecha de verificación en el comentario | `priceUsage` devuelve importe distinto de cero para un consumo con `placesCalls`; `npm run check:env` no reporta tarifa faltante |
| T-03 | `GOOGLE_PLACES_API_KEY` en `.env.example` y en `check-env.mjs`, opcional | Sin la clave, la aplicación arranca y el resto de módulos funciona; `/prospectos` explica qué falta |

### F1 — Descubrimiento · `PENDIENTE`

| Tarea | Descripción | Criterio de verificación |
|---|---|---|
| T-04 | `packages/domain/src/prospect.ts`: esquemas de territorio, corrida y prospecto, con `fetchedAt` en los campos de Google (D-02) | `npm run test:prospect` cubre validación y valores por defecto |
| T-05 | Tablas `prospect_territories`, `prospect_runs`, `prospects` en `init-db.mjs`, con índice único sobre `place_id` | `npm run db:init` sobre base existente no destruye datos; correrlo dos veces no falla |
| T-06 | `lib/places.ts`: cliente de `searchText` con máscara explícita, paginación por `nextPageToken` y conteo de llamadas por nivel | Prueba con `fetch` simulado: tres páginas devuelven 60 fichas y reportan 3 llamadas Enterprise |
| T-07 | `lib/prospects.ts`: store, calcado de `radar.ts` | Guardar dos veces la misma ficha actualiza y no duplica |
| T-08 | `lib/prospect-scan.ts`: barrido de un territorio, varias consultas, dedup por `placeId`, cerrojo de corrida única (D-13), progreso por pasos | Una corrida real sobre el territorio de §6 devuelve fichas con teléfono y sitio, y registra su costo |
| T-09 | `app/api/prospects/scan/route.ts` con SSE, y `territories` para el ABM de zonas | El scan manual desde la interfaz muestra progreso y no se puede lanzar dos veces |

### F2 — Higiene del territorio · `PENDIENTE`

| Tarea | Descripción | Criterio de verificación |
|---|---|---|
| T-10 | Filtro haversine por radio sobre el centro del territorio (D-05) | Una ficha a 12 km del centro con radio 8 km no se guarda |
| T-11 | Detección de cadena o franquicia por repetición de nombre entre territorios y por dominio compartido (D-12) | Tres fichas con el mismo nombre en zonas distintas quedan marcadas como cadena |
| T-12 | Refresco de fichas vencidas a 30 días vía `Place Details`, solo bajo demanda (D-02) | Un prospecto con `fetchedAt` de hace 40 días se marca vencido en la lectura y se refresca al abrirlo |

### F3 — Calificación · `PENDIENTE`

Es la fase que decide si el módulo sirve. Con el territorio de §6, la lista sin filtrar es
inmanejable y sin puntuación no se distingue del resultado de buscar a mano en Maps.

| Tarea | Descripción | Criterio de verificación |
|---|---|---|
| T-13 | `scoreProspect()` puro en el dominio, con los pesos de §6.3, recalculado al leer (D-07) | Pruebas por señal: cada una mueve la nota en la dirección esperada y el total queda acotado |
| T-14 | Estados `nuevo · calificado · contactado · reunion · cliente · descartado · bloqueado · baja`, con motivo obligatorio al descartar (D-10) | Descartar sin motivo devuelve 400 |
| T-15 | `app/prospectos/page.tsx`: tablero por estado, ordenado por nota, con las señales visibles en la ficha | Se puede pasar un prospecto por todo el ciclo desde la interfaz |

### F4 — Enriquecimiento · `PENDIENTE`

| Tarea | Descripción | Criterio de verificación |
|---|---|---|
| T-16 | `lib/prospect-enrich.ts`: descarga del sitio del negocio con tiempo límite y tamaño máximo, respetando `robots.txt` | Un sitio caído marca la señal y no rompe la corrida |
| T-17 | Extracción de email, redes sociales y señales técnicas (HTTPS, responsive, fecha del último contenido) | Sobre HTML de prueba, extrae los tres grupos |
| T-18 | Comprobación de actividad en Instagram del negocio: existe y cuándo publicó por última vez | La señal distingue «sin cuenta», «cuenta muerta» y «cuenta activa» |
| T-19 | Paso opcional de IA que redacta el **ángulo de venta** del prospecto, registrado en `generation_runs` con su costo | El ángulo cita señales reales del prospecto; sin proveedor de IA, la fase se salta sin error |

### F5 — Muestra · `PENDIENTE`

| Tarea | Descripción | Criterio de verificación |
|---|---|---|
| T-20 | Acción «generar muestra» sobre un prospecto calificado, que llama a `carousel-generation.ts` con el rubro y el ángulo (D-11) | La muestra queda enlazada al prospecto y su costo atribuido |
| T-21 | Tabla puente prospecto ↔ pieza, para sumar el costo real de perseguir a cada uno | El detalle del prospecto muestra cuánto se lleva gastado en él |

### F6 — Seguimiento y expansión · `PENDIENTE`

| Tarea | Descripción | Criterio de verificación |
|---|---|---|
| T-22 | Bitácora de contactos: canal, fecha, resultado, siguiente paso | Un prospecto sin toque en 14 días aparece marcado en el tablero |
| T-23 | Baja permanente por encima de todo estado (D-14) | Un prospecto dado de baja no vuelve a aparecer en ninguna vista de trabajo ni lo revive un scan nuevo |
| T-24 | Exclusividad: al marcar cliente, los prospectos de la misma categoría dentro del radio pasan a `bloqueado` (D-08) | Marcar un cliente bloquea a sus vecinos y el motivo queda registrado |
| T-25 | Territorios nuevos según el orden de §6.4, reutilizando todo lo anterior | Un territorio nuevo se crea desde la interfaz sin tocar código |

## 6. Territorio inicial

### 6.1 Zona

| Campo | Valor |
|---|---|
| Nombre | La Armenia — Valle de los Chillos |
| Centro | ≈ `-0.290, -78.471` — **verificar con un pin en Maps antes de cargarlo**, la nota está redondeada |
| Radio | 8 000 m |
| `regionCode` | `EC` |
| `languageCode` | `es` |

Un círculo de 8 km desde ahí cubre Conocoto, San Rafael, Sangolquí y Alangasí, y llega al borde
sureste de Quito. Queda fuera Cumbayá (~10 km al norte) y Amaguaña (~10 km al sur): son las dos
teselas siguientes, no un hueco del barrido.

### 6.2 Consultas del barrido

Todas con `includedType: "dentist"` y el `locationBias` circular de §6.1. La variación del
`textQuery` no es adorno: Maps indexa por lo que el negocio escribió en su ficha, y el que se
llama «Ortodoncia Especializada» no aparece buscando «clínica dental».

```
clínica dental · odontólogo · consultorio odontológico · ortodoncista
implantes dentales · odontopediatría · endodoncia · estética dental
```

Ocho consultas × 3 páginas como máximo = **24 llamadas Enterprise en el peor caso**. En la práctica
serán menos: las consultas de nicho no llenan las 60 fichas. Dedup por `place_id` al unir.

Antes de cargar las ocho, lanzar **una sola** con máscara mínima y mirar qué `primaryType` devuelve
Google en esta zona: si aparece `dental_clinic` además de `dentist`, hay que añadirlo al
`includedType` o se pierde parte del universo.

### 6.3 Señales de calificación

Odontología es un rubro donde estas señales son inusualmente legibles, porque el paciente elige por
reseñas y porque el ticket de un implante o una ortodoncia paga muchos meses de servicio.

| Señal | Peso | Lectura |
|---|---|---|
| `rating` ≥ 4,5 con `userRatingCount` < 20 | **Muy alto** | Trabaja bien y no lo sabe nadie. Es el mejor prospecto que existe: el problema que tiene es exactamente el que vendes |
| Sitio web vivo pero Instagram muerto hace más de 3 meses | **Muy alto** | Ya entendió que lo digital importa y ya pagó por ello. No hay que convencerlo de la categoría, solo de ti |
| Sin sitio web y con más de 30 reseñas | Alto | Vive de referidos, tiene pacientes y tiene dinero. Venta más lenta: hay que educar antes de vender |
| Ficha sin fotos, o con fotos solo de usuarios | Medio | Nadie está cuidando la ficha. Es la mejora más barata que le puedes mostrar el primer día |
| Varias especialidades o varios profesionales en el sitio | Medio | Separa clínica de consultorio unipersonal (D-15): es la señal de que hay presupuesto |
| `businessStatus` distinto de `OPERATIONAL` | Excluyente | — |
| Cadena o franquicia | Excluyente por defecto (D-12) | — |

### 6.4 Orden de expansión

Por D-09, primero el mapa y después el rubro:

1. **La Armenia / Valle de los Chillos** — el territorio de §6.1.
2. **Cumbayá y Tumbaco** — perfil socioeconómico parecido, mismo argumento, cero conflicto con (1).
3. **Quito norte** (González Suárez, República del Salvador, Carolina) — odontología de ticket alto, la más difícil y la mejor pagada. Entrar aquí con dos casos de éxito del valle es otra conversación que entrar en frío.
4. **Amaguaña y sur del valle**.
5. Recién aquí, **segunda categoría**: dermatología o estética médica, que comparten regulación (R-03), tipo de contenido y estructura de ticket. La mitad del trabajo ya está hecho.

## 7. Costo esperado

| Concepto | Cantidad | Importe aproximado |
|---|---|---|
| Barrido inicial del territorio | ~24 llamadas Enterprise | Dentro de la cuota gratis mensual |
| Refresco mensual de fichas vencidas | ~150-300 Details Enterprise | Unos pocos dólares |
| Enriquecimiento (F4) | Descarga de sitios propios | 0 |
| Ángulo de venta con IA (T-19) | 1 llamada corta por prospecto calificado | Céntimos por prospecto |
| Muestra generada (F5) | 1 carrusel por prospecto que se va a contactar | Lo que ya cuesta un carrusel hoy |

**El descubrimiento es gratis en la práctica.** El gasto real de este módulo está en F4 y F5, que se
disparan a mano y solo sobre prospectos ya calificados: por eso el D-11 existe. Las tarifas de la
tabla se cargan en T-02 y se verifican en la página de precios de Maps Platform, que Google
reescribió en marzo de 2025.

## 8. Riesgos

| ID | Riesgo | Mitigación |
|---|---|---|
| R-01 | **El territorio se agota rápido.** Ocho kilómetros y un rubro son un universo finito; en semanas no queda a quién escribir | Es la razón de §6.4. La expansión no es una fase futura opcional: es lo que sostiene el módulo a partir del segundo mes |
| R-02 | **La exclusividad topa el crecimiento local** (D-08): en un radio no caben muchos clientes del mismo rubro | Asumido y convertido en dato. Es el motivo de que el eje de crecimiento sea geográfico y no de densidad |
| R-03 | **La publicidad de servicios de salud está regulada en Ecuador**, y las fotos de antes y después de un paciente exigen su consentimiento | Verificar el marco vigente de ARCSA antes de producir la primera pieza. Bien resuelto es un argumento de venta: conocer la regla es exactamente lo que su agencia actual probablemente no hace |
| R-04 | **Los términos de Places prohíben construir una base propia** con su contenido | D-02 y D-03: permanente solo el identificador, lo demás caduca, y todo lo que se guarda de verdad lo produjimos nosotros |
| R-05 | **Contacto en frío y datos personales.** Los datos de un negocio siguen siendo personales si identifican a alguien | D-14, más identificarse siempre, decir de dónde salió el contacto y ofrecer baja en cada mensaje |
| R-06 | **La mayoría de fichas son consultorios de un profesional** sin presupuesto de agencia | D-15: se puntúan a la baja y se dejan ver, en vez de filtrarlos en duro y perder a los que sí |
| R-07 | **La lista se convierte en un cementerio** de 300 prospectos que nadie trabaja | T-22: sin bitácora de seguimiento el módulo produce listas, no clientes. Es la diferencia entre esto y comprar una base |

## 9. Fuera de alcance

- Enviar mensajes, correos o WhatsApp desde la aplicación (D-01).
- Mapa visual en la interfaz. La Maps JavaScript API se cobra por carga y el tablero no lo necesita para decidir.
- Integración con un CRM externo. El pipeline de F6 es deliberadamente mínimo.
- Scraping de Maps o compra de bases a revendedores.
