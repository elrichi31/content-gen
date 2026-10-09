# Plantillas de video

Todo video se anima y renderiza con el motor Canvas (`packages/canvas-engine`): cada escena muestra su
título, su foto de fondo opcional y las animaciones de su plan (`scene.content.canvas`). Las plantillas
(`standard`, `timeline`, `explainer`) solo cambian cómo la IA escribe el guion; la imagen final la
deciden las animaciones del catálogo (`CANVAS_TEMPLATE_CATALOG` en `packages/domain/src/canvas.ts`).

## Añadir una plantilla de guion

1. Define el identificador, escenas permitidas y duraciones en `packages/domain/src/video.ts`.
2. Escribe su generación de guion en `apps/studio/src/lib/` (ver `video-generation.ts` y `explainer.ts`).
3. Añade contenido inicial a `STARTER_CONTENT` y soporta la plantilla en `createVideoDocument`.
4. Expón la opción en el editor de Studio.
5. Añade fixtures y pruebas de esquema y de guion.

## Añadir una animación

1. Añade su esquema a `canvasScenePlanSchema`, su resolución en `buildCanvasSpec` y su ficha (con
   `useFor`, `avoid` y un ejemplo que funcione) en `CANVAS_TEMPLATE_CATALOG`.
2. Dibújala en `packages/canvas-engine/src/runtime.js` como función pura del tiempo.
3. Añade su línea de campos al catálogo del prompt en `apps/studio/src/lib/canvas-plan.ts`.
4. Revísala en la biblioteca de animaciones del Studio (`/video/animaciones`) y renderiza un MP4.

## Criterios mínimos

- `VideoDocument` con `schemaVersion` y escenas únicas.
- 1080×1920 a 60 fps (`CANVAS_FPS` lo cambia), salvo decisión documentada.
- Assets referenciados mediante la biblioteca, nunca rutas arbitrarias.
- Duración ajustada por audio cuando exista narración.
- `npm run test:video`, `npm run test:canvas`, `npm run test:canvas-render` y typecheck verdes.
- Render MP4 revisado antes de marcar la plantilla o la animación como disponible.

Finalmente ejecuta:

```bash
npm run verify
npm run test:integration
```
