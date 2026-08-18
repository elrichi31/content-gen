# Plan de publicación automática

> Plan independiente de `PLAN_MAESTRO.md` (decisión del usuario, 2026-08-03). El maestro cubre la
> unificación de creación y exportación; este cubre llevar el contenido publicado a su destino.

## 1. Control del documento

| Campo | Valor |
|---|---|
| Fecha de creación | 2026-08-03 |
| Última actualización | 2026-08-03 |
| Estado general | F0 completada; F1 lista para empezar |
| Próxima tarea ejecutable | T-01 — solicitar la auditoría de TikTok (bloquea F4 y tarda semanas) |
| Relación con el maestro | ADR-007 del maestro deja la publicación automática fuera de su alcance. No se modifica: este plan la trata aparte. |

Estados permitidos: los mismos del plan maestro (`PENDIENTE`, `LISTA`, `EN_PROGRESO`, `BLOQUEADA`,
`PENDIENTE_USUARIO`, `EN_VERIFICACION`, `COMPLETADA`, `CANCELADA`).

## 2. Objetivo

Que una pieza planificada en el cronograma llegue a su plataforma sin trabajo manual de
infraestructura: ni terminal, ni copiar ficheros, ni subir a mano.

No es objetivo eliminar la decisión humana de publicar. Se elimina el trabajo mecánico, no el
criterio: alguien marca la pieza como lista y eso sigue siendo un acto deliberado.

## 3. Decisiones de arquitectura

| ID | Decisión | Estado | Motivo |
|---|---|---|---|
| D-01 | El blog se publica con un commit a `main` vía API de GitHub; git sigue siendo la fuente de verdad | `PROPUESTA` | Vercel ya despliega con cada commit. Conserva historial, diff y `revert` por artículo sin infraestructura nueva. |
| D-02 | No se migra el blog a base de datos | `PROPUESTA` | No aporta nada que haga falta hoy. **No es una decisión de SEO**: una BD tampoco quitaría URLs ni indexación. Ver §7. |
| D-03 | Publicar y despublicar se implementan juntos | `PROPUESTA` | Automatizar publicar sin automatizar deshacerlo deja el error caro sin salida rápida. |
| D-04 | Revisión humana obligatoria antes de publicar cualquier artículo generado con IA | `PROPUESTA` | Riesgo R-03: la publicación masiva sin revisión es exactamente el patrón que penaliza el buscador. |
| D-05 | El commit del artículo incluye `.md` y portada en una sola operación | `PROPUESTA` | Dos commits separados pueden desplegar el artículo sin su imagen durante un despliegue. |

## 4. Estado por plataforma

| Plataforma | Publicación automática | Qué la bloquea |
|---|---|---|
| Blog (zenlorlabs.com) | Viable ya | Nada técnico. Falta el token de GitHub. |
| Instagram | Viable con trámite | Permiso `instagram_business_content_publish` aprobado por Meta. Cuenta profesional vinculada a una página de Facebook. Revisión de 2–4 semanas. |
| TikTok | Viable con trámite | Auditoría de la app. **Sin ella, todo lo publicado queda en modo privado**: parece funcionar en pruebas y no sirve en producción. 2–4 semanas con varias rondas. |
| YouTube / LinkedIn | Sin evaluar | Fuera del alcance actual. |

Comprobar los requisitos vigentes al empezar cada fase: las condiciones de Meta y TikTok cambian
con frecuencia y lo anterior se verificó el 2026-08-03.

## 5. Fases

### F0 — Exportación manual al sitio · `COMPLETADA`

Editor de artículos, generación con IA y búsqueda web, y escritura del `.md` con su portada en el
repositorio del sitio. El commit lo hace una persona.

Evidencia: artículo exportado y leído con el `gray-matter` del propio sitio; tests de dominio,
exportador y generación en verde.

### F1 — Publicar el blog desde la app · `LISTA`

| Tarea | Descripción | Criterio de verificación |
|---|---|---|
| T-02 | `GITHUB_TOKEN` fine-grained, solo `bethalabs-site`, permiso `Contents: read and write`, en `.env.local` y validado en `check:env` | `npm run check:env` reporta el blog como configurado y falla con un token de alcance incorrecto |
| T-03 | Publicar: un único commit con `.md` + portada usando la Git Data API (blob → tree → commit → ref) | Un artículo publicado desde la app aparece en `main` como **un** commit con ambos ficheros |
| T-04 | Despublicar: commit inverso que elimina ambos ficheros | La URL devuelve 404 tras el despliegue y el artículo conserva su historial en git |
| T-05 | Registrar en el cronograma el estado `publicada` con la URL y el SHA del commit | La publicación queda trazada: se puede llegar del hueco del calendario al commit |
| T-06 | Manejo de conflictos: si el fichero cambió en remoto desde la última lectura, no pisarlo en silencio | Editar el artículo en GitHub y publicar desde la app produce un aviso, no una sobrescritura |

Gate F1: publicar y despublicar un artículo real de principio a fin sin abrir la terminal.

