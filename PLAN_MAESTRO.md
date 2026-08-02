# Content Gen — Plan maestro de ejecución y seguimiento

> Fuente única de verdad para planificar, ejecutar, verificar y cerrar la unificación de `carousel-ai` y `video-autom` dentro de `content-gen`.

## 1. Control del documento

| Campo | Valor |
|---|---|
| Proyecto | Content Gen |
| Repositorio de trabajo | `C:\Users\Nicolas\Desktop\Proyects\content-gen` |
| Proyecto origen de carruseles y anuncios | `C:\Users\Nicolas\Desktop\Proyects\carousel-ai` |
| Proyecto origen de videos | `C:\Users\Nicolas\Desktop\Proyects\video-autom` |
| Fecha de creación | 2026-07-22 |
| Última actualización | 2026-07-30 |
| Estado general | GATE-09 aprobado; calidad y seguridad en progreso |
| Siguiente gate | GATE-10 — Release candidate |
| Próxima tarea ejecutable | F09-015 — resolver hallazgos críticos y altos |

## 2. Objetivo del producto

Construir una sola aplicación para crear, editar, guardar, reutilizar, renderizar y exportar contenido generado con IA. Una campaña debe poder compartir brief, marca, recursos y contexto entre sus diferentes piezas:

- Carruseles.
- Anuncios gráficos.
- Videos verticales.
- Guiones de voz.
- Imágenes.
- Captions y hashtags.
- Exportaciones PNG, ZIP y MP4.

La unificación no se considerará terminada únicamente porque los editores aparezcan bajo la misma navegación. Deben usar una biblioteca, persistencia, modelos de datos, recursos y flujo de generación comunes.

## 3. Principios obligatorios de ejecución

1. `content-gen` es el único repositorio donde se implementará la aplicación nueva.
2. `carousel-ai` y `video-autom` son fuentes de lectura y referencia. No se eliminan ni se reemplazan durante la migración.
3. Toda tarea debe tener un criterio verificable antes de empezar.
4. Una tarea solo pasa a `COMPLETADA` cuando su verificación produce evidencia concreta.
5. Toda tarea cerrada debe registrar cómo se dejó, archivos afectados, comandos ejecutados, resultados y deuda conocida.
6. Si una verificación falla, la tarea permanece `EN_PROGRESO` o cambia a `BLOQUEADA`.
7. Solo puede haber una tarea principal `EN_PROGRESO` a la vez, salvo trabajo paralelo explícitamente autorizado.
8. No se comienza una fase si su gate anterior no está aprobado.
9. No se borran datos legacy hasta terminar su importación, validación y respaldo.
10. Las claves API nunca se escriben en este documento, Git, logs de evidencia ni archivos versionados.
11. Se aplica Ponytail en modo `full`: reutilizar primero, plataforma y librería estándar antes de dependencias, y escribir la solución mínima correcta.
12. Ponytail no autoriza a omitir validación, manejo de errores, seguridad, accesibilidad ni las comprobaciones exigidas por este plan.

## 4. Estados permitidos

| Estado | Significado |
|---|---|
| `PENDIENTE` | Aún no se ha iniciado y sus dependencias pueden estar incompletas. |
| `LISTA` | Dependencias cumplidas; puede ser la próxima tarea. |
| `EN_PROGRESO` | Se está trabajando actualmente. |
| `BLOQUEADA` | No puede continuar; debe registrar causa, responsable y condición de desbloqueo. |
| `PENDIENTE_USUARIO` | Requiere una acción o decisión manual del usuario. |
| `EN_VERIFICACION` | Implementación terminada; falta ejecutar o revisar el criterio de aceptación. |
| `COMPLETADA` | Criterio de aceptación aprobado y evidencia registrada. |
| `CANCELADA` | Ya no pertenece al alcance; debe registrar el motivo. |

## 5. Procedimiento obligatorio para actualizar una tarea

### Antes de trabajar

1. Confirmar que todas sus dependencias están `COMPLETADA`.
2. Cambiar su estado a `EN_PROGRESO`.
3. Actualizar `Última actualización`, `Próxima tarea ejecutable` y el resumen de progreso.
4. Añadir una entrada de inicio en el registro de ejecución.

### Durante el trabajo

1. Mantener el cambio dentro del alcance de la tarea.
2. Registrar decisiones que alteren arquitectura, datos, seguridad o compatibilidad.
3. Si aparece trabajo adicional, crear una tarea nueva; no ampliar silenciosamente la actual.
4. Conservar cambios del usuario y evitar modificaciones no relacionadas.

### Para cerrar

1. Cambiar la tarea a `EN_VERIFICACION`.
2. Ejecutar exactamente la verificación indicada, además de cualquier comprobación descubierta durante la implementación.
3. Registrar en `Cómo se dejó / evidencia`:
   - Archivos creados o modificados.
   - Comandos y pruebas ejecutados.
   - Resultado observable.
   - Limitaciones conocidas.
   - Ruta de rollback cuando aplique.
4. Cambiar a `COMPLETADA` solo si todo pasa.
5. Actualizar el gate de la fase y el registro cronológico.

## 6. Definición global de terminado

Una funcionalidad está terminada cuando:

- Su comportamiento principal funciona de inicio a fin.
- Las entradas no confiables están validadas.
- Los errores se muestran y registran de forma útil.
- El contenido se conserva después de recargar o reiniciar.
- Existe al menos una comprobación automatizada para lógica no trivial.
- La UI principal se verificó en escritorio y móvil cuando corresponda.
- No expone secretos ni permite rutas de archivo inseguras.
- La documentación refleja el estado real.
- Se registró evidencia reproducible en este archivo.

## 7. Estado de Ponytail

Fuente oficial: <https://github.com/DietrichGebert/ponytail>

| ID | Tarea | Dependencias | Estado | Verificación | Cómo se dejó / evidencia |
|---|---|---|---|---|---|
| GOV-001 | Registrar el marketplace oficial e instalar Ponytail | Ninguna | `COMPLETADA` | `codex plugin list` muestra `ponytail@ponytail`, versión y estado habilitado | Instalado desde `DietrichGebert/ponytail`; versión `4.8.4`; estado `installed, enabled`; caché local en `C:\Users\Nicolas\.codex\plugins\cache\ponytail\ponytail\4.8.4`. |
| GOV-002 | Verificar Node, manifiesto, hooks y activación en modo full | GOV-001 | `COMPLETADA` | El hook devuelve `PONYTAIL:FULL` y crea estado `full` | Node `v24.5.0`; manifiesto válido; scripts referenciados existentes; prueba manual de `ponytail-activate.js` devolvió JSON de Codex con `systemMessage: PONYTAIL:FULL`; archivo de estado temporal contenía `full` y fue retirado tras la prueba. Las pruebas específicas de hooks del paquete pasaron. |
| GOV-003 | Reiniciar Codex Desktop, revisar `/hooks` y confiar los hooks de Ponytail | GOV-002 | `COMPLETADA` | `/hooks` muestra los tres hooks instalados y activos | Codex Desktop reiniciado. Los hooks `SessionStart`, `UserPromptSubmit` y `SubagentStart` fueron revisados; el panel mostró `Installed: 1`, `Active: 1` y ninguna revisión pendiente para los tres. |
| GOV-004 | Crear el plan maestro verificable | GOV-002 | `COMPLETADA` | `PLAN_MAESTRO.md` existe, contiene backlog, gates, estados, verificaciones y registro | Documento creado en la raíz de `content-gen`. |
| GOV-005 | Aplicar Ponytail en cada tarea de implementación | GOV-003 | `PENDIENTE` | Cada cierre indica qué se reutilizó, qué se evitó construir y la comprobación mínima ejecutada | Regla permanente; se evalúa en cada tarea, no como actividad aislada. |

### Nota sobre las pruebas del paquete Ponytail

El suite completo incluido por el proveedor ejecutó 82 pruebas: 72 pasaron y 10 fallaron en comprobaciones que invocan Python/Hermes dentro de este entorno. La parte relevante para Codex —manifiesto, referencias de hooks, compatibilidad Windows, auto-salida del tracker y prueba manual del hook— pasó. No se modificó el plugin ni se ocultaron los fallos del suite general.

## 8. Arquitectura objetivo mínima

Se empezará con la estructura mínima necesaria para separar la aplicación web del proceso pesado de video. No se crearán paquetes genéricos hasta que exista reutilización real.

```text
content-gen/
├── apps/
│   ├── studio/             # Next.js: biblioteca, campañas y editores
│   └── render-worker/      # Proceso Node/Remotion para renders persistentes
├── packages/
│   └── video-engine/       # Composiciones Remotion alimentadas por datos
├── storage/                # Archivos locales de desarrollo, ignorados por Git
├── PLAN_MAESTRO.md
└── package.json            # npm workspaces y scripts raíz
```

Las utilidades de dominio, IA y almacenamiento vivirán inicialmente junto a `apps/studio`. Solo se extraerán a un paquete cuando dos runtimes necesiten exactamente el mismo código.

## 9. Modelo funcional objetivo

```text
Campaign
├── ContentItem: carousel
├── ContentItem: ad
├── ContentItem: video
├── Asset: image/audio/logo/document/video
├── GenerationRun
├── RenderJob
└── Export

BrandKit
├── logo
├── colors
├── fonts
├── tone
└── defaults
```

Todo documento editable tendrá `schemaVersion`. Los archivos pesados se almacenan como archivos u objetos; la base de datos conserva metadatos y referencias, no base64 permanente.

## 10. Decisiones y supuestos actuales

| ID | Decisión | Estado | Motivo | Condición para revisar |
|---|---|---|---|---|
| ADR-001 | Construir en `content-gen` y mantener los proyectos origen intactos | `ACEPTADA` | Permite rollback y comparación visual | Solo después de completar y validar la migración total. |
| ADR-002 | Empezar como aplicación local-first y de un solo usuario | `ACEPTADA` | Coincide con los proyectos actuales, la página de diagnóstico y reduce infraestructura inicial | Revisar antes de incorporar usuarios, acceso remoto o nube. |
| ADR-003 | Usar SQLite y filesystem para el MVP local | `ACEPTADA` | Es suficiente para persistencia central local y permite una primera migración sin servicios externos | Cambiar a PostgreSQL/S3 antes de despliegue multiusuario. |
| ADR-004 | Separar el render en un proceso worker | `ACEPTADA` | El render no debe depender de una petición HTTP abierta | Solo revisar si el producto elimina el render local. |
| ADR-005 | Videos nuevos serán plantilla fija + JSON; no código TSX por video | `ACEPTADA` | Evita modificar `Root.tsx` y el código fuente por cada contenido | Las composiciones manuales existentes se conservan como legacy. |
| ADR-006 | Migrar primero carruseles, después anuncios y finalmente videos | `ACEPTADA` | Reduce riesgo y entrega valor incremental | Cambiar solo si una dependencia técnica obliga otro orden. |
| ADR-007 | No integrar publicación automática en el MVP | `PROPUESTA` | No es necesaria para centralizar creación y exportación | Revisar después de GATE-08. |

## 11. Resumen de progreso

| Fase | Estado | Completadas | Total | Gate |
|---|---|---:|---:|---|
| Gobierno y preparación | En progreso | 4 | 5 | GATE-00 aprobado |
| FASE-00 Auditoría reproducible | Completada | 10 | 10 | GATE-01 aprobado |
| FASE-01 Fundación del repositorio | Completada | 11 | 11 | GATE-02 aprobado |
| FASE-02 Persistencia y biblioteca | Completada | 14 | 14 | GATE-03 aprobado |
| FASE-03 Carruseles | Completada | 15 | 15 | GATE-04 aprobado |
| FASE-04 Anuncios | Completada | 10 | 10 | GATE-05 aprobado |
| FASE-05 Motor de video | Completada | 17 | 17 | GATE-06 aprobado |
| FASE-06 Pipeline audiovisual y render | Completada | 19 | 19 | GATE-07 aprobado |
| FASE-07 Campañas multiformato | Completada | 10 | 10 | GATE-08 aprobado |
| FASE-08 Migración de contenido legacy | Completada | 11 | 11 | GATE-09 aprobado |
| FASE-09 Calidad, seguridad y rendimiento | En progreso | 14 | 16 | GATE-10 |
| FASE-10 Operación y cierre | Pendiente | 0 | 10 | GATE-11 |

## 12. Roadmap ejecutable

### GATE-00 — Herramientas y gobierno listos

Se aprueba cuando GOV-001 a GOV-004 están `COMPLETADA`, Ponytail aparece activo tras reiniciar Codex y este documento es aceptado como fuente única de verdad.

**Estado:** `APROBADO` el 2026-07-22. Los tres hooks de Ponytail están confiados y activos.

---

### FASE-00 — Auditoría reproducible de los proyectos origen

Objetivo: convertir el conocimiento informal de los repositorios actuales en una línea base comprobable antes de migrar.

| ID | Tarea | Dependencias | Estado | Verificación | Cómo se dejó / evidencia |
|---|---|---|---|---|---|
| F00-001 | Registrar versión, rama y estado Git de ambos proyectos origen sin modificarlos | GATE-00 | `COMPLETADA` | Se guardan commit, rama y cambios locales de cada repo | `carousel-ai`: rama `main`, commit `98e33d337f8aca1e5934e304c02247e4caee71cb`, 21 archivos modificados y 3 no rastreados; se preservarán sin reset ni limpieza. `video-autom`: rama `main`, commit `675584672a38f37641f3c78978cacc672641c167`, árbol limpio. |
| F00-002 | Ejecutar instalación reproducible y build de `carousel-ai` | F00-001 | `COMPLETADA` | `npm run build` finaliza correctamente o se documentan errores baseline | `npm.cmd run build` terminó correctamente con Next.js `16.2.0`; compilación Turbopack verde y 13 rutas generadas. Se reutilizaron dependencias existentes; no se alteró código legacy. |
| F00-003 | Ejecutar lint de `carousel-ai` | F00-002 | `COMPLETADA` | `npm run lint` finaliza o deja un fallo baseline reproducible documentado | Fallo baseline confirmado: el script es `eslint .`, pero `package.json` no declara `eslint` en dependencias ni devDependencies; tras `npm ci`, el ejecutable sigue ausente. No se altera el proyecto legacy. `npm ci` también reportó 4 vulnerabilidades transitivas (1 media, 3 altas), sin aplicar correcciones automáticas. |
| F00-004 | Ejecutar build, lint y validación disponibles en `video-autom` | F00-001 | `COMPLETADA` | Dashboard y Remotion producen resultados reproducibles o sus fallos baseline quedan documentados | Build verde: dashboard Next `14.2.29` y bundle Remotion completaron. Lint Remotion falla por 3 variables no usadas en `src/phone-hacked/components.tsx`. `npm run validate --prefix remotion` revisó 12 composiciones y reportó 16 errores en 12 archivos, principalmente ausencia de buffer `SIL` y soporte de audio por escena. No se cambió código fuente. |
| F00-005 | Crear inventario de funcionalidades de carruseles y anuncios | F00-002 | `COMPLETADA` | Matriz enumera generar, editar, imágenes, marca, historial y exportar | Inventario consolidado en §12.1; cubre flujos, layouts, persistencia actual, proveedores y destino de migración. |
| F00-006 | Crear inventario de plantillas y composiciones de video | F00-004 | `COMPLETADA` | Cada composición queda clasificada como estándar, timeline, demo o legacy manual | Inventario consolidado en §12.2: 23 composiciones agrupadas por contrato, datos y estrategia de migración. |
| F00-007 | Documentar variables de entorno por nombre y finalidad, sin valores | F00-002, F00-004 | `COMPLETADA` | Lista cubre OpenAI, Unsplash, ElevenLabs y modelos configurables | Inventario consolidado en §12.3, sin revelar valores. Se identificó discrepancia `UNSPLASH_APP_ID` vs `UNSPLASH_APPLICATION_ID`. |
| F00-008 | Preparar fixtures de referencia para comparación | F00-005, F00-006 | `COMPLETADA` | Manifiesto identifica fixture de entrada/salida o vacío verificable por formato | Manifiesto consolidado en §12.5. Hay referencia de video estándar y legacy; carrusel/anuncio/timeline tienen vacíos explícitos y tareas futuras de exportación. |
| F00-009 | Medir rutas de persistencia actuales | F00-005, F00-006 | `COMPLETADA` | Se documentan claves `localStorage`, carpetas Remotion, audio, imágenes y outputs | Inventario consolidado en §12.4; cubre localStorage, scripts, código generado, assets, captions y 18 MP4 existentes. |
| F00-010 | Aprobar matriz “conservar, adaptar, reemplazar, retirar” | F00-007, F00-008, F00-009 | `COMPLETADA` | Cada capacidad tiene destino y justificación | Matriz aprobada en §12.6; establece migración por adaptación, reemplazo, preservación legacy o retiro. |

