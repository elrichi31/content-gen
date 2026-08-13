# Plantillas de video

Las plantillas son código estable alimentado por `VideoDocument`; un video nuevo no debe generar ni modificar TSX.

## Añadir una plantilla

1. Define el identificador, escenas permitidas y duraciones en `packages/domain/src/video.ts`.
2. Crea el componente Remotion en `packages/video-engine/src/` usando exclusivamente props del documento.
3. Registra composición, dimensiones, FPS, props y metadata en `packages/video-engine/src/template-registry.ts`.
4. Añade contenido inicial a `STARTER_CONTENT` y soporta la plantilla en `createVideoDocument`.
5. Expón la opción en el editor de Studio.
6. Añade fixtures y pruebas de esquema, metadata, preview y render.

## Criterios mínimos

- `VideoDocument` con `schemaVersion` y escenas únicas.
- 1080×1920, 30 FPS para el MVP vertical, salvo decisión documentada.
- Assets referenciados mediante la biblioteca, nunca rutas arbitrarias.
- Duración ajustada por audio cuando exista narración.
- `npm run test:video`, `npm run test:video-metadata`, typecheck y bundle Remotion verdes.
- Render MP4 revisado antes de marcar la plantilla como disponible.

Finalmente ejecuta:

```bash
npm run verify
npm run test:integration
```