### F2 — Publicación programada · `PENDIENTE`

Que el hueco del cronograma dispare la publicación al llegar su hora.

| Tarea | Descripción | Criterio de verificación |
|---|---|---|
| T-07 | Comando `blog:publish-due` que publica las piezas marcadas `lista` cuya hora ya pasó | Ejecutarlo con una pieza vencida la publica; con una futura, no hace nada |
| T-08 | Programación local (Programador de tareas de Windows) | Una pieza planificada se publica sola con el equipo encendido |

**Limitación conocida y aceptada:** content-gen es una aplicación local con SQLite. Si el equipo
está apagado o suspendido a la hora prevista, no se publica nada; se publicará en la siguiente
ejecución. La publicación verdaderamente desatendida depende de F5.

### F3 — Instagram · `PENDIENTE_USUARIO`

| Tarea | Descripción | Criterio de verificación |
|---|---|---|
| T-09 | Cuenta profesional vinculada a página de Facebook y app de Meta creada | La app lista la cuenta de Instagram |
| T-10 | Solicitud de `instagram_business_content_publish` con el screencast del flujo completo | Permiso aprobado |
| T-11 | Publicación en dos pasos (contenedor de media → publicar) para imagen y carrusel | Un carrusel generado en content-gen aparece publicado en la cuenta |

Límite a respetar: 100 publicaciones por API cada 24 horas; un carrusel cuenta como una.

### F4 — TikTok · `PENDIENTE_USUARIO`

| Tarea | Descripción | Criterio de verificación |
|---|---|---|
| T-01 | **Solicitar la auditoría de la app** (primera tarea del plan: es el trámite más largo) | Solicitud enviada con acuse |
| T-12 | Mientras no esté auditada: subir a borradores del creador en vez de publicar | El video aparece en los borradores de la cuenta y se publica con un toque |
| T-13 | Publicación directa una vez auditada | Un video publicado por API es visible públicamente, no `SELF_ONLY` |

### F5 — Hospedar content-gen · `PENDIENTE`

Solo si F2 resulta insuficiente por depender del equipo encendido. Implica mover la persistencia
de SQLite local a una base de datos gestionada.

Nota: este es el único escenario donde una base de datos entra en juego, y sería **por el
hospedaje de la aplicación**, no por el blog. No confundirlo con D-02.

## 6. Orden de ejecución

Los trámites tardan semanas y el desarrollo no. Por eso no van en secuencia:

1. **Hoy:** T-01 (auditoría de TikTok) y T-09/T-10 (solicitud de Meta). Son de usuario y arrancan el reloj.
2. **En paralelo:** F1 completa.
3. **Después de F1:** F2.
4. **Cuando lleguen las aprobaciones:** F3 y F4, que ya encontrarán el cronograma funcionando.
5. **Solo si hace falta:** F5.

## 7. Nota sobre SEO

Aclaración registrada porque motivó una decisión: **el almacenamiento no afecta a la indexación**.
Con ficheros o con base de datos, cada artículo mantiene su URL `/blog/<slug>`, entra en
`src/app/sitemap.ts` y se sirve como HTML prerenderizado. D-02 no se sostiene en un argumento SEO.

Lo que sí afecta al posicionamiento, y este plan debe cuidar:

- **Calidad por encima de cantidad.** Publicar en volumen contenido generado y sin revisar es el
  patrón que el buscador penaliza como *scaled content abuse*. De ahí D-04.
- **Slugs estables.** Cambiar el slug de un artículo publicado rompe sus enlaces y su posición. Si
  hay que cambiarlo, toca redirección 301 en `vercel.json`.
- **Verificar la indexación.** Search Console ya está integrado en content-gen: sirve para
  comprobar que lo publicado se indexa de verdad, en vez de suponerlo.

## 8. Riesgos

| ID | Riesgo | Impacto | Mitigación | Estado |
|---|---|---|---|---|
| R-01 | El token de GitHub se filtra | Alto | Alcance mínimo a un repositorio y un permiso; solo en `.env.local`; rotación si se sospecha | Abierto |
| R-02 | Se publica un artículo con un error | Medio | T-04 (despublicar) y revisión previa obligatoria | Abierto |
| R-03 | Volumen de contenido generado sin revisar daña el dominio | **Alto** | D-04; ritmo del cronograma en vez de publicar todo lo que se genere | Abierto |
| R-04 | Integrar TikTok sin auditar y creer que funciona | Alto | T-01 primero; validar que una publicación de prueba es pública, no `SELF_ONLY` | Abierto |
| R-05 | El equipo apagado a la hora programada | Bajo | Aceptado en F2; se resuelve en F5 si molesta | Aceptado |
| R-06 | Meta o TikTok cambian requisitos durante el trámite | Medio | Verificar la documentación vigente al iniciar cada fase | Abierto |

## 9. Fuera de alcance

- Modificar `PLAN_MAESTRO.md` o su ADR-007.
- Migrar el blog a base de datos (D-02).
- Publicar en YouTube o LinkedIn.
- Responder comentarios o mensajes en cualquier plataforma.