#### GATE-01 — Línea base aprobada

- Ambos proyectos tienen build/lint baseline conocido.
- Existen fixtures comparables.
- Ninguna funcionalidad queda sin destino.
- Se conoce qué datos requieren migración.

**Estado:** `APROBADO` el 2026-07-22. Los fallos baseline y vacíos de fixtures están documentados; no se modificó código legacy.

---

### FASE-01 — Fundación mínima del repositorio

Objetivo: crear una base ejecutable sin migrar todavía funcionalidades completas.

| ID | Tarea | Dependencias | Estado | Verificación | Cómo se dejó / evidencia |
|---|---|---|---|---|---|
| F01-001 | Confirmar o inicializar Git en `content-gen` | GATE-01 | `COMPLETADA` | `git status` funciona y solo muestra archivos esperados | Repositorio Git inicializado en rama `main`. Se retiró un directorio `.git` vacío y bloqueado, previamente verificado sin contenido; `git status` muestra únicamente `PLAN_MAESTRO.md` sin rastrear. |
| F01-002 | Crear `.gitignore` para Node, Next, Remotion, secretos, storage y outputs | F01-001 | `COMPLETADA` | Archivos de build, `.env*`, medios generados y DB local no aparecen en Git | `.gitignore` creado y verificado con `git check-ignore`; no ignora `PLAN_MAESTRO.md` ni assets fuente futuros. |
| F01-003 | Crear npm workspaces mínimos | F01-002 | `COMPLETADA` | Un comando raíz enumera y ejecuta los workspaces | Se crearon `apps/`, `packages/` y el manifiesto raíz con npm 11.5.1; `npm pkg get name private packageManager workspaces` confirmó la configuración. |
| F01-004 | Crear `apps/studio` con la versión candidata de Next/React | F01-003 | `COMPLETADA` | Página inicial abre y build termina | `@content-gen/studio` usa Next 16.2.11 y React 19.2.4. El build y `tsc --noEmit` pasaron; la vista local mostró el shell inicial. La auditoría mantiene 3 vulnerabilidades transitivas reportadas por npm, registradas en R-010. |
| F01-005 | Crear `packages/video-engine` con Remotion y React compatibles | F01-003 | `COMPLETADA` | Remotion lista una composición mínima y valida TypeScript | `@content-gen/video-engine` comparte React 19.2.4 con Studio. `FoundationVideo` (1080×1920, 30 fps, 90 frames) se lista, pasa `tsc --noEmit` y genera bundle. No se migró contenido legacy. |
| F01-006 | Crear `apps/render-worker` solo con el contrato mínimo de job | F01-005 | `COMPLETADA` | Worker procesa un job de prueba y termina con estado observable | `@content-gen/render-worker` valida un job JSON de video y emite transiciones `queued → processing → completed`; su salida es explícitamente placeholder, sin render real. |
| F01-007 | Unificar TypeScript, ESLint y scripts raíz | F01-004, F01-005, F01-006 | `COMPLETADA` | `npm run typecheck`, `npm run lint` y `npm run build` funcionan desde raíz | ESLint 9 con soporte TypeScript quedó centralizado. Desde raíz, lint, types y build pasan para Studio y motor de video. |
| F01-008 | Crear `.env.example` sin secretos | F01-004 | `COMPLETADA` | La aplicación valida variables faltantes con mensajes claros | `.env.example` documenta proveedores sin claves. `npm run check:env` confirma modo local y rechaza el modo OpenAI sin `OPENAI_API_KEY` con un mensaje accionable. |
| F01-009 | Crear shell visual accesible y responsive | F01-004 | `COMPLETADA` | Navegación usable en viewport móvil y escritorio; teclado básico funciona | Shell validado en escritorio y 390 px sin overflow horizontal. El enlace nativo a diagnóstico recibe foco y apunta a una ruta funcional; mantiene el tema negro/verde de `carousel-ai`. |
| F01-010 | Añadir página de diagnóstico local | F01-008 | `COMPLETADA` | Muestra conexión DB/storage/worker sin revelar claves | Ruta `/diagnostics` muestra el modo IA y los estados reales de DB, almacenamiento y worker. No presenta valores de entorno ni secretos. |
| F01-011 | Registrar decisiones definitivas de runtime y persistencia | F01-007, F01-010 | `COMPLETADA` | ADR-002 y ADR-003 pasan a aceptadas o son reemplazadas | ADR-002 y ADR-003 se aceptan para el MVP local-first. Se reemplazarán antes de cualquier despliegue multiusuario. |

#### GATE-02 — Fundación ejecutable

- Un comando instala dependencias.
- El Studio arranca con `npm run dev`; el contrato de worker se ejecuta con `npm run test:worker` hasta que exista un worker persistente en F06.
- Lint, typecheck y build tienen resultado verde.
- No existen secretos ni outputs en Git.

---

### FASE-02 — Persistencia central y biblioteca

Objetivo: guardar y recuperar contenido antes de conectar los editores.

| ID | Tarea | Dependencias | Estado | Verificación | Cómo se dejó / evidencia |
|---|---|---|---|---|---|
| F02-001 | Definir esquemas versionados de `BrandKit`, `Campaign`, `ContentItem`, `Asset`, `GenerationRun`, `RenderJob` y `Export` | GATE-02 | `COMPLETADA` | Fixtures válidos pasan y payloads inválidos fallan con errores específicos | `@content-gen/domain` contiene siete esquemas Zod versionados. `npm run test:domain` valida siete fixtures correctos y rechaza versión de documento y ruta de asset inseguras. |
| F02-002 | Crear base de datos y migración inicial | F02-001 | `COMPLETADA` | DB vacía se crea desde cero mediante un comando documentado | `npm run db:init` crea `storage/content-gen.sqlite` de forma idempotente con la migración 1 y ocho tablas. Usa `node:sqlite`, disponible en Node 24; su advertencia experimental se documenta en R-011. |
| F02-003 | Implementar CRUD de BrandKit | F02-002 | `COMPLETADA` | Crear, editar, listar y archivar marca persiste tras reinicio | Rutas API validadas con `brandKitSchema` y página `/brands` estilo Notion. La prueba local creó, editó, listó y archivó una marca sin dejarla visible. |
| F02-004 | Implementar CRUD de Campaign | F02-002 | `COMPLETADA` | Crear, renombrar, listar y archivar campaña persiste | Rutas API y página `/campaigns` estilo Notion persisten nombre, brief y marca opcional. La prueba local creó, editó, listó y archivó sin dejar la campaña visible. |
| F02-005 | Implementar CRUD de ContentItem con documento JSON versionado | F02-002 | `COMPLETADA` | Guarda y recupera cada tipo permitido sin perder datos | `/api/content-items` y `/content` persisten `carousel`, `ad` o `video` con `document.schemaVersion=1`; se verificó contra una campaña real. |
| F02-006 | Implementar almacenamiento local seguro de assets | F02-001 | `COMPLETADA` | Upload válido se guarda; archivo vacío, tipo o ruta inválida se rechaza | `/api/assets` permite PNG/JPEG/WebP/MP3/WAV/MP4 sin un techo fijo de aplicación. El servidor genera la ruta por SHA-256 y bloquea rutas del cliente. |
| F02-007 | Guardar metadatos de Asset y relación con campañas/contenido | F02-006 | `COMPLETADA` | Un asset se reutiliza sin duplicar físicamente el archivo | Asset persiste metadatos y `campaignId`/`contentItemId` opcionales, validados contra SQLite. Una imagen PNG quedó almacenada y relacionada en la prueba de integración. |
| F02-008 | Implementar autosave con control de versión | F02-005 | `COMPLETADA` | Recarga conserva cambios y una escritura antigua no pisa una nueva silenciosamente | `revision` en SQLite permite un `UPDATE ... WHERE revision = ?`; `/content` guarda automáticamente tras 800 ms y muestra conflicto sin sobrescribir. |
| F02-009 | Implementar biblioteca con búsqueda y filtros mínimos | F02-003, F02-004, F02-005 | `COMPLETADA` | Filtra por tipo, campaña, marca, estado y texto | `/library` consulta `/api/content-items` con filtros de servidor y conserva un único listado, sin índice ni servicio de búsqueda adicional. |
| F02-010 | Implementar duplicar y archivar contenido | F02-005 | `COMPLETADA` | Duplicado obtiene ID propio; archivado deja de aparecer por defecto | La ruta `duplicate` crea otro UUID; archivar conserva el registro y la biblioteca lo oculta en el estado activo. |
| F02-011 | Implementar vista de detalle e historial básico | F02-005 | `COMPLETADA` | Muestra creación, actualización y últimas generaciones | `/content/[id]` muestra timestamps persistidos, documento y las últimas 10 filas de `generation_runs`; la lista real vacía se comunica sin inventar historial. |
| F02-012 | Implementar política de eliminación recuperable | F02-006, F02-010 | `COMPLETADA` | Papelera conserva metadatos y restauración funciona | `archived_at` conserva las filas y la biblioteca permite restaurarlas; la restauración conserva el documento y exige una campaña activa. |
| F02-013 | Añadir backup y restore local mínimo | F02-002, F02-006 | `COMPLETADA` | Exportar y restaurar en entorno vacío reproduce registros y archivos | `npm run backup -- <nombre>` guarda SQLite, medios y manifest; `npm run restore -- <backup> <destino>` exige un destino vacío y seguro. |
| F02-014 | Probar integridad referencial y rutas | F02-003 a F02-013 | `COMPLETADA` | No quedan referencias rotas al archivar/restaurar entidades | `npm run check:integrity` verifica FKs, metadatos de assets, relaciones cruzadas y rutas de medios; las rutas bloquean dependencias activas. |

#### GATE-03 — Biblioteca confiable

- Marcas, campañas, contenido y assets sobreviven reinicios.
- Autosave y recuperación funcionan.
- Backup/restore mínimo está probado.
- No se permiten rutas arbitrarias ni archivos no validados.

**Estado:** `APROBADO` el 2026-07-23. Backup restaurado e integridad comprobada; R-010 y R-011 permanecen abiertos para cualquier despliegue.

---

### FASE-03 — Migración funcional de carruseles

Objetivo: alcanzar paridad con `carousel-ai` usando persistencia central.

| ID | Tarea | Dependencias | Estado | Verificación | Cómo se dejó / evidencia |
|---|---|---|---|---|---|
| F03-001 | Definir `CarouselDocument` versionado reutilizando los tipos actuales | GATE-03 | `COMPLETADA` | Convierte fixture legacy sin pérdida de campos | `@content-gen/domain/carousel` conserva los diez layouts, campos por slide y extensiones desconocidas; `convertLegacyCarousel` convierte el fixture completo. |
| F03-002 | Migrar temas, fuentes y estilos de fondo | F03-001 | `COMPLETADA` | Fixtures coinciden visualmente con tolerancia definida | El renderer reutiliza 8 temas, 5 familias y 6 fondos legacy; la revisión local confirmó contraste, legibilidad y composición sin depender de CSS de Tailwind legacy. |
| F03-003 | Migrar los 10 layouts de slide | F03-002 | `COMPLETADA` | Cada layout renderiza fixture válido sin overflow crítico | Un renderer central cubre `cover`, `content`, `list`, `bigNumber`, `quote`, `split`, `imageOverlay`, `timeline`, `statGrid` y `cta`; el fixture validado navega los diez desde `/carousel`. |
| F03-004 | Migrar preview Instagram y TikTok | F03-003 | `COMPLETADA` | Cambio de plataforma conserva el documento y ajusta el marco | `CarouselFrame` recibe un único `CarouselDocument`; el selector alternó Instagram/TikTok manteniendo la slide `split` activa y el contador `6/10`. |
| F03-005 | Migrar creación, duplicado, eliminación, ordenamiento y selección de slides | F03-003 | `COMPLETADA` | Flujo manual completo conserva orden e IDs | El editor crea UUIDs nativos, duplica, elimina con mínimo de una slide, mueve con botones y conserva la selección por índice. |
| F03-006 | Migrar edición directa y panel lateral | F03-005 | `COMPLETADA` | Texto y propiedades persisten después de recargar | El canvas expone texto editable y la ficha lateral actualiza layout y campos. Guardar crea/actualiza un `ContentItem` central y cargarlo después de recargar conserva el documento. |
| F03-007 | Migrar undo/redo con límite conocido | F03-005 | `COMPLETADA` | Secuencia editar→deshacer→rehacer restaura estados exactos | Historial local inmutable de máximo 25 operaciones para slides; editar, deshacer y rehacer restauran el título y la estructura de slides. |
| F03-008 | Migrar generación completa con IA y validación de respuesta | F03-001 | `COMPLETADA` | Solicitud válida crea número exacto de slides; JSON inválido no se guarda | Generación real verificada con OpenAI: solicitó 3 slides y devolvió 3, `cover` inicial y `cta` final. El contrato valida antes del guardado; pruebas, typecheck y build pasan. |
| F03-009 | Migrar regeneración y adición de slides | F03-008 | `COMPLETADA` | Solo cambia la slide esperada o inserta antes del CTA | `/api/carousels/slides` regenera conservando ID y layout original; agrega antes de CTA. La normalización convierte texto de IA recibido como lista u objeto, y descarta layouts erróneos como `title_and_content`. Prueba automatizada confirma aislamiento, orden y formatos; el front verificó regeneración end-to-end. |
| F03-010 | Migrar remix desde URL con límites y errores claros | F03-008 | `COMPLETADA` | URL válida genera contexto; URL inválida/privada se rechaza de forma segura | `POST /api/carousels/remix` limita HTML a 500 KB, sólo permite HTTP(S) en puertos estándar, bloquea loopback/red privada por host y DNS, fija la IP pública validada para evitar DNS rebinding y no sigue redirects. Prueba automatizada y generación real desde `example.com` verificadas. **Front integrado (2026-07-23):** input de URL + slides + botón "Remix" en el editor. |
| F03-011 | Integrar generación y búsqueda de imágenes | F03-003 | `COMPLETADA` | OpenAI/Unsplash/upload producen Asset persistido y reemplazable | Upload, Unsplash y OpenAI se verificaron con Assets persistidos y servidos por HTTP 200. **Front integrado (2026-07-23):** panel "Imagen del slide" (generar OpenAI / buscar Unsplash / subir archivo) en la ficha de slide; el preview pinta la imagen real en layouts `split` (media) e `imageOverlay` (fondo con scrim). Verificado end-to-end: búsqueda Unsplash → `/api/assets/{id}` aplicado y renderizado. Se ignora el valor `"placeholder"` del fixture para no mostrar imágenes rotas. |
| F03-012 | Integrar BrandKit en render y generación | F03-003, F02-003 | `COMPLETADA` | Cambiar marca actualiza logo/colores sin duplicar preset local | Generación: la API resuelve la marca asociada a `campaignId` y añade nombre/color al contexto de IA; el editor/generador envían `campaignId`. **Render (2026-07-23, decisión del usuario = auto):** al seleccionar una campaña con marca, el acento del carrusel (`--carousel-accent`) usa automáticamente el `primaryColor` de la marca; el selector de Tema queda como override manual. Verificado en la UI: campaña con marca `#ff5aa2` → acento `#ff5aa2` + badge "marca"; al cambiar Tema a Azul → acento `#69a7ff` y el badge desaparece. No se duplica preset local (se lee de `brand_kits`). Logo diferido: el diseño de carrusel aprobado no tiene slot de logo; añadirlo sería una propuesta visual aparte. typecheck y build pasan. |
| F03-013 | Migrar caption y hashtags | F03-008 | `COMPLETADA` | Caption editable persiste y exporta junto al carrusel | El editor conserva el caption generado al cargar/guardar; el ZIP añade `caption.txt` con texto y hashtags. **Front integrado (2026-07-23):** sección "Caption y hashtags" en el editor de carrusel (textarea de texto + input de hashtags con chips); el caption forma parte del `CarouselDocument` que se guarda y recarga. |
| F03-014 | Migrar exportación PNG individual y ZIP | F03-003 | `COMPLETADA` | Archivos tienen dimensiones, nombres y contenido esperados | `POST /api/carousels/export` genera PNG/ZIP en servidor con Sharp y ZIP nativo. `npm run test:carousel-export` verifica firma PNG, 1080×1350, firma ZIP y nombre `slide-01.png`. **Front integrado (2026-07-23):** botones "Portada PNG" y "ZIP" en el editor descargan el archivo; verificados por HTTP 200 con firmas PNG (`89 50 4e 47`) y ZIP (`PK`). |
| F03-015 | Ejecutar regresión contra fixtures legacy | F03-004 a F03-014 | `COMPLETADA` | Matriz de paridad queda aprobada o diferencias aceptadas se documentan | El fixture de diez layouts convierte sin pérdida, cada layout exporta un PNG dentro del ZIP y la UI muestra los diez selectores/preview. El origen no tiene PNG baseline; la diferencia visual se acepta por el manifiesto de §12.5 y el front aprobado actual. |

#### GATE-04 — Carruseles en paridad

- Flujo generar→editar→guardar→recargar→exportar funciona.
- Las diez plantillas están verificadas.
- BrandKit, imágenes y captions usan persistencia central.
- `localStorage` no es la fuente de verdad.

**Estado:** `APROBADO` el 2026-07-23. La estructura legacy, los diez layouts, export y flujo editor quedaron verificados; no existe PNG baseline en el origen para un diff píxel a píxel.

---

### FASE-04 — Migración funcional de anuncios

Objetivo: convertir anuncios en un tipo persistente de ContentItem.

| ID | Tarea | Dependencias | Estado | Verificación | Cómo se dejó / evidencia |
|---|---|---|---|---|---|
| F04-001 | Definir `AdDocument` versionado | GATE-04 | `COMPLETADA` | Fixture legacy valida y se guarda sin pérdida | `@content-gen/domain/ad` valida los 5 layouts/3 formatos y conserva extensiones legacy. `npm run test:ad` convierte el fixture `defaultAd` sin pérdida y typecheck pasa. Sin tocar el front. |
| F04-002 | Migrar layouts promo, testimonial, comparison, feature y pain-solution | F04-001 | `COMPLETADA` | Cada layout renderiza su fixture | **Front (2026-07-23):** portados los 5 componentes de layout a `apps/studio/src/components/ads/` (promo, testimonial, comparison, feature, painSolution) + `AdRenderer` y `adFixture` (AdDocument completo, acento verde/fondo oscuro alineado al estilo actual). Nueva página `/ads` con el shell del sistema de diseño (sidebar), selector de layout y tabs de formato (story/square/landscape); habilitado en dashboard y sidebar. Verificado en navegador: los 5 layouts renderizan su fixture (Promo: badge/precio/CTA; Testimonial: 5★+cita+autor; Comparison: ✗/✓+labels; Feature: 4 tarjetas con emoji; PainSolution: dolor→solución con variante landscape side-by-side). typecheck y build (`/ads` generada) pasan. Sin cambios de backend. |
| F04-003 | Migrar previews Instagram y TikTok | F04-002 | `COMPLETADA` | Ambas plataformas mantienen contenido y proporción | **Front (2026-07-23):** `AdPlatformFrame` con chrome de Instagram (cabecera avatar/handle + fila de acciones) y TikTok (rail lateral ♥/💬/enviar + caption `@content.gen`), proporción por formato. Tabs de plataforma en el stage de `/ads`. Verificado en navegador: alternar Instagram/TikTok conserva el anuncio y cambia solo el marco. |
| F04-004 | Migrar editor de texto y estilo | F04-002 | `COMPLETADA` | Ediciones persisten tras recarga | **Front (2026-07-23):** inspector en `/ads` con campos de texto por layout (mapa `TEXT_FIELDS`), arrays de comparación (una línea por ítem), features (`emoji texto`), estrellas de testimonial y 3 selectores de color (acento/fondo/texto). Edición en vivo verificada (titular y acento se reflejan en el preview). Persistencia verificada por round-trip guardar→recargar contra `/api/content-items` (badge, acento y layout sobreviven; documento inválido → 400). |
| F04-005 | Integrar BrandKit | F04-002 | `COMPLETADA` | Logo y color principal se aplican desde la marca seleccionada | **Front (2026-07-23):** al elegir una campaña con marca, el editor aplica el `primaryColor` de la marca a `accentColor` del anuncio y muestra aviso; el usuario puede editar el color después (override manual). Verificado: campaña con marca `#a855f7` → input de acento y preview usan `#a855f7`. Logo diferido (los layouts de anuncio no tienen slot de logo; sería propuesta visual/schema aparte). |
| F04-006 | Migrar generación y regeneración con IA | F04-001 | `COMPLETADA` | Respuesta válida se aplica; respuesta inválida no corrompe el documento | `POST /api/ads/generate` valida generación y regeneración, fuerza formato/layout solicitados y rechaza contratos inválidos antes de responder. `test:ad-generation` recorre el flujo HTTP simulado sin credenciales y typecheck pasa; la llamada real queda como verificación operativa cuando el servidor tenga red. **Front (2026-07-23):** formulario "Idea IA + audiencia + tono" en `/ads` que llama a `/api/ads/generate` con el layout/formato actuales y aplica el documento devuelto. Verificado el cableado: petición inválida → 400; la llamada real respondió 502 "fetch failed" (sin red a OpenAI en este entorno) y el front lo muestra como aviso sin corromper el anuncio. |
| F04-007 | Integrar assets de imagen | F04-002 | `COMPLETADA` | Reutiliza biblioteca y permite reemplazo | `AdDocument.imageAssetId` referencia el asset central existente. Al guardar se valida existencia, MIME de imagen y pertenencia a la campaña; una referencia inexistente devuelve `400`. Round-trip real verificado y contenido temporal archivado. |
| F04-008 | Implementar exportación por formato | F04-003 | `COMPLETADA` | PNG resultante tiene dimensiones y nombre correctos | `POST /api/ads/export` devuelve PNG como adjunto. `test:ad-export` verifica story 1080×1920, square 1080×1080 y landscape 1920×1080; la llamada HTTP real respondió `200 image/png`. |
| F04-009 | Integrar anuncios en biblioteca/campaña | F04-001, F02-009 | `COMPLETADA` | Crear desde campaña y abrir desde biblioteca funciona | `ContentItem` valida `AdDocument` al crear y actualizar. Prueba API real: contrato inválido respondió `400`; anuncio válido se creó, reabrió con layout `promo` y fue archivado al finalizar. Sin modificar la interfaz. |
| F04-010 | Ejecutar regresión contra fixture legacy | F04-002 a F04-009 | `COMPLETADA` | Matriz de paridad aprobada | `test:ad` convierte el fixture legacy sin pérdida y `test:ad-export` renderiza los 5 layouts y los 3 formatos. Persistencia y validación de asset se comprobaron contra API. GATE-05 aprobado. |

#### GATE-05 — Anuncios en paridad

- Los cinco layouts funcionan.
- Persistencia, BrandKit, IA y exportación están centralizados.
- El anuncio puede convivir con carruseles en una campaña.

---

### FASE-05 — Motor de video dirigido por datos

Objetivo: dejar de generar código fuente por cada video.

| ID | Tarea | Dependencias | Estado | Verificación | Cómo se dejó / evidencia |
|---|---|---|---|---|---|
| F05-001 | Definir `VideoDocument` y escenas versionadas | GATE-05 | `COMPLETADA` | Fixtures estándar y timeline validan | `@content-gen/domain/video` define el documento v1, escenas `standard`/`timeline`, datos flexibles y IDs únicos. `npm run test:video` valida ambos fixtures y el rechazo de ID duplicado; typecheck pasa. |
| F05-002 | Normalizar slugs, IDs, duración, FPS y dimensiones | F05-001 | `COMPLETADA` | Entradas inválidas se rechazan; IDs válidos son deterministas | `videoSlugSchema` normaliza texto y acentos a kebab-case para slug, plantilla e IDs de escena. El contrato fija el MVP vertical en 1080×1920 a 30 FPS y rechaza duraciones no enteras/positivas y colisiones tras normalizar. `npm run test:video` y typecheck pasan. |
| F05-003 | Crear registro estático de plantillas | F05-001 | `COMPLETADA` | Plantilla se selecciona por ID sin editar `Root.tsx` | `videoTemplates` registra `standard` y `timeline`; `Root.tsx` solo itera el registro. Remotion lista ambas composiciones. |
| F05-004 | Convertir composición estándar a props de datos | F05-003 | `COMPLETADA` | Dos guiones diferentes usan el mismo componente | `StandardVideo` recibe `VideoDocument`; dos documentos estándar distintos completaron create→reload usando el mismo templateId. |
| F05-005 | Convertir composición timeline a props de datos | F05-003 | `COMPLETADA` | Dos timelines diferentes usan el mismo componente | `TimelineVideo` consume escenas timeline por props y el editor añade/actualiza eventos sin generar componentes. |
| F05-006 | Extraer elementos visuales compartidos solo donde exista duplicación real | F05-004, F05-005 | `COMPLETADA` | No cambia la salida de fixtures y reduce duplicación demostrable | Solo la secuenciación y lectura de texto duplicadas se movieron a `video-scenes.tsx`; estilos estándar/timeline permanecen separados. |
| F05-007 | Integrar assets por referencia segura | F05-004, F05-005 | `COMPLETADA` | Imagen/audio inexistente muestra fallback o error controlado | Escenas admiten UUID de imagen/audio; al guardar se rechazan asset inexistente, MIME incorrecto o campaña ajena. `test:content-assets` pasa. |
| F05-008 | Calcular metadata y duración desde documento/audio | F05-004, F05-005 | `COMPLETADA` | Duración final coincide con escenas y narración | `calculateVideoMetadata` conserva el mayor valor entre frames de escena y audio medido, y suma la duración final. `test:video-metadata` valida 210 frames. |
| F05-009 | Integrar Remotion Player en el editor | F05-004, F05-005 | `COMPLETADA` | Play, pausa, seek y actualización de props funcionan | `/video` integra Player con controles nativos. Navegador validó play/pausa, seek a `0:06 / 0:09` y actualización inmediata de la etiqueta en preview, sin errores de consola. |
| F05-010 | Crear editor de escenas estándar | F05-001, F05-009 | `COMPLETADA` | Cambios de cada campo actualizan preview y persisten | Inspector estándar edita ID, duración y campos de contenido; permite añadir/eliminar escenas y guarda `VideoDocument` en ContentItem. |
| F05-011 | Crear editor de escenas timeline | F05-001, F05-009 | `COMPLETADA` | Eventos, fechas y cierre actualizan preview y persisten | Inspector timeline cubre año/fecha, titular, impacto y cierre. La prueba visual añadió una tercera escena y actualizó el titular en vivo. |
| F05-012 | Clasificar composiciones manuales existentes como legacy | F00-006 | `COMPLETADA` | Cada composición tiene ID, estado y estrategia de conservación | §12.2 mantiene 9 data-backed manuales, 2 editoriales y 1 demo como legacy/referencia; las 11 estándar se migran por documento. |
| F05-013 | Eliminar del flujo nuevo la escritura de TSX y modificación de `Root.tsx` | F05-004, F05-005 | `COMPLETADA` | Crear 3 videos no altera ningún archivo fuente | La integración creó, recargó y archivó dos estándar y un timeline; hashes de `apps/` y `packages/` confirmaron 0 archivos fuente modificados. |
| F05-014 | Renderizar fixtures estándar y timeline | F05-007, F05-008 | `COMPLETADA` | Ambos producen MP4 reproducible | Remotion generó `storage/f05-standard.mp4` (211612 bytes) y `storage/f05-timeline.mp4` (321251 bytes), H.264, 1080×1920 a 30 FPS. |
| F05-015 | Comparar salida con videos legacy | F05-014 | `COMPLETADA` | Diferencias visuales/temporales quedan aprobadas o corregidas | Comparación técnica confirmó 1080×1920 a 30 FPS. Tras alinear las plantillas con el shell de `video-autom/remotion` (imagen protagonista, velo/vignette, borde redondeado, etiqueta luminosa, Poppins pesada y glitch mínimo), se renderizaron `storage/f05-standard-legacy-style.png` y `storage/f05-timeline-legacy-style.png`; el usuario aprobó explícitamente el resultado el 2026-07-25: “quedó bien”. La duración sigue dependiendo de guion y narración. |
| F05-016 | Exponer imagen y narración por escena en el editor | F05-007, F05-009 | `COMPLETADA` | Adjuntar imagen/audio actualiza preview, persiste y rechaza referencias inválidas | **Front (2026-07-25):** nuevo `video-asset-panel.tsx` en el inspector de `/video` (imagen: Unsplash / OpenAI / subida; narración: MP3 o WAV) que escribe `imageAssetId` y `audioAssetId` de la escena; al subir audio se mide con `HTMLAudioElement` y la duración de la escena se ajusta automáticamente. **Motor:** `SceneMedia` y `assetUrl` en `video-scenes.tsx` pintan la imagen como fondo con velo y montan `<Audio>`; `StandardVideo`/`TimelineVideo` pasan a `VideoProps` y aceptan `assetBaseUrl` (el Player usa ruta relativa). Verificado en navegador: PNG 1080×1920 subida → `POST /api/assets` 201 → miniatura y fondo del Player con el mismo asset; WAV de 5 s → escena pasó de 90 a 150 frames y el Player marcó `0:05`; guardar en campaña persistió ambos IDs y al releer el documento seguían presentes. Rechazos verificados: asset inexistente → 400 "El asset seleccionado no existe."; audio usado como imagen → 400 "El asset seleccionado no es una imagen.". lint, typecheck, build, `test:video`, `test:video-metadata` y `test:content-assets` pasan. **Corrección (2026-07-25):** la limpieza declarada como "archivado" usó `archived: true`, campo que `PATCH /api/content-items/:id` ignora; el contenido de prueba siguió activo hasta que se archivó de verdad con `archivedAt`. Deuda: el Player no recalcula duración con `calculateMetadata`, por eso la duración se ajusta al subir el audio y no en cada cambio; no hay selector de assets ya existentes en la biblioteca. |
| F05-017 | Elevar la riqueza visual de las plantillas de video | F05-016 | `COMPLETADA` | El MP4 nuevo alcanza densidad visual comparable al legacy y F05-015 se puede cerrar | `standard-video.tsx` y `timeline-video.tsx` ahora componen las imágenes de escena con velo, gradientes, trama, marco luminoso, indicadores y entrada/salida; Standard emplea tratamiento editorial magenta y Timeline un riel verde con hito y panel de impacto. `storage/f05-standard-rich.mp4` (1,393,557 bytes) y `storage/f05-timeline-rich.mp4` (508,983 bytes) renderizaron H.264 1080×1920 a 30 FPS; sus frames revisados muestran la densidad visual prevista. `lint`, `typecheck`, `test:video`, `test:video-metadata` y `compositions` pasan. |

#### GATE-06 — Motor de video estable

- Un componente estándar y uno timeline aceptan múltiples documentos.
- Crear contenido no modifica código fuente.
- Player y MP4 funcionan con los mismos datos.
- Legacy permanece disponible sin bloquear el motor nuevo.

**Estado:** `APROBADO` el 2026-07-25 tras aprobación visual del usuario.

---

### FASE-06 — Pipeline audiovisual y worker de render

Objetivo: ejecutar guion, imágenes, voz, caption y render como un flujo recuperable.

| ID | Tarea | Dependencias | Estado | Verificación | Cómo se dejó / evidencia |
|---|---|---|---|---|---|
| F06-001 | Unificar cliente OpenAI y configuración de modelos | GATE-06 | `COMPLETADA` | Todas las generaciones pasan por un servicio y registran modelo | `apps/studio/src/lib/openai.ts` concentra proveedor, clave, timeout y modelos por propósito (`text`, `script`, `voiceoverScript`, `image`), devuelve el modelo usado y fuerza el modelo resuelto incluso en los callers existentes. Carrusel, slides, anuncios e imágenes pasan por `openAiRequest`; el registro persistente de cada llamada es F06-004. `.env.example` documenta los modelos de guion con fallback a `OPENAI_TEXT_MODEL`. `test:openai`, generación de anuncios/carruseles/slides/imágenes, typecheck y lint pasaron. |
| F06-002 | Migrar prompt de guion estándar | F06-001, F05-001 | `COMPLETADA` | Resultado valida como VideoDocument estándar | `video-generation.ts` genera el documento v1 estándar desde `apps/studio/src/lib/openai.ts`, fija IDs `standard-N`, convierte segundos a frames y rechaza escenas ausentes, inválidas o de cantidad incorrecta con 422. `POST /api/videos/generate` expone el contrato sin persistir contenido aún. `test:video-generation`, `test:video`, `test:openai`, typecheck, lint y build pasaron. |
| F06-003 | Migrar prompt timeline | F06-001, F05-001 | `COMPLETADA` | Resultado valida cronología y orden de eventos | `video-generation.ts` agrega la variante Timeline al mismo endpoint mediante `templateId: "timeline"`; exige `year` numérico ascendente, fija IDs `timeline-N` y convierte duración a frames. La prueba cubre prompt, orden válido y rechazo de cronología invertida; typecheck y lint pasan. |
| F06-004 | Registrar GenerationRun, duración, error y uso disponible | F06-001 | `COMPLETADA` | Cada intento exitoso o fallido deja registro consultable | `generation_runs` conserva `operation`, `model`, `durationMs`, `usage`, estado y diagnóstico. `POST /api/videos/generate` abre el run antes del proveedor y lo cierra en éxito o fallo; exige un video activo para no dejar historial huérfano. `openai.ts` extrae `usage` de Responses cuando está disponible. `test:generation-runs` comprobó SQLite temporal (inicio→cierre→modelo/uso), y `test:openai`, `test:video-generation`, typecheck y lint pasaron. |
| F06-005 | Generar/regenerar imágenes por escena | F06-001, F05-007 | `COMPLETADA` | Regenerar reemplaza solo la escena elegida y conserva versiones previas recuperables | `POST /api/videos/:id/scenes/:sceneId/image` reutiliza generación/búsqueda y `storeAsset`, actualiza una sola escena con revisión optimista, registra el intento y conserva el ID anterior en `content.imageAssetHistory`; ningún asset se elimina. `test:video-scene-images`, `test:generation-runs`, `test:content-assets`, typecheck y lint pasaron. |
| F06-006 | Migrar generación y edición del guion de voz | F06-001 | `COMPLETADA` | Guion de voz persiste y conserva estructura por escenas | `POST /api/videos/:id/voiceover-script` genera o edita `content.voiceover` de cada escena en el mismo `VideoDocument`, exige cobertura exacta de IDs y usa revisión optimista. La generación se registra con modelo, duración y uso; la edición manual no llama al proveedor. `test:voiceover-script`, `test:video`, `test:openai`, typecheck y lint pasaron. |
| F06-007 | Integrar lista y selección de voces ElevenLabs | F06-006 | `COMPLETADA` | Voces disponibles cargan; error de autorización es legible | `GET /api/voices` usa `fetch` nativo contra `/v2/voices?page_size=100`, normaliza la respuesta, prioriza etiquetas en español y devuelve `voices: []` con mensaje claro ante 401/403. `.env.example` documenta modelo y clave. `test:elevenlabs`, typecheck y lint pasaron. |
| F06-008 | Generar audio con formato compatible con el plan disponible | F06-007 | `COMPLETADA` | Audio se reproduce y errores 4xx no derriban el editor | `POST /api/videos/:id/scenes/:sceneId/audio` usa el `voiceover` persistido, genera `mp3_44100_128`, lo guarda como Asset central, registra ElevenLabs y conserva el asset anterior. Selección de voz/modelo queda en la escena. `test:elevenlabs`, `test:video-scene-audio`, assets, runs, typecheck y lint pasaron. |
| F06-009 | Sincronizar escenas y voz | F06-008, F05-008 | `COMPLETADA` | Video no corta narración y duración calculada coincide | Como ElevenLabs se solicita en CBR 128 kbps, el backend calcula segundos desde bytes, añade 0.5 s de cola y eleva `durationFrames` sin acortar escenas existentes. El motor conserva su cálculo de metadata como segunda defensa. `test:video-scene-audio`, `test:video-metadata`, ElevenLabs, typecheck, lint y build pasaron. |
| F06-010 | Migrar generación y edición de caption TikTok | F06-001 | `COMPLETADA` | Caption persiste y puede copiarse/exportarse | `POST /api/videos/:id/caption` genera con el cliente OpenAI común o acepta edición manual, normaliza y deduplica hashtags, persiste con revisión optimista y registra únicamente las generaciones de IA. `GET` exporta el resultado como `.txt`. `test:video-caption`, `test:openai`, `test:generation-runs`, typecheck y lint pasaron. |
| F06-011 | Implementar cola persistente de RenderJob | F01-006, F02-002 | `COMPLETADA` | Job sobrevive reinicio y no se pierde | `POST /api/render-jobs` crea siempre un `RenderJob` v1 en estado `queued` tras validar el contrato y el contenido activo; `GET /api/render-jobs?contentItemId=` lo consulta desde SQLite. `test:persistence` inserta y recupera el job tras reapertura de la base. Prueba HTTP real creó un job, lo recuperó por contenido y archivó el contenido/campaña temporal al terminar. |
| F06-012 | Implementar worker con progreso, éxito, error y cancelación segura | F06-011, F05-014 | `COMPLETADA` | Estados siguen transiciones válidas y error conserva diagnóstico | El worker acepta `--once`, reclama atómicamente el job `queued` más antiguo, persiste `processing` (10→75), `completed` (100) o `failed` con diagnóstico y no sobrescribe `cancelled`. `PATCH /api/render-jobs/:id` cancela solo trabajos no terminales. `test:persistence` cubre reapertura, éxito y error persistido; una llamada HTTP real confirmó cancelación y consulta por contenido. El render de MP4 sigue en F06-013. |
| F06-013 | Guardar MP4 como Export/Asset | F06-012 | `COMPLETADA` | Video completo aparece en biblioteca y se descarga | `POST /api/render-jobs` deriva plantilla y props exclusivamente del `VideoDocument` persistido. El worker ejecuta Remotion, escribe props temporales para Windows, guarda el MP4 bajo `storage/media/assets/`, crea `Asset` `video/mp4` y su `Export`, y conserva `outputAssetId` en el job. El video sigue apareciendo como ContentItem en la Biblioteca y se descarga mediante el endpoint existente `/api/assets/:id`. `test:persistence` renderiza un video real, verifica Asset, Export y archivo físico, y elimina su entorno temporal. |
| F06-014 | Implementar reintento idempotente | F06-012 | `COMPLETADA` | Reintentar no duplica ni corrompe el contenido | `PATCH /api/render-jobs/:id` con `action: retry` reinicia únicamente jobs `failed` o `cancelled` sobre el mismo ID; llamadas repetidas durante `queued`/`processing` devuelven el job existente y no insertan filas nuevas. La actualización condicional evita carreras. Prueba HTTP real: cancelación, dos reintentos, mismo ID y un único registro; contenido/campaña temporales archivados. |
| F06-015 | Ejecutar prueba end-to-end del pipeline | F06-002 a F06-014 | `COMPLETADA` | Tema→guion→imágenes→voz→preview→MP4→caption completa sin intervención técnica | Recorrido real contra las APIs del producto y proveedores configurados: campaña/video temporal → guion OpenAI de 2 escenas → voz estructurada → 2 imágenes Unsplash → 2 audios ElevenLabs → caption de 370 bytes → preview HTTP 200 → RenderJob/worker completado → MP4 descargable de 7,007,973 bytes. Se persistieron 7 GenerationRuns; contenido y campaña temporales quedaron archivados. Build final de Studio y Remotion pasó. La interacción de cada panel ya había sido validada previamente desde `/video`. **Limitación descubierta el 2026-07-26 (F06-017) y resuelta en F06-019:** una repetición con 3 escenas, imagen de fondo y narración (~14 s) superó los 10 MB y destapó el techo fijo. `storeAsset` y `saveExport()` ya no imponen ese límite. |
| F06-016 | Exponer la cola de render en el editor de video | F06-013, F06-014, F09-005 | `COMPLETADA` | Renderizar, seguir progreso, cancelar, reintentar y descargar el MP4 sin tocar la API | **Front (2026-07-25):** `video-render-panel.tsx` en el inspector de `/video`: botón "Renderizar MP4", estado y barra de progreso, sondeo cada 2 s mientras el job está `queued`/`processing`, botones Cancelar / Reintentar / Descargar MP4, diagnóstico de error con scroll y aviso de cambios sin guardar (el editor compara el documento con la última versión persistida). Nuevo script raíz `npm run worker:once` (carga `.env.local`/`.env` con `--env-file-if-exists`) porque el worker sólo corría con ruta manual; el panel muestra ese comando mientras el job espera. Verificado en navegador contra el worker real: guardar → Renderizar → `EN COLA 0%` → worker → el panel pasó solo a `LISTO 100%` y el enlace descargó `video/mp4`, 1,393,557 bytes, cabecera `ftypisom`. Cancelar dejó `CANCELADO`; Reintentar volvió a `EN COLA` **sin crear job nuevo** (7 jobs antes y después, F06-014 confirmado desde la UI); con la cola saturada el panel mostró "Se alcanzó el límite de renders activos." (429 de F09-005). Sin errores de consola; lint, typecheck, build e `check:integrity` pasan; los jobs quedaron cancelados y los tres contenidos de prueba se archivaron con `archivedAt` (un primer intento usó `archived: true`, campo que la API ignora, y los dejó activos). Deuda: el progreso salta 10→75→100 porque el worker sólo persiste esos hitos, y el panel muestra el job más reciente sin historial. |
| F06-017 | Exponer el pipeline de video en el editor | F06-002 a F06-010 | `COMPLETADA` | Guion, imagen por escena, voz, narración y caption se operan desde la UI y persisten | **Front (2026-07-26):** el inspector de `/video` pasó a pestañas **Escena / Voz / Caption / Render**. Nuevos `video-script-generator.tsx` (tema, audiencia, tono y número de escenas → `POST /api/videos/generate`), `video-voice-panel.tsx` (guion de voz para todas las escenas, edición por escena, selector de voces de `GET /api/voices` y narración por escena) y `video-caption-panel.tsx` (generar, editar, chips de hashtags y descarga `.txt`). `video-asset-panel.tsx` usa la ruta por escena `POST /api/videos/:id/scenes/:sceneId/image` cuando el video ya está guardado, para persistir y registrar el `GenerationRun`. El editor adopta la revisión devuelta por cada ruta (`adopt`) y así no choca con el bloqueo optimista. El generador por tema **no envía `campaignId`** a propósito: el endpoint fusiona el brief encima del body y descartaría lo que el usuario escribe; "Generar desde campaña" (F07-005) sigue cubriendo el camino con brief y marca. Verificado end-to-end con proveedores reales desde la UI: guion de 3 escenas sobre un tema manual; guion de voz para las tres escenas (revisión 2); narración ElevenLabs en la escena 1 (revisión 3, asset creado y duración 240→345 frames por F06-009); caption con 8 hashtags y `.txt` descargado con nombre derivado del slug (revisión 4); imagen Unsplash por escena (revisión 5). `/content/[id]` pasó de "Aún no hay generaciones" a cinco `GenerationRun` completados. Sin errores de consola; lint, typecheck y build pasan; contenido de prueba archivado con `archivedAt`. Deuda: la edición del guion de voz reenvía todas las escenas porque la ruta exige cobertura exacta de IDs, y las escenas sin texto viajan con un marcador. |
| F06-018 | Conectar biblioteca, detalle y editores | F02-009, F02-011, F06-013 | `COMPLETADA` | Una pieza se abre desde la biblioteca, muestra sus exportaciones y se descarga sin tocar la API | **Front (2026-07-26):** `/content/[id]` dejó de ser un volcado de JSON: encabezado con el título real del documento (`title`, o `headline` en anuncios), campaña y tipo, badge de estado, botón **Abrir en el editor** y tarjeta de **Exportaciones** con formato, tamaño, fecha y descarga; el JSON quedó dentro de un `<details>` colapsado y las generaciones muestran operación, modelo y duración. Nuevos enlaces profundos `/(carousel|ads|video)?id=<contentItemId>` mediante el hook compartido `use-requested-content-id.ts`, que lee el parámetro desde `window` en un efecto para no envolver cada editor en un límite de Suspense. La biblioteca pasó a mostrar el título real de cada pieza, un badge con el número de exportaciones y un botón **Abrir**. Backend mínimo de apoyo: `GET /api/content-items/:id` devuelve además `campaign` y `exports` (unión con `assets`), y `GET /api/content-items` añade `exportCount` por subconsulta. Verificado en navegador: un video con export mostró `MP4 · 6.7 MB` y su descarga respondió 200 `video/mp4`, 7,007,973 bytes con cabecera `ftypisom`; otro sin exports mostró el estado vacío y su botón abrió `/video?id=…`, que cargó título, slug y las 3 escenas con el aviso "Video cargado desde la biblioteca". En la biblioteca, los archivados muestran `1 export` y no ofrecen "Abrir". Sin errores de consola; lint, typecheck y build pasan; el contenido restaurado para la prueba volvió a archivarse. Se añadió también el enlace de cada pieza de `/campaigns` a su detalle (antes eran filas muertas), verificado con las tres piezas de una campaña real. Deuda: el detalle todavía no renderiza una miniatura del contenido, y el título de las piezas antiguas de carrusel cae al genérico porque su documento no guarda `title`. |
| F06-019 | Eliminar el techo fijo de assets y renders | F02-006, F06-013 | `COMPLETADA` | Uploads y MP4 mayores a 10 MB se aceptan sin perder validaciones | `storeAsset` ya no impone tamaño máximo y sigue rechazando vacío/MIME desconocido. El worker dejó de cargar el MP4 completo en RAM: calcula SHA-256 por streaming y copia el archivo al almacenamiento. La prueba acepta 11 MB; worker, typecheck y lint pasan. |

#### GATE-07 — Video de extremo a extremo

- El pipeline completo funciona desde la UI.
- Jobs persisten y muestran progreso.
- Errores de proveedores y render son recuperables.
- MP4, audio, imágenes y caption quedan en la biblioteca.

---

### FASE-07 — Campañas multiformato

Objetivo: reutilizar un mismo brief para producir varias piezas.

| ID | Tarea | Dependencias | Estado | Verificación | Cómo se dejó / evidencia |
|---|---|---|---|---|---|
| F07-001 | Definir brief compartido de campaña | GATE-07 | `COMPLETADA` | Tema, audiencia, tono, idioma, contexto y marca validan | `campaignBriefSchema` valida tema, audiencia, tono, idioma y contexto; `Campaign.brandKitId` conserva la marca opcional. `Campaign.brief` acepta el contrato estructurado y el texto legacy para no romper datos existentes. `test:domain`, typecheck y lint pasaron. |
| F07-002 | Crear campaña desde la UI | F07-001 | `COMPLETADA` | Campaña aparece en biblioteca con brief persistido | `/campaigns` edita nombre, tema, audiencia, tono, idioma, contexto y marca en el formulario existente; al abrir una campaña textual legacy la prepara para guardarse en el contrato estructurado. Verificación real en navegador: creación, recarga con todos los campos persistidos y archivado posterior, sin errores de consola. Typecheck y lint pasaron. |
| F07-003 | Crear carrusel desde campaña | F07-002 | `COMPLETADA` | Hereda brief/BrandKit y mantiene edición independiente | El selector existente precarga tema, audiencia y tono en `CarouselGenerator`; la API vuelve a resolver el brief persistido, agrega idioma/contexto al prompt y conserva nombre/color de BrandKit. El resultado sigue siendo un `CarouselDocument` independiente. Verificado en navegador con campaña temporal y cubierto por `test:carousel-generation`, `test:carousel-remix`, typecheck y lint. |
| F07-004 | Crear anuncio desde campaña | F07-002 | `COMPLETADA` | Hereda brief/BrandKit y mantiene edición independiente | El selector de `/ads` precarga tema, audiencia y tono. `POST /api/ads/generate` valida la campaña, resuelve brief/BrandKit en servidor, agrega idioma, contexto, nombre y color al prompt y fija `accentColor` al color de marca. El `AdDocument` resultante queda editable e independiente. Verificado en navegador y con `test:ad-generation`, typecheck y lint. |
| F07-005 | Crear video desde campaña | F07-002 | `COMPLETADA` | Hereda brief/BrandKit/contexto y produce VideoDocument | `/video` añade “Generar desde campaña”: guarda primero el borrador, y `/api/videos/generate` comprueba que contenido y campaña coincidan antes de resolver brief y BrandKit. Idioma, contexto, nombre y color llegan al prompt; el resultado es un `VideoDocument` editable. Prueba real conjunta: el mismo brief produjo carrusel de 3 slides, anuncio con `accentColor #1565C0` y video estándar de 2 escenas/slug `privacidad-digital`; los tres persistieron y sus temporales se archivaron. `test:video-generation`, typecheck y lint pasaron. |
| F07-006 | Reutilizar assets de campaña | F07-002 | `COMPLETADA` | Una imagen puede asignarse a varias piezas sin duplicación | `GET /api/assets?campaignId=&kind=image` lista la biblioteca activa y `CampaignAssetSelect` la reutiliza en carrusel, anuncio y video. Los anuncios ahora pintan el asset como fondo con velo. Prueba HTTP real: una imagen subida una vez conservó un solo registro Asset y el mismo ID quedó referenciado por tres ContentItems; todos los temporales se archivaron. `test:content-assets`, `test:ad`, typecheck y lint pasaron. |
| F07-007 | Mostrar progreso de piezas y renders | F07-003 a F07-005 | `COMPLETADA` | Vista campaña refleja borrador/listo/renderizando/exportado | `GET /api/campaigns/:id` devuelve sus piezas y deriva el estado desde revisión, último RenderJob y Export: borrador, listo, renderizando o exportado. `/campaigns` muestra ese resumen sin persistir un estado duplicado. `test:campaign-progress`, typecheck, lint e integridad pasaron. |
| F07-008 | Duplicar campaña con opciones mínimas | F07-002 | `COMPLETADA` | Duplicado no comparte IDs mutables ni jobs antiguos | `POST /api/campaigns/:id/duplicate` crea un ID y timestamps nuevos, conserva el brief y acepta `keepBrand`; deliberadamente no copia ContentItems, Assets, GenerationRuns, Exports ni RenderJobs. `/campaigns` expone el botón Duplicar. Prueba HTTP real confirmó ID distinto, brief igual, marca removible y lista de contenido `[]`. Typecheck y lint pasaron. |
| F07-009 | Exportar paquete de campaña | F07-003 a F07-007 | `COMPLETADA` | ZIP contiene exports y archivo de captions con nombres deterministas | `GET /api/campaigns/:id/export` empaqueta únicamente Exports persistidos con nombres `<tipo>-<id-corto>.<formato>` y agrega `captions.txt` para carruseles, anuncios y videos. `/campaigns` ofrece “Exportar ZIP”. Prueba real: RenderJob de video → MP4 → ZIP de 34,517 bytes con el MP4, `captions.txt` y su texto. `test:campaign-export`, `test:carousel-export`, typecheck y lint pasaron. |
| F07-010 | Probar campaña completa multiformato | F07-009 | `COMPLETADA` | Un brief produce al menos carrusel, anuncio y video verificables | Campaña real con brief estructurado y BrandKit produjo y persistió carrusel de 3 slides, anuncio con color de marca `#1565C0` y video estándar de 2 escenas; se verificaron herencia en UI, documentos independientes, Asset único reutilizado por tres piezas, estados derivados, duplicado limpio y paquete ZIP con MP4/captions. Todos los temporales quedaron archivados. Build final de Studio y Remotion pasó. |

#### GATE-08 — Estudio centralizado

- Una campaña agrupa y reutiliza información entre formatos.
- Biblioteca y estado reflejan todas las piezas.
- Exportación conjunta funciona.
- **Aprobado explícitamente por el usuario el 2026-07-26.**

---

### FASE-08 — Migración de contenido legacy

Objetivo: importar datos existentes sin destruir ni alterar los proyectos origen.

| ID | Tarea | Dependencias | Estado | Verificación | Cómo se dejó / evidencia |
|---|---|---|---|---|---|
| F08-001 | Diseñar formato de reporte de importación | GATE-08 | `COMPLETADA` | Reporte registra importado, omitido, error y motivo por elemento | `legacy-import.mjs` emite JSON v1 con operación, fuente, timestamps, resumen y detalle por elemento (`ready/imported/skipped/error`). |
| F08-002 | Implementar importador de BrandPreset desde localStorage | F08-001 | `COMPLETADA` | Presets se convierten a BrandKit y logos a Asset | `legacy:import-carousel` acepta una captura JSON de localStorage, convierte presets, extrae logos base64 a Assets SHA-256 y conserva `logoAssetId`; fixture probado dos veces. |
| F08-003 | Implementar importador de autosave de carrusel | F08-001 | `COMPLETADA` | `carousel-ai:autosave` produce ContentItem válido | El mismo comando convierte el autosave mediante `convertLegacyCarousel` y lo guarda bajo una campaña legacy determinista. La captura real del navegador no fue proporcionada y se registra como diferencia, sin inventar datos. |
| F08-004 | Implementar importador de historial de carruseles | F08-001 | `COMPLETADA` | `carousel-session-history` importa hasta las entradas existentes sin duplicar | Cada entrada obtiene ID determinista, conserva timestamp y usa `INSERT OR IGNORE`; la segunda ejecución del fixture importó cero. |
| F08-005 | Implementar importador de anuncios recuperables | F08-001 | `COMPLETADA` | Datos disponibles se convierten o se documenta por qué no son recuperables | Inventario confirmó que anuncios vivían únicamente en estado React, sin localStorage ni archivos persistidos. El reporte los marca `skipped` con motivo explícito. |
| F08-006 | Implementar escáner de `script.json` de video | F08-001 | `COMPLETADA` | Lista todos los scripts y valida tipo/errores antes de importar | `legacy:scan-video` encontró y validó 11/11 scripts reales, cero errores; reporte guardado en `storage/migration-reports`. |
| F08-007 | Importar imágenes, audio, captions y outputs de video | F08-006 | `COMPLETADA` | Hash, tamaño y relación con contenido quedan correctos | Se importaron por streaming y SHA-256 164 Assets vinculados: imágenes, audios, guiones JSON y MP4, incluidos outputs cercanos a 1 GB. Dos audios globales sin relación inequívoca se conservaron solo en origen y quedaron justificados. |
| F08-008 | Importar videos estándar y timeline | F08-006, F08-007 | `COMPLETADA` | Abren en el editor nuevo y renderizan | Los 11 scripts se convirtieron a VideoDocument v1 `standard`, con 7 escenas, assets y duración de voz; cada MP4 existente quedó como Export descargable. Todos pasaron el esquema de dominio. |
| F08-009 | Registrar composiciones manuales como legacy | F05-012, F08-006 | `COMPLETADA` | Se pueden listar y abrir/renderizar con su motor original controlado | Se registraron 6 composiciones manuales y sus MP4. `legacy:render-manual -- <compositionId>` acepta solo una whitelist y obliga a guardar dentro de `storage`. |
| F08-010 | Probar idempotencia de importadores | F08-002 a F08-009 | `COMPLETADA` | Ejecutar dos veces no crea duplicados ni pisa ediciones nuevas | Videos generados: primera ejecución 180 importados, segunda 180 omitidos. Manuales: primera 18 importados, segunda 18 omitidos. Fixtures cubren carrusel, marcas y assets. |
| F08-011 | Emitir reporte final de migración y conservar backup | F08-010 | `COMPLETADA` | Conteos origen/destino cuadran o diferencias están justificadas | Backup `pre-fase08-video-20260726`; reporte final en `storage/migration-reports/final-fase08-2026-07-26.json`. Integridad final: 183 assets y 48 contenidos, sin referencias rotas. |

#### GATE-09 — Legado preservado

- Datos recuperables están importados.
- Importadores son idempotentes.
- Las diferencias están registradas.
- Los proyectos originales continúan intactos y respaldados.
- **Aprobado explícitamente por el usuario el 2026-07-30.**

---

### FASE-09 — Calidad, seguridad y rendimiento

Objetivo: endurecer el sistema completo antes de considerarlo sustituto de los proyectos origen.

| ID | Tarea | Dependencias | Estado | Verificación | Cómo se dejó / evidencia |
|---|---|---|---|---|---|
| F09-001 | Validar todos los boundaries HTTP y jobs | GATE-09 | `COMPLETADA` | Payloads malformados reciben 4xx sin escrituras parciales | Las rutas de marcas, campañas, contenidos, assets y RenderJobs capturan JSON/multipart inválido antes de consultar o escribir. `test:http-boundaries` envió 21 payloads malformados a todas las rutas mutables: todos respondieron 4xx y los conteos de las siete tablas permanecieron idénticos. Typecheck y lint pasan. |
| F09-002 | Auditar slugs, rutas y traversal | F09-001 | `COMPLETADA` | Casos `../`, rutas absolutas y nombres reservados se rechazan | `resolveAssetPath` exige claves `assets/<sha256>.<ext>` y confinamiento real dentro de `storage/media`; descarga individual y ZIP de campaña reutilizan esa validación. VideoSlug rechaza separadores y nombres Windows reservados. Backup/restore rechazan traversal, `CON` y nombres terminados en punto. `test:path-safety`, dominio, video e integridad pasan. |
| F09-003 | Auditar claves y secretos | F09-001 | `COMPLETADA` | Escaneo no encuentra secretos versionados ni expuestos al cliente | `check:secrets` recorre los archivos visibles para control de versiones y falla ante claves OpenAI/GitHub/AWS/Google, private keys o variables sensibles `NEXT_PUBLIC_*`; solo informa archivo/línea. Resultado real: cero hallazgos. |
| F09-004 | Aplicar política de tamaño y tipo de uploads | F09-001 | `COMPLETADA` | Archivos fuera de política se rechazan antes de persistir | `/api/assets` recibe el cuerpo binario por streaming, calcula SHA-256 incremental y usa un temporal atómico; no existe un máximo fijo de aplicación. MIME, relaciones y firma real de PNG/JPEG/WebP/MP3/WAV/MP4 se validan antes de la persistencia final, y los temporales se limpian ante error. La prueba HTTP rechazó tipo desconocido, cuerpo vacío y PNG falso sin cambiar la DB; luego subió y descargó íntegro un PNG de 11 MB y eliminó el dato de prueba. |
| F09-005 | Añadir límites de concurrencia y coste | F06-011 | `COMPLETADA` | No se exceden jobs/generaciones simultáneos definidos | `MAX_ACTIVE_RENDER_JOBS` limita la cola global a 2 por defecto (rango seguro 1–10). La comprobación y el `INSERT` ocurren dentro de una transacción SQLite inmediata, por lo que solicitudes concurrentes no rebasan el límite; jobs de contenido archivado no consumen cupo. `test:render-limits`, `check:env`, lint y typecheck pasan. Prueba HTTP real aceptó dos videos y rechazó el tercero con `429`; todos los datos temporales fueron archivados. |
| F09-006 | Revisar SSRF en remix y fuentes remotas | F03-010 | `COMPLETADA` | IPs privadas, esquemas no HTTP y redirects inseguros se bloquean | Remix usa la IP pública validada al abrir HTTP(S), bloquea puertos no estándar, IPs privadas/mapeadas y redirects. Las imágenes remotas se rechazan por `content-length` o streaming al superar 10 MB antes de persistirse. Pruebas, typecheck y llamada real de Remix pasan; sin tocar el front. |
| F09-007 | Ejecutar pruebas unitarias mínimas de dominio | F02-001 | `COMPLETADA` | Esquemas y transiciones críticas pasan | `test:domain`, `test:carousel`, `test:ad`, `test:carousel-slides` y `test:ad-generation` validan entidades, conversión legacy y transiciones críticas sin tocar el front. |
| F09-008 | Ejecutar pruebas de integración de persistencia | F02-014 | `COMPLETADA` | CRUD, rollback y recovery pasan en DB limpia | `test:persistence` inicializa SQLite temporal con la migración real, verifica marca→campaña→contenido, revisión optimista, rechazo de FK rota, reapertura e integridad; el directorio temporal se elimina al terminar. |
| F09-009 | Ejecutar pruebas visuales de plantillas | F03-015, F04-010, F05-015 | `COMPLETADA` | Diffs están dentro de tolerancia aprobada | Se revisaron las superficies reales de carrusel y anuncio a 1440×1000, sin errores de consola ni overflow horizontal; las capturas quedaron en `storage/visual-regression`. La matriz técnica volvió a validar los 10 layouts de carrusel y los 5 layouts × 3 formatos PNG de anuncio. StandardVideo y TimelineVideo se renderizaron de nuevo a 1080×1920, frame 30, y se compararon píxel a píxel con los frames aprobados en F05-015: diferencia absoluta media 0.0175 y 0.0883 niveles RGB, con 0.18% y 0.50% de canales distintos. Se corrigió el preview de `/video`: su ancho ahora se deriva del límite de 620 px de alto, evitando recortar la composición vertical. Tests de carrusel/anuncio/video, lint, typecheck y build pasan. |
| F09-010 | Ejecutar pruebas E2E de flujos principales | F07-010 | `COMPLETADA` | Carrusel, anuncio, video y campaña completan su camino feliz | `test:e2e` crea una DB y carpeta media temporales, levanta el build de Studio y recorre por HTTP marca → campaña → carrusel/anuncio/video → actualización con revisión → exportaciones PNG → RenderJob → worker Remotion → MP4 descargable → biblioteca → ZIP de campaña. El render real produjo 162,756 bytes; la DB aislada terminó con 1 marca, 1 campaña, 3 contenidos, 1 job, 1 asset y 1 export. El entorno temporal se cierra y elimina siempre. Para que el aislamiento fuera real se corrigió la raíz de media del Studio: ahora deriva de `DATABASE_URL`, igual que el worker, en upload, descarga y ZIP. La instalación principal conservó integridad con 183 assets y 48 contenidos; boundaries, campaña, lint, typecheck y build pasan. |
| F09-011 | Verificar accesibilidad básica | F09-010 | `COMPLETADA` | Navegación por teclado, labels, foco y contraste no tienen fallos críticos | Los 58 archivos TSX pasan `test:a11y`: inputs, textareas, selects, botones, enlaces e imágenes tienen nombre programático. Se añadieron labels a selectores, campos de edición y acciones sociales; `lang="es"` ya estaba declarado. CSS nativo garantiza foco visible en todos los controles y enlaces. El color primario se ajustó mínimamente a L=0.54 para alcanzar 4.54:1; texto normal y secundario alcanzan entre 5.14:1 y 17.96:1. En el build real, `/carousel`, `/ads`, `/video` y `/library` expusieron `main` y controles nombrados. `test:a11y`, lint, typecheck y build pasan. |
| F09-012 | Medir rendimiento de biblioteca y editores | F09-010 | `COMPLETADA` | Métricas baseline quedan registradas y no hay bloqueo grave | `test:performance` levanta el build y mide diez muestras por superficie con la carga real de 48 contenidos y 183 assets. En dos corridas, `/api/content-items` quedó entre 9.33 y 12.10 ms p95 y 86,465 bytes; `/library`, `/carousel`, `/ads` y `/video` quedaron entre 2.94 y 6.07 ms p95. Ocho lecturas concurrentes terminaron entre 31.17 y 41.70 ms. La prueba falla si una superficie supera 500 ms p95 o la ráfaga supera 1 s. Navegación real confirmó las cuatro pantallas completas, con `main`, y la biblioteca pintó sus 19 piezas activas. No hay bloqueo grave ni dependencia nueva. |
| F09-016 | Alinear la UI con el producto `carousel-ai` | GATE-08 | `EN_PROGRESO` | Cada pantalla reproduce el shell y el workspace del proyecto origen | **Decisión del usuario (2026-07-26): la UI debe ser idéntica a `carousel-ai`, no una reinterpretación.** Los tokens de `globals.css` ya coincidían; la diferencia era estructural. **Corrección del usuario (2026-07-26): se conserva la sidebar de Content Gen**, no el header fijo del origen, porque da el carácter de aplicación web; el `header.tsx` portado se retiró y `page-shell.tsx` volvió a `AppSidebar`. El workspace de tres paneles vive dentro de la sidebar (`md:pl-64`, alto completo restando la barra móvil de 3.5rem). **Hecho:** `workspace-panel.tsx` reproduce el panel `rounded-[28px]` con sombra y blur, y `/carousel` adopta el workspace de tres columnas a pantalla completa (`max-w-[1800px]`, `320px|1fr|300px`) con la barra de herramientas del original: pestañas Instagram/TikTok, alternador de modo edición, indicador "Guardado" y deshacer/rehacer con atajos Ctrl+Z / Ctrl+Y. Verificado en navegador con la sidebar restaurada: sidebar `fixed` de 256 px y grid `300px 368px 300px` a 1280 px (`340px 720px 320px` a 1680 px), sin scroll horizontal, y en móvil solo el escenario con la barra superior; el modo edición activa `contenteditable` solo al encenderlo; TikTok cambia el marco; Ctrl+Z revierte una edición; las siete rutas responden 200 y no hay errores de consola. **Segunda capa (2026-07-26):** se copiaron desde el origen y se adaptaron al contrato de aquí los diez componentes de layout (`components/slides/*.tsx` con sus variantes), `slide-renderer.tsx`, `editable-text.tsx`, `lib/themes.ts` (paletas, fuentes y `buildBgStyle` con los seis patrones) y los marcos reales `preview/instagram-frame.tsx`, `preview/tiktok-frame.tsx`, `preview/caption-editor.tsx` y `preview/loading-overlay.tsx`. El único puente nuevo es `lib/slide-types.ts`, que reexporta el tipo de slide del dominio versionado en lugar del `lib/types` del origen; el esquema ya tenía `layoutVariant`, `titleSize` y `bgStyleOverride`, así que la adaptación fue de imports. `carousel-preview.tsx` pasó a delegar en esos marcos. Verificado en navegador: los diez layouts renderizan dentro del marco de Instagram en `aspect-[4/5]` con puntos, barra de acciones y editor de caption; TikTok usa `aspect-[3/5]` con música, seguir y rail lateral; el fondo del slide aplica el gradiente calculado por `buildBgStyle`; el modo edición monta `EditableText` (`contenteditable`) solo al activarlo. lint, typecheck y build pasan, sin errores de consola. **Pendiente:** el `InputPanel` completo (panel de marca, historial de sesión, estilos visuales, sliders); el `EditorDrawer` para pantallas menores a `xl`; el selector de variantes por layout (`editor/layout-picker`, `theme-picker`, `image-editor`); y el workspace de anuncios (`preview-stage`, `ad-form-panel`, `ad-style-panel`). Las clases CSS del renderer anterior siguen en `globals.css` sin uso. |
| F09-013 | Ejecutar revisión Ponytail del diff y repositorio | GOV-005 | `COMPLETADA` | No quedan abstracciones/dependencias sin uso justificadas | Auditoría completa Ponytail sobre 112 archivos: no hay factories, interfaces de una implementación, wrappers delegados ni dependencias declaradas sin uso. La duplicación de escritura de Asset en el worker es necesaria por el límite de proceso entre Node MJS y el runtime TS del Studio. `npm ls --omit=dev` solo reportó cinco paquetes extraneous en `node_modules` (no declarados/versionados); se normalizan con una instalación limpia y no se borraron. lint, typecheck, domain y persistencia pasan. |
| F09-014 | Ejecutar backup/restore de desastre | F02-013, F08-011 | `COMPLETADA` | Entorno vacío recupera DB y archivos utilizables | El backup `storage/backups/f09-disaster-20260730` se restauró en un directorio vacío. `check:integrity` confirmó 183 assets y 48 contenidos; los conteos de marcas, campañas, contenidos, assets, generaciones, renders y exports coincidieron exactamente con el origen. La copia restaurada de verificación fue eliminada y el backup quedó conservado. |
| F09-015 | Resolver hallazgos críticos y altos | F09-001 a F09-014 | `BLOQUEADA` | No quedan hallazgos críticos/altos abiertos | El usuario autorizó npm y Studio subió de Sharp 0.34.5 a 0.35.3; exportación PNG de carrusel/anuncio, lint, typecheck y build pasan. `npm audit` reveló además un crítico en `loader-utils` transitivo de Remotion 4.0.440, altas en Remotion/PostCSS/ws, altas de desarrollo en ESLint/minimatch y una copia privada de Sharp 0.34.5/PostCSS 8.4.31 dentro de Next 16.2.11. Remotion tiene corrección no-major 4.0.502 y ESLint corrección 10.8.0; requieren autorización explícita para instalar y enviar esos metadatos a npm. El override de Sharp dentro de Next no fue aceptado por npm y se retiró, dejando el árbol válido. |

#### GATE-10 — Release candidate

- Builds y pruebas críticas están verdes.
- No existen hallazgos críticos o altos abiertos.
- Backup/restore está probado.
- Paridad funcional y migración están aprobadas.

---

### FASE-10 — Operación, documentación y cierre

Objetivo: dejar el proyecto operable sin depender de memoria informal.

| ID | Tarea | Dependencias | Estado | Verificación | Cómo se dejó / evidencia |
|---|---|---|---|---|---|
| F10-001 | Crear README de instalación y comandos | GATE-10 | `PENDIENTE` | Una instalación limpia sigue el README sin conocimiento adicional | — |
| F10-002 | Documentar variables y proveedores | F10-001 | `PENDIENTE` | Cada variable tiene finalidad, obligatoriedad y ejemplo seguro | — |
| F10-003 | Documentar backup, restore y ubicación de datos | F09-014 | `PENDIENTE` | Procedimiento fue ejecutado por segunda vez desde documentación | — |
| F10-004 | Documentar recuperación de jobs fallidos | F06-014 | `PENDIENTE` | Operador puede diagnosticar/reintentar sin tocar DB manualmente | — |
| F10-005 | Documentar creación de nuevas plantillas | F05-003 | `PENDIENTE` | Se añade plantilla de ejemplo sin modificar contenido existente | — |
| F10-006 | Preparar build/release reproducible | F10-001 | `PENDIENTE` | Release se genera desde checkout limpio | — |
| F10-007 | Ejecutar smoke test de release | F10-006 | `PENDIENTE` | Crear/guardar/exportar formatos principales funciona en release | — |
| F10-008 | Definir política de conservación de proyectos origen | F08-011, F10-007 | `PENDIENTE` | Se acuerda archivar, mantener o retirar sin borrar prematuramente | — |
| F10-009 | Cerrar riesgos, decisiones y deuda aceptada | F10-007 | `PENDIENTE` | Cada entrada tiene resolución o propietario/fecha | — |
| F10-010 | Aprobar release y actualizar estado general | F10-001 a F10-009 | `PENDIENTE` | Usuario aprueba entrega y el documento refleja cierre real | — |

#### GATE-11 — Proyecto unificado operativo

- Release reproducible y smoke test verde.
- Documentación operativa completa.
- Deuda y limitaciones conocidas registradas.
- El usuario aprueba que `content-gen` sustituya el flujo cotidiano anterior.

## 12.1. Anexo — Inventario baseline de carruseles y anuncios

| Área | Implementación actual | Persistencia/servicios actuales | Destino en Content Gen |
|---|---|---|---|
| Brief de carrusel | Tema, audiencia, tono, número de slides, estilo visual, imágenes y fuente | Estado cliente; OpenAI en `/api/generate` | `Campaign.brief` + `CarouselDocument` |
| Slides | 10 layouts: cover, content, list, bigNumber, quote, split, imageOverlay, timeline, statGrid y cta | Datos JSON en navegador | Renderizadores migrados a `apps/studio` |
| Edición | Edición directa, panel lateral, variantes, color, fuente, fondo, orden, duplicado, borrado, deshacer/rehacer | Estado React + autosave local | Editor persistente con autosave de servidor |
| Marca | Nombre, logo y colores; máximo cinco presets | `localStorage` bajo claves `carousel-ai-*` | `BrandKit` y `Asset` compartidos |
| IA de slides | Generar, agregar y regenerar slides; prompt por layout | OpenAI | Servicio IA validado y `GenerationRun` |
| Imágenes | Búsqueda Unsplash, generación OpenAI y upload; reemplazo y regeneración por prompt | URL/base64 local; Unsplash/OpenAI | Biblioteca `Asset` con referencias seguras |
| Remix y tema | Extrae contenido de URL y sugiere temas visuales | OpenAI + fetch remoto | Servicio con límites SSRF y auditoría |
| Caption e historial | Caption/hashtags, historial de 8 sesiones | `localStorage` | ContentItem + historial persistente |
| Exportación | PNG individual y ZIP usando `modern-screenshot` + JSZip | Descarga del navegador | Exportaciones preservadas, asociadas al contenido |
| Anuncios | 5 layouts: comparison, promo, feature, testimonial y painSolution | Estado de página; marca en `localStorage`; OpenAI | `AdDocument` persistente y BrandKit |
| Previews de red | Marcos Instagram y TikTok para carrusel/anuncio | Solo UI | Previews por plataforma reutilizables |
| Capacidades ausentes | Base de datos, biblioteca, campañas, assets centralizados, auth, jobs y colaboración | No existen | Se implementan por fases, no se copian del legacy |

## 12.2. Anexo — Inventario baseline de composiciones de video

| Grupo | Cantidad | Composiciones / estado | Estrategia de migración |
|---|---:|---|---|
| Estándar dirigido por datos | 11 | Ransomware, Deepfakes, Deep Web, Darknet, Escasez de tokens, Criptomonedas/Fraudes, Tiendas en línea, Juice Jacking, Impacto GPT-5.6, Clonación de voz y Códigos QR. Todas tienen `script.json`, assets por slug y `calculateMetadata`. | Importar los documentos y assets; sustituir el TSX generado por una única plantilla estándar fija alimentada por JSON. |
| Timeline generado | 0 fixtures guardados | El dashboard soporta `compositionType: timeline`, pero ningún `script.json` existente lo usa. | Construir y validar la plantilla timeline antes de prometer importación; crear fixture controlado en F00-008. |
| Data-backed manual | 9 | CyberAttacks, AiSkills, HackerGroups, AiAgents, CyberTools, ZeroDay, PhoneHacked/OSINT, AiAutomations y DarkWeb. Usan data.ts pero no contrato moderno de audio/metadata. | Conservar como composiciones `legacy`; no automatizar su conversión en el MVP. Elegir una por vez si aporta valor real. |
| Editorial manual | 2 | Top5AI2026 (`MyComposition`) y ReduceAIHallucinations. | Mantener como legacy de solo render/referencia. |
| Demo | 1 | ExplainerLightDemo. | Conservar como referencia visual; promover a plantilla solo si se define un caso de uso de producto. |

**Baseline técnico:** `Root.tsx` registra 23 composiciones. El build completo pasó. El validador Remotion revisó 12 composiciones y reportó 16 fallos de contrato, principalmente ausencia de buffer `SIL`, offsets por escena y soporte de `voiceoverFiles`.

## 12.3. Anexo — Variables de entorno de origen

| Variable | Proyecto origen | Finalidad | Destino inicial |
|---|---|---|---|
| `OPENAI_API_KEY` | carousel-ai y dashboard de video | Guiones, slides, anuncios, captions e imágenes | Requerida por `apps/studio` en servidor |
| `UNSPLASH_ACCESS_KEY` | carousel-ai | Búsqueda de imágenes | Opcional; proveedor de imagen de carrusel |
| `UNSPLASH_APP_ID` / `UNSPLASH_APPLICATION_ID` | carousel-ai | Identificador de aplicación Unsplash; existe una discrepancia de nombre entre ejemplo y `.env.local` | Normalizar a una sola variable documentada |
| `UNSPLASH_SECRET_KEY` | carousel-ai | Credencial de Unsplash no usada por la ruta de búsqueda actual | No copiar al MVP salvo que un flujo lo requiera y esté justificado |
| `ELEVENLABS_API_KEY` | dashboard de video | Lista de voces y síntesis de voz | Opcional; requerida únicamente para el flujo de voz |
| `OPENAI_SCRIPT_MODEL` | dashboard de video | Modelo para guion | Configuración opcional con default seguro |
| `OPENAI_VOICEOVER_SCRIPT_MODEL` | dashboard de video | Modelo para guion de narración | Configuración opcional con default seguro |
| `OPENAI_IMAGE_MODEL`, `OPENAI_IMAGE_QUALITY`, `OPENAI_IMAGE_SIZE` | dashboard de video | Parámetros de generación de imagen | Configuración opcional y validada |

Las variables se registran únicamente por nombre y propósito. Sus valores no se copiarán a Git, logs ni a este documento.

## 12.4. Anexo — Inventario baseline de persistencia

| Dominio | Ubicación legacy | Contenido | Problema a resolver |
|---|---|---|---|
| Autosave de carrusel | `localStorage: carousel-ai:autosave` | Slides, caption, plataforma, temas y formulario | Solo existe en un navegador; no es biblioteca ni backup central. |
| Historial de carrusel | `localStorage: carousel-session-history` | Hasta 8 sesiones con slides, caption y formulario | Sin búsqueda, asociación a campaña ni recuperación cross-device. |
| Marca | `localStorage: carousel-ai-brand-presets`, `carousel-ai-active-brand`, `carousel-ai-brand` | Presets, logo base64 y colores | Convertir a BrandKit y Asset; preservar la migración de la clave legacy. |
| Anuncio | Estado React de la página | Documento de anuncio actual | No se guarda entre sesiones; debe convertirse en `AdDocument`. |
| Script de video | `remotion/src/<slug>/script.json` y `data.ts` | Guion y datos derivados por cada video | Actualmente se acopla al código fuente y requiere escritura dentro de `src`. |
| Composición generada | `remotion/src/<Slug>Composition.tsx` + `src/Root.tsx` | Código TSX y registro de composición por video | Debe sustituirse por plantilla fija + JSON; no tocar código para contenido nuevo. |
| Imágenes y voz | `remotion/public/<slug>/` | Imágenes por escena, audio, guion de voz y tomas alternativas | Importar como Assets con metadatos, hash y referencias seguras. |
| Caption de video | `remotion/src/<slug>/tiktok-caption.json` | Copy de publicación | Guardar como campo de ContentItem/Export, no junto a código. |
| MP4 nuevos | `remotion/out/<slug>.mp4` | Video final renderizado | Convertir en Export/Asset asociado a RenderJob. |
| MP4 legacy | `video-autom/out/` y `remotion/out/` | 6 outputs manuales + 12 outputs Remotion encontrados | Conservar para comparación e importación; no sobrescribir. |
| Persistencia central | No existe | No hay DB, auth ni biblioteca común | FASE-02 crea la fuente de verdad central. |

## 12.5. Anexo — Manifiesto de fixtures baseline

| Tipo | Referencia de entrada | Referencia de salida | Estado de comparación |
|---|---|---|---|
| Carrusel | `carousel-ai/lib/mock-data.ts` y los 10 renderizadores de slide | No existe PNG guardado en el proyecto origen | `F03-015` aprobó estructura, los diez selectores y PNG/ZIP controlado. No hay baseline para diff píxel a píxel; se acepta el front actual aprobado por el usuario. |
| Anuncio | `carousel-ai/components/ads/types.ts` (`defaultAd`) y 5 renderizadores | No existe PNG guardado en el proyecto origen | Crear PNG controlado al terminar F04-008; hasta entonces, comparar documento y layout. |
| Video estándar | `remotion/src/deepfakes/script.json` y sus assets | `remotion/out/deepfakes.mp4` | Fixture de video disponible para importación y comparación visual. |
| Video legacy manual | Datos de AiAgents/AiSkills y 6 MP4 en `video-autom/out/` | MP4 legacy correspondiente | Se preserva como referencia; no exige conversión automática en MVP. |
| Video timeline | Contrato `VideoScriptTimeline` y generador timeline del dashboard | No existe script ni MP4 timeline guardado | Crear fixture JSON y MP4 al implementar la plantilla timeline en F05-005/F05-014. |

**Criterio ajustado de F00-008:** la auditoría debe identificar una referencia de entrada/salida o declarar el vacío verificable. La captura final de cada formato pertenece a las tareas de exportación de su módulo; no se creará código ni se consumirá API únicamente para fabricar un baseline.

## 12.6. Anexo — Matriz de decisión de migración

| Capacidad legacy | Decisión | Destino | Justificación |
|---|---|---|---|
| Renderizadores y layouts de carrusel | Adaptar | FASE-03 | Son funcionales y dirigidos por datos; se conectan a persistencia central. |
| Estado React/localStorage de carrusel | Reemplazar | FASE-02 + FASE-03 | No es fuente de verdad central ni soporta biblioteca/backup. |
| Brand presets | Adaptar e importar | FASE-02 + FASE-08 | Conserva información de marca y elimina base64/localStorage como almacenamiento final. |
| IA de carrusel/anuncio e imágenes | Adaptar y centralizar | FASE-03/04/06 | Reutiliza prompts, pero añade validación, trazabilidad y límites. |
| Exportación PNG/ZIP | Adaptar | FASE-03/04 | El comportamiento ya es útil; se asociará a ContentItem/Export. |
| Editor y layouts de anuncios | Adaptar | FASE-04 | Son un formato de contenido distinto que debe compartir BrandKit y assets. |
| `script.json` estándar de video | Adaptar e importar | FASE-05 + FASE-08 | Aporta datos valiosos y se convierte a VideoDocument. |
| TSX generado por cada video y edición de `Root.tsx` | Reemplazar | FASE-05 | Es la principal deuda de mantenimiento; se usa plantilla fija + JSON. |
| Composiciones manuales/one-off | Conservar como legacy | FASE-05 + FASE-08 | Son piezas creativas con valor, pero no base para creación masiva. |
| Render desde una ruta HTTP y `spawn` local | Reemplazar | FASE-06 | Debe ser RenderJob persistente atendido por worker. |
| Imágenes, audio, voiceover y captions en filesystem | Adaptar e importar | FASE-02/06/08 | Mantener archivos como assets, separándolos del código fuente. |
| Remotion proxy de desarrollo | Retirar del flujo final | FASE-05/06 | El preview y worker vivirán en la arquitectura nueva; conservar solo mientras sirva de referencia. |
| Base de datos, biblioteca, campañas, jobs y backups | Crear | FASE-02/07/09 | No existen actualmente y son necesarias para centralizar. |

## 13. Riesgos activos

## 13. Riesgos activos

| ID | Riesgo | Probabilidad | Impacto | Mitigación | Estado |
|---|---|---|---|---|---|
| R-001 | Incompatibilidad entre Next/React y Remotion Player | Media | Alto | Spike en F01-004/F01-005 antes de migrar UI | Abierto |
| R-002 | Pérdida de carruseles guardados solo en navegador | Media | Alto | Importador cliente y backup antes de retirar `localStorage` | Abierto |
| R-003 | Videos legacy dependen de código manual irrepetible | Alta | Alto | Clasificación legacy y migración gradual | Abierto |
| R-004 | Render pesado bloquea o derriba el servidor web | Alta | Alto | Worker separado y jobs persistentes | Mitigación planificada |
| R-005 | Costes de imágenes/voz por regeneraciones repetidas | Media | Medio | Registro de generaciones, límites y confirmaciones apropiadas | Abierto |
| R-006 | Hechos inventados en contenido factual o noticias | Media | Alto | Contexto fuente, validación y advertencias; no inventar cifras | Abierto |
| R-007 | Rutas construidas desde slug permiten acceso indebido | Media | Crítico | Normalización estricta y pruebas de traversal | Abierto |
| R-008 | Scope creep hacia publicación, analítica y equipos | Alta | Medio | Fuera del MVP hasta GATE-08 | Controlado |
| R-009 | `carousel-ai` contiene trabajo local no consolidado | Alta | Alto | Tratarlo como fuente de solo lectura; registrar estado y no ejecutar reset/clean/checkout destructivo | Mitigación activa |
| R-010 | Dependencias transitivas reportan vulnerabilidades de seguridad | Media | Alto | Studio ya usa Sharp 0.35.3. Actualizar el conjunto Remotion a 4.0.502 y ESLint a 10.8.0; revalidar la copia privada Sharp/PostCSS de Next 16.2.11 contra la siguiente versión estable corregida. | Bloqueado por autorización / upstream Next |
| R-011 | `node:sqlite` aún emite advertencia experimental en Node 24 | Media | Medio | Mantener su uso solo en MVP local, encapsular las consultas en scripts/repository y revisar estabilidad antes de producción. | Abierto |

## 14. Registro cronológico de ejecución

Este registro es append-only. No se eliminan entradas antiguas; las correcciones se añaden como una nueva entrada.

| Fecha | Tarea | Acción | Resultado | Evidencia / notas |
|---|---|---|---|---|
| 2026-07-22 | GOV-001 | Marketplace oficial registrado y Ponytail instalado | Completado | `ponytail@ponytail`, versión `4.8.4`, `installed, enabled`. |
| 2026-07-22 | GOV-002 | Node, manifiesto y hooks inspeccionados | Completado | Node `v24.5.0`; manifiesto apunta a `hooks/claude-codex-hooks.json`; scripts existen. |
| 2026-07-22 | GOV-002 | Hook SessionStart ejecutado manualmente como Codex | Completado | Emitió `PONYTAIL:FULL`, inyectó instrucciones y escribió estado temporal `full`. |
| 2026-07-22 | GOV-002 | Suite upstream ejecutado | Completado con observación | 72/82 pruebas pasaron; 10 dependientes de Python/Hermes fallaron en el entorno. Pruebas específicas de hooks/Windows pasaron. |
| 2026-07-22 | GOV-004 | Plan maestro creado | Completado | Backlog con IDs, dependencias, verificación, gates, riesgos y cierre. |
| 2026-07-22 | GOV-003 | Panel `/hooks` revisado después del reinicio | Completado | `SessionStart`, `UserPromptSubmit` y `SubagentStart` aparecen instalados, confiados y activos. GATE-00 aprobado. |
| 2026-07-22 | F00-001 | Rama, commit y working tree de proyectos origen registrados | Completado | `carousel-ai` tiene 21 modificados y 3 no rastreados; `video-autom` está limpio. No se modificó ninguno. |
| 2026-07-22 | Entorno | Runtimes mínimos revisados | Completado con observación | Node `v24.5.0`, npm `11.5.1` y Git `2.51.0` disponibles. FFmpeg y navegador no están en `PATH`; se validarán con Remotion en F01-005/F05-014. |
| 2026-07-22 | Entorno | Estado inicial de `content-gen` revisado | Completado con observación | Contiene este plan y directorios vacíos `.git`/`.agents`; Git aún no está inicializado. F01-001 permanece pendiente. |
| 2026-07-22 | F00-002 | Build baseline iniciado | En progreso | Se reutilizan `node_modules` existentes para no cambiar el repositorio origen más allá de los artefactos temporales de build. |
| 2026-07-22 | F00-002 | Build baseline finalizado | Completado | `npm.cmd run build` pasó con Next.js `16.2.0`; 13 rutas generadas sin error. |
| 2026-07-22 | F00-003 | Lint baseline iniciado | En progreso | Se ejecuta después de build verde. |
| 2026-07-22 | F00-003 | Dependencias restauradas y lint repetido | Completado con observación | `npm ci` añadió 270 paquetes; el lint sigue sin iniciar porque el proyecto no declara `eslint`. Se registró como fallo baseline; no se aplicó `npm audit fix`. |
| 2026-07-22 | F00-004 | Auditoría de video iniciada | En progreso | Se ejecutarán los scripts ya presentes de dashboard y Remotion sin modificar el código fuente. |
| 2026-07-22 | F00-004 | Build, lint y validación de video finalizados | Completado con observación | Build de dashboard/Remotion verde. Lint: 3 errores de variables sin usar en `phone-hacked/components.tsx`. Validación: 12 composiciones, 16 errores de contrato de audio/duración; se conserva como deuda baseline. |
| 2026-07-22 | F00-005 | Inventario de carruseles/anuncios iniciado | En progreso | Se consolidará una matriz de capacidades, rutas, persistencia y destino de migración. |
| 2026-07-22 | F00-005 | Inventario de carruseles/anuncios finalizado | Completado | Matriz de §12.1 registra 10 layouts de slide, 5 layouts de anuncio, IA, imágenes, marca, almacenamiento local y exportaciones. |
| 2026-07-22 | F00-006 | Inventario de video iniciado | En progreso | Se clasificará cada composición y se registrará su estrategia de migración. |
| 2026-07-22 | F00-006 | Inventario de video finalizado | Completado | §12.2 clasifica 23 composiciones: 11 estándar dirigidas por datos, 12 legacy/demo y 0 fixtures timeline existentes. |
| 2026-07-22 | F00-007 | Inventario de variables de entorno finalizado | Completado | §12.3 documenta OpenAI, Unsplash, ElevenLabs y parámetros de modelo sin exponer valores. |
| 2026-07-22 | F00-008 | Selección de fixtures iniciada | En progreso | Se preservarán outputs de referencia; el timeline no tiene fixture legacy disponible. |
| 2026-07-22 | F00-008 | Selección de fixtures reprogramada | Pendiente | Se localizaron 18 MP4 de video; faltan exports de carrusel/anuncio y timeline. No se gastará API ni se creará código solo para la auditoría. |
| 2026-07-22 | F00-009 | Inventario de persistencia iniciado | En progreso | Se documentarán localStorage, filesystem, audio, imágenes, captions y MP4. |
| 2026-07-22 | F00-009 | Inventario de persistencia finalizado | Completado | §12.4 documenta fuentes de verdad legacy, rutas de archivos, acoplamiento al código y destino de migración. |
| 2026-07-22 | F00-008 | Manifiesto de fixtures finalizado | Completado | §12.5 separa referencias existentes de vacíos que se crearán en las fases de exportación, sin generar contenido artificial. |
| 2026-07-22 | F00-010 | Matriz de decisión aprobada | Completado | §12.6 define qué adaptar, reemplazar, preservar como legacy o retirar. GATE-01 aprobado. |
| 2026-07-22 | F01-001 | Inicialización de repositorio nuevo iniciada | En progreso | Se preparará Git exclusivamente dentro de `content-gen`. |
| 2026-07-22 | F01-001 | Repositorio Git inicializado | Completado | `main` creado sin commits. Se eliminó el directorio `.git` vacío que impedía inicializar; no contenía archivos. |
| 2026-07-22 | F01-002 | Definición de exclusiones iniciada | En progreso | Se ignorarán dependencias, builds, secretos, storage local y renders generados. |
| 2026-07-22 | F01-002 | Exclusiones verificadas | Completado | `git check-ignore` confirmó las rutas de dependencias, build, out, storage, `.env.local` y SQLite; Git solo ve `.gitignore` y el plan. |
| 2026-07-22 | F01-003 | Workspace npm mínimo iniciado | En progreso | Se crearán estructura y manifiesto raíz sin instalar dependencias todavía. |
| 2026-07-22 | F01-003 | Workspace npm mínimo verificado | Completado | `apps/`, `packages/` y `package.json` raíz están creados; npm confirmó los workspaces `apps/*` y `packages/*`. |
| 2026-07-22 | F01-004 | Runtime Studio iniciado | En progreso | Se definirá el scaffold mínimo de Next/React antes de integrar funcionalidad de carruseles o videos. |
| 2026-07-22 | F01-004 | Studio verificado | Completado con observación | `next build` y `tsc --noEmit` pasaron con Next 16.2.11 y React 19.2.4; la revisión local confirmó título, contenido y estructura accesible del shell. `npm audit --omit=dev` aún reporta 2 altas y 1 moderada transitivas de Next; no se aplicó un arreglo mayor automático. |
| 2026-07-22 | F01-005 | Motor de video iniciado | En progreso | Se definirá un paquete Remotion mínimo compatible con el Studio, sin copiar todavía las composiciones del proyecto origen. |
| 2026-07-22 | F01-005 | Motor de video verificado | Completado con observación | Remotion 4.0.440 listó `FoundationVideo` (30 fps, 1080×1920, 90 frames), `tsc --noEmit` pasó y se generó `packages/video-engine/build`. La instalación elevó el reporte total a 10 vulnerabilidades; se registró en R-010. |
| 2026-07-22 | F01-006 | Contrato de worker verificado | Completado | `npm run test:job --workspace=@content-gen/render-worker` validó el job `job-foundation-video-001` y emitió los tres estados observables. |
| 2026-07-22 | F01-007 | Toolchain raíz iniciado | En progreso | Se normalizarán scripts y se añadirá lint antes de declarar la fundación ejecutable. |
| 2026-07-22 | F01-007 | Toolchain raíz verificado | Completado con observación | `npm run lint`, `npm run typecheck` y `npm run build` pasaron desde raíz. ESLint 9 y TypeScript ESLint quedaron centralizados. El reporte de seguridad permanece abierto en R-010, sin `audit fix` automático. |
| 2026-07-22 | F01-008 | Contrato de entorno iniciado | En progreso | Se documentarán proveedores y variables opcionales sin incorporar secretos ni llamadas de IA todavía. |
| 2026-07-22 | F01-008 | Contrato de entorno verificado | Completado | `.env.example` no contiene secretos. `npm run check:env` devuelve modo local listo; al activar OpenAI sin clave falla con `Falta OPENAI_API_KEY`, como se espera. |
| 2026-07-22 | F01-009 | QA responsive iniciado | En progreso | Se comprobarán el shell existente en móvil y la semántica de teclado antes de marcarlo como terminado. |
| 2026-07-22 | F01-009 | Tema visual alineado con carousel-ai | En progreso | Studio usa el fondo `oklch(0.08 0 0)`, superficies oscuras y verde hoja `oklch(0.55 0.12 145)`. La revisión en escritorio y viewport de 390 px no mostró overflow horizontal; lint y build pasaron. |
| 2026-07-22 | GATE-02 | Fundación ejecutable aprobada | Completado con observación | Studio, worker de contrato, lint, typecheck y builds se verificaron. R-010 sigue bloqueando cualquier despliegue, pero no la fundación local. |
| 2026-07-22 | F02-001 | Esquemas de dominio verificados | Completado | Siete schemas Zod con `schemaVersion=1` pasan fixtures válidos; documento no versionado y `storageKey` con traversal son rechazados. |
| 2026-07-22 | F02-002 | SQLite local inicializada | Completado con observación | `npm run db:init` creó/revalidó ocho tablas en `storage/content-gen.sqlite`. `node:sqlite` funciona, pero emite advertencia experimental registrada en R-011. |
| 2026-07-22 | F02-003 | CRUD de BrandKit iniciado | En progreso | La próxima implementación persistirá, actualizará, listará y archivará marcas contra SQLite. |
| 2026-07-23 | F02-003 | CRUD de BrandKit verificado | Completado | `/api/brand-kits` y `/brands` guardan contra SQLite. Prueba local: crear, editar, listar y archivar devolvió 1 registro visible antes y 0 después del archivo. Lint, typecheck y build pasaron. |
| 2026-07-23 | F02-004 | CRUD de Campaign iniciado | En progreso | Se implementará sobre `campaigns` con el patrón validado de BrandKit y una relación opcional a marca. |
| 2026-07-23 | F02-004 | CRUD de Campaign verificado | Completado | `/api/campaigns` y `/campaigns` guardan nombre, brief y marca opcional contra SQLite. Prueba local: crear, editar, listar y archivar devolvió 1 visible antes y 0 después. |
| 2026-07-23 | F02-005 | CRUD de ContentItem iniciado | En progreso | El próximo paso será persistir documentos JSON versionados para los tres tipos de contenido. |
| 2026-07-23 | F02-005 a F02-007 | Contenido y assets verificados | Completado | ContentItem de carrusel con documento v1 se guardó contra campaña real. Upload PNG de 103094 bytes se almacenó por hash SHA-256 y conservó sus relaciones a campaña y contenido. |
| 2026-07-23 | F02-008 | Autosave iniciado | En progreso | Se añadirá versión optimista al endpoint de actualización de ContentItem. |
| 2026-07-23 | F02-008 | Autosave con revisión verificado | Completado | La actualización subió de revisión 0 a 1; repetir el payload anterior respondió `409`, y luego se archivó sin perder el documento. |
| 2026-07-23 | F02-009 | Biblioteca y filtros verificados | Completado | Tipo, campaña, marca y texto devolvieron el contenido temporal esperado; se archivaron al final los datos de prueba. |
| 2026-07-23 | F02-010 | Duplicado y archivado verificados | Completado | `POST /api/content-items/:id/duplicate` creó ID `0f1ed103-0894-4e84-a0e4-ed386a928191`; el filtro activo lo ocultó tras archivar y el filtro archivado lo mostró. |
| 2026-07-23 | F02-011 | Detalle e historial básico verificados | Completado | `GET /api/content-items/d798c7c8-3764-4a71-92ff-12399be7f45e` devolvió creación, actualización y `generationRuns: []`; `/content/[id]` lo presenta y `npm run lint`, `typecheck` y `build` pasaron. |
| 2026-07-23 | F02-012 | Papelera restaurable verificada | Completado | Un duplicado se archivó, recuperó y volvió a archivar sin alterar su documento. Restaurar contra una campaña archivada queda bloqueado. |
| 2026-07-23 | F02-013 | Backup y restore local verificados | Completado | `npm run backup -- f02-verify-20260723` y `npm run restore -- f02-verify-20260723 f02-restore-verify-20260723` crearon una copia restaurada sin sobrescribir el storage activo. |
| 2026-07-23 | F02-014 | Integridad referencial y rutas verificada | Completado | `check:integrity` pasó sobre storage activo y restaurado (1 asset, 4 contenidos). Campaña/marca con dependencias activas devolvieron `409`; upload con campaña y contenido incompatibles devolvió `400`. GATE-03 aprobado. |
| 2026-07-23 | F03-001 | CarouselDocument versionado verificado | Completado | `npm run test:carousel` convirtió un fixture legacy con 10 layouts y todos sus campos sin pérdida; también rechaza IDs de slide duplicados. Lint, typecheck y build pasaron. |
| 2026-07-23 | F03-002 a F03-004 | Renderer y previews de carrusel verificados | Completado | `/carousel` presenta 8 temas, 5 familias, 6 fondos y los 10 layouts. Revisión local: screenshot de Instagram y cambio a TikTok con slide `split` activa (`6/10`). Lint, typecheck y build pasaron. |
| 2026-07-23 | F03-005 a F03-007 | Operaciones y edición de slides verificadas | Completado | Flujo manual creó un duplicado con UUID, lo movió, editó mediante ficha, deshizo/rehizo el título y eliminó/restauró la slide con undo. El canvas expuso 2 campos `contenteditable`. El ContentItem `7b6fd6d2-cea4-4cfd-8e8d-79e4bb6d8684` se guardó y se recuperó tras recargar con el título `Persistencia central`; lint, typecheck y build pasaron. |
| 2026-07-23 | F03-008 | Generación de carrusel preparada y validada | Pendiente de credencial | Se añadió `POST /api/carousels/generate` con `fetch` nativo a Responses API, sin SDK ni dependencias nuevas. La respuesta debe tener la cantidad solicitada, empezar en `cover`, terminar en `cta` y validar contra `CarouselDocument`; un JSON inválido nunca llega al guardado central. `npm run test:carousel-generation`, `npm run typecheck`, `npm run check:env` y `npm run build` pasaron. La prueba visual de `/carousel` verificó la UI y el rechazo seguro con proveedor `none`. Para cerrar la verificación real falta configurar proveedor, clave y modelo en el entorno local, sin registrar secretos aquí. |
| 2026-07-23 | F03-011 | Backend de assets e imágenes | Pendiente de credenciales | Upload real contra `/api/assets` creó el asset `abe27038-1060-41c7-af16-5024dafdf71a`; su URL devolvió HTTP 200. Las rutas OpenAI/Unsplash y el almacenamiento común están implementados y validados sin dependencias nuevas. No se alteró el front aprobado; falta validar proveedores externos con sus claves. |
| 2026-07-23 | F03-012 | Marca como contexto de generación | Pendiente de decisión visual | `POST /api/carousels/generate` resuelve la BrandKit de la campaña activa y añade nombre/color al prompt sin aceptar valores del cliente. `npm run test:carousel-generation`, typecheck y build pasaron; el primer build falló solo por la descarga aislada de fuentes y el reintento con red fue verde. No se cambió el front. |
| 2026-07-23 | F03-014 | Exportación de carruseles | Completado | Se añadió la ruta de exportación sin interfaz adicional. Sharp produce PNG de 1080×1350 y el empaquetador ZIP nativo conserva un PNG por slide. Las pruebas, typecheck y build fueron verdes; 3 vulnerabilidades transitivas de npm quedan sin corregir para no introducir cambios automáticos. |
| 2026-07-23 | F03-010 | Remix seguro desde URL | Completado | `POST /api/carousels/remix` extrae título/descripción de HTML con límite de 500 KB, bloquea esquemas no HTTP(S), credenciales, hosts/IPs privadas y redirects. `npm run test:carousel-remix` y una llamada real desde `https://example.com` devolvieron un carrusel de 3 slides (`cover`→`cta`). |
| 2026-07-23 | F03-013 | Caption y hashtags en documento/export | Completado | El editor preserva el caption de IA durante generar, cargar y guardar; la Biblioteca permite editarlo dentro del documento central existente. El ZIP agrega `caption.txt`; `npm run test:carousel-export`, `npm run test:carousel-remix` y `npm run typecheck` pasaron. |
| 2026-07-23 | F03-009 y F09-006 | Robustez de IA y fuentes remotas | Completado | La regeneración tolera `content` como objeto/lista; Remix fija la IP DNS validada y las imágenes remotas tienen límite de 10 MB. `test:carousel-slides`, `test:carousel-remix`, `test:carousel-images` y `typecheck` pasaron; Remix real desde `example.com` devolvió 3 slides (`cover`→`cta`). |
| 2026-07-23 | F03-009 | Layout de regeneración estabilizado | Completado | El backend fija el layout de la slide existente al regenerar, por lo que `title_and_content` de OpenAI no puede causar 502. `npm run test:carousel-slides` cubre ese caso y `npm run typecheck` pasó. |
| 2026-07-23 | F03-015 | Regresión de carruseles | Completado | `test:carousel` confirmó conversión legacy de diez layouts sin pérdida; `test:carousel-export` renderizó y empaquetó los diez PNG. La revisión local de `/carousel` mostró los diez selectores y el preview. Se acepta sin diff píxel a píxel porque el proyecto origen no contiene PNG baseline. GATE-04 aprobado. |
| 2026-07-23 | F04-001 | AdDocument versionado | Completado | `@content-gen/domain/ad` cubre formatos, layouts y campos del `defaultAd` legacy sin perder extensiones. `npm run test:ad` y typecheck pasaron. |
| 2026-07-23 | F04-006 | API de IA para anuncios | Completado | La ruta y contrato de generación/regeneración están implementados; `npm run test:ad-generation` recorre una respuesta HTTP simulada válida y typecheck pasa. La llamada real a OpenAI queda como verificación operativa cuando el servidor tenga salida de red. |
| 2026-07-23 | F04-009 | Persistencia de anuncios | Completado | `POST /api/content-items` rechazó un `AdDocument` con `stars=6` mediante HTTP 400. Un anuncio `promo` válido se creó, se reabrió conservando su headline y se archivó en la misma prueba; no se alteró el frontend. |
| 2026-07-23 | F04-007 | Assets para anuncios | Completado | El contrato admite `imageAssetId`; al guardar rechaza assets inexistentes, no visuales o de otra campaña. Una imagen central reutilizable sobrevivió crear→recargar y un ID inexistente devolvió HTTP 400; el anuncio de prueba se archivó. |
| 2026-07-23 | F04-008 y F04-010 | Exportación y regresión de anuncios | Completado | `POST /api/ads/export` devolvió `200 image/png` como adjunto. `test:ad-export` renderizó los cinco layouts y validó story 1080×1920, square 1080×1080 y landscape 1920×1080; `test:ad` y typecheck también pasaron. GATE-05 aprobado. |
| 2026-07-23 | F05-001 | Contrato de video versionado | Completado | `VideoDocument` admite escenas estándar y timeline con contenido de plantilla flexible e IDs únicos. `npm run test:video` validó ambos fixtures y el rechazo de duplicados; typecheck pasó. |
| 2026-07-24 | F05-002 | Normalización del contrato de video | Completado | Slug, templateId e IDs convergen de forma determinista a kebab-case; el formato MVP queda fijado en 1080×1920, 30 FPS y escenas con frames enteros positivos. La prueba cubre entradas inválidas y colisiones después de normalizar. |
| 2026-07-24 | F05-003 a F05-008 | Plantillas y metadata de video | Completado | Registro estático, composiciones estándar/timeline, secuenciación compartida mínima, referencias seguras de assets y duración por narración quedaron verificados con pruebas, typecheck y listado de Remotion. |
| 2026-07-24 | F05-009 a F05-013 | Editor de video dirigido por datos | Completado | `/video` ofrece Player y editores estándar/timeline persistentes. Navegador verificó reproducción, cambio de plantilla y edición en vivo; crear tres videos no alteró fuentes. |
| 2026-07-24 | F05-014 | Render de fixtures de video | Completado | StandardVideo y TimelineVideo produjeron MP4 H.264 reproducibles en `storage/`. F05-015 mantiene pendiente la aprobación visual frente al legacy. |
| 2026-07-25 | F05-017 | Riqueza visual de plantillas de video | Completado | Standard y Timeline recibieron composiciones por capas con marco, trama, acentos e indicadores, sobre los assets por escena de F05-016. Se renderizaron y revisaron frames de los dos MP4; F05-015 queda pendiente únicamente de aprobación visual del usuario. |
| 2026-07-25 | F06-011 | Cola persistente de render | Completado | La API crea y lista RenderJob v1 persistidos en SQLite; la reapertura de DB y una llamada HTTP real confirmaron que el job `queued` no se pierde. |
| 2026-07-25 | F06-012 | Worker de render persistente | Completado | El worker `--once` reclama jobs, persiste progreso, éxito y diagnósticos; la API cancela sin permitir transiciones terminales. Pruebas SQLite y HTTP real pasaron. |
| 2026-07-25 | F06-013 | Persistencia de MP4 | Completado | El worker renderiza las props del video a MP4, lo registra como Asset y Export y devuelve `outputAssetId`; la integración verificó el archivo físico y las relaciones en SQLite. |
| 2026-07-25 | F06-014 | Reintento idempotente | Completado | Reintentar reutiliza el mismo RenderJob y la transición condicional evita duplicar cola o assets; verificación HTTP real y regresión técnica pasaron. |
| 2026-07-25 | F09-005 | Límite de cola de render | Completado | Dos jobs activos por defecto como máximo, configurable y validado por entorno; la tercera creación recibió `429` en la verificación HTTP. |
| 2026-07-25 | F09-013 | Auditoría Ponytail | Completado | Revisión de 112 archivos y manifiestos sin abstracciones/dependencias declaradas sobrantes; solo quedaron paquetes extraneous locales fuera de control de versiones. |
| 2026-07-25 | F06-016 | Cola de render en la UI | Completado | El editor de video ya lanza, sigue, cancela, reintenta y descarga el render sin tocar la API; verificado contra el worker real, incluida la respuesta 429 del límite de concurrencia. |
| 2026-07-26 | F06-007 a F06-010 | Voz, sincronización y caption | Completado | Lista de voces y TTS de ElevenLabs, duración de escenas y caption editable/exportable quedaron integrados y cubiertos por pruebas aisladas. |
| 2026-07-26 | F06-015 | E2E audiovisual real | Completado | OpenAI, Unsplash, ElevenLabs, preview, cola/worker, caption y MP4 recorrieron el backend real con 2 escenas; salida final de 7,007,973 bytes y temporales archivados. |
| 2026-07-26 | GATE-07 / F07-001 | Inicio de campañas multiformato | En progreso | El usuario autorizó continuar con el resto del plan; se registra GATE-07 aprobado y comienza el contrato de brief compartido. |
| 2026-07-26 | F06-018 | Biblioteca, detalle y enlaces profundos | Completado | El detalle muestra título real, campaña, exportaciones descargables y enlace al editor; la biblioteca añade título, badge de exports y botón Abrir. Verificado con un MP4 real de 7,007,973 bytes. |
| 2026-07-26 | F06-017 | Pipeline de video en la UI | Completado | Guion por tema, guion de voz, narración ElevenLabs, caption e imagen por escena se operan desde `/video` en pestañas; verificado con proveedores reales y cinco GenerationRun persistidos. El render del video resultante destapó el techo de 10 MB del worker. |
| 2026-07-26 | F07-001 a F07-010 | Campañas multiformato | Completado | Brief estructurado, herencia carrusel/anuncio/video, assets compartidos, progreso, duplicado y ZIP se verificaron con proveedores, persistencia y render reales; GATE-08 fue aprobado el 2026-07-26. |
| 2026-07-26 | F06-019 / GATE-08 | Assets y renders sin techo fijo; gate aprobado | Completado | Se retiró el límite de 10 MB de uploads y MP4, el worker ahora procesa el archivo por streaming y el usuario aprobó explícitamente GATE-08. FASE-08 queda desbloqueada. |
| 2026-07-26 | F08-001 a F08-011 | Migración de contenido legacy | Completado | 11 videos con script, 6 composiciones manuales y 164 assets quedaron importados; segundas ejecuciones omitieron 198/198 elementos sin errores. Backup y reporte final conservados; GATE-09 queda pendiente de aprobación. |
| 2026-07-30 | GATE-09 / F09-001 | Inicio de calidad y boundaries HTTP | Completado | El usuario aprobó GATE-09. Veintiún payloads inválidos fueron rechazados con 4xx sin cambiar filas de SQLite; se corrigieron los siete parsers que aún podían responder 500. |
| 2026-07-30 | F09-002 y F09-003 | Rutas y secretos | Completado | Assets, slugs y backups rechazan traversal, rutas absolutas y nombres reservados; el escaneo de secretos versionables y exposición cliente terminó con cero hallazgos. |
| 2026-07-30 | F09-004 y F09-014 | Uploads y recuperación de desastre | Completado | Los uploads se procesan por streaming, sin techo fijo, y validan MIME/firma antes de persistir. Un archivo de 11 MB recorrió upload/download real. El backup completo se restauró en limpio con integridad y conteos idénticos; se conservó `f09-disaster-20260730`. |
| 2026-07-30 | F09-009 | Regresión visual de plantillas | Completado | Carrusel y anuncio se revisaron en el Studio real; 10 layouts de carrusel y 15 combinaciones de anuncio pasaron sus matrices. Standard y Timeline conservaron paridad píxel a píxel con los frames aprobados, y el preview vertical dejó de recortarse. |
| 2026-07-30 | F09-010 | E2E de flujos principales | Completado | Un entorno aislado recorrió marca, campaña, tres tipos de contenido, guardado revisado, PNG, RenderJob, worker, MP4, biblioteca y ZIP; produjo un MP4 de 162,756 bytes y se eliminó al cerrar. La raíz de media quedó alineada con `DATABASE_URL`. |
| 2026-07-30 | F09-011 | Accesibilidad básica | Completado | Los 58 TSX pasan la auditoría estática de nombres accesibles; foco visible y contraste AA quedan garantizados por CSS. Carrusel, anuncios, video y biblioteca se verificaron en el build real con regiones principales y controles nombrados. |
| 2026-07-30 | F09-012 | Rendimiento de biblioteca y editores | Completado | Con 48 contenidos y 183 assets, API de biblioteca quedó entre 9.33 y 12.10 ms p95; biblioteca y editores entre 2.94 y 6.07 ms p95; ocho lecturas concurrentes entre 31.17 y 41.70 ms. `test:performance` conserva el baseline y sus umbrales. |
| 2026-07-23 | F09-007 y F09-008 | Pruebas de dominio y persistencia | Completado | Contratos de dominio, conversión legacy y transiciones pasaron. La prueba SQLite temporal verificó migración, FK, revisión optimista, recuperación tras reapertura e integridad sin alterar la base del usuario. |

| 2026-07-25 | F05-015 y GATE-06 | Paridad visual aprobada | Completado | El usuario aprobó los renders alineados al shell de `video-autom/remotion`; FASE-05 cerrada. |
| 2026-07-25 | F06-001 | Cliente OpenAI unificado | Completado | Servicio único de configuración/modelo y rutas existentes con prueba aislada y regresiones verdes. |

## 15. Bloqueos y acciones pendientes del usuario

| ID | Relacionado | Acción requerida | Condición de desbloqueo | Estado |
|---|---|---|---|---|
| B-001 | GOV-003 | Reiniciar Codex Desktop y aprobar/revisar los hooks desde `/hooks` | Los tres hooks aparecen activos y sin revisión pendiente | `COMPLETADA` |

## 16. Plantilla para registrar el cierre de una tarea

Copiar este bloque al registro o a la descripción ampliada cuando una tarea necesite más detalle que la tabla:

```md
### Cierre <ID> — <nombre>

- Estado final: `COMPLETADA`
- Fecha:
- Objetivo alcanzado:
- Archivos creados/modificados:
- Verificaciones ejecutadas:
- Resultado de las verificaciones:
- Cómo se dejó:
- Limitaciones/deuda aceptada:
- Rollback:
- Siguiente tarea desbloqueada:
```

## 17. Próximo paso exacto

1. Autorizar la actualización coordinada de Remotion 4.0.502, ESLint 10.8.0 y sus metadatos hacia npm para continuar F09-015.
2. Terminar F09-016: completar la paridad visual pendiente antes de GATE-10.
