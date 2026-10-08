# Motor Canvas

Tercer motor de render para los videos (sobre todo el educativo, plantilla `explainer`): 1080×1920 a 60 fps,
voz de ElevenLabs por escena y sin música (se pone en TikTok). Hereda la técnica del showreel
(`showreel/DECISIONES.md`): cada frame es una función pura del tiempo pintada con Canvas 2D.

## Piezas

| Pieza | Dónde | Qué hace |
|---|---|---|
| Plan y spec | `packages/domain/src/canvas.ts` | Plantillas (zod), cues anclados a palabras, `buildCanvasSpec(document)` con todo en segundos absolutos |
| Runtime | `src/runtime.js` | Pinta la spec: una función por plantilla, transición entre escenas, título, subtítulos palabra a palabra, motion blur, grano y viñeta |
| Página | `src/build.js` | `buildCanvasHtml(spec, { fps, subframes, live, scale })`: HTML autocontenido con Inter Display en base64 |
| Render | `apps/render-worker/src/canvas.mjs` | Chrome headless por tramos en paralelo → ffmpeg por tramo → concat sin recodificar + voces con `adelay` |
| Plan con IA | `apps/studio/src/lib/canvas-plan.ts` y `POST /api/videos/[id]/canvas-plan` | La IA elige plantilla, datos y cues de cada escena; se guarda en `scene.content.canvas` |
| Preview | `apps/studio/src/components/explainer/canvas-preview.tsx` | La misma runtime en un iframe aislado, en vivo y con las voces |

## Decisiones

- **La runtime se inyecta con `Function.prototype.toString`.** Así el mismo código sirve al worker y al
  Studio (incluido el bundle de Next) sin leer archivos del disco. Por eso `canvasRuntime` no puede usar
  nada de fuera de su cuerpo.
- **Los frames viajan como JPEG q95, no PNG.** Un PNG de 1080×1920 con grano pesa ~4 MB y tardaba
  180-330 ms en codificarse; el JPEG pesa ~0,35 MB y tarda ~40 ms. El destino es H.264 4:2:0 igual.
  Con esto y el fondo cacheado por frame el render pasó de ~5,5 a ~12 frames/s.
- **BT.709 de verdad.** swscale convierte por defecto con la matriz BT.601 aunque el video se etiquete
  709 (los colores salían corridos). Cada tramo convierte con `out_color_matrix=bt709` explícito.
- **Cada tramo se codifica ya con la calidad final** (x264 CRF 17, GOP de 2 s) y se concatenan con
  `-c copy`: una sola pasada de codificación.
- **Un navegador por tramo**, no una pestaña: cada uno tiene su proceso de render y no se pisan la CPU.
- **Voz a -16 LUFS / -1,5 dBTP** (estándar de voz para redes), con margen para la música que se suma en TikTok.
- **Cues que no se dicen se descartan** (`pruneCues`): ese momento se reparte a lo largo de la escena en
  vez de no dispararse nunca. Un plan inválido cae a la plantilla `title`: el plan nunca rompe el render.
- **Fuentes:** subconjuntos latinos de Inter Display 500/700/900 en woff2 (~20 KB cada uno, licencia OFL
  en `fonts/OFL.txt`). Se regeneran con `scripts/embed-fonts.mjs`.

## Números (máquina de 4 núcleos, 3 navegadores)

Video de prueba de 63,5 s con 8 escenas (todas las plantillas): 3808 frames a 60 fps con 6 subframes en
**327 s**. Salida 1080×1920 H.264 High yuv420p BT.709, AAC 48 kHz, -16,0 LUFS. Las voces arrancan en el
`voiceAt` de su escena con error ≤1 ms.

## Variables

- `CANVAS_FPS` (60), `CANVAS_SUBFRAMES` (6), `CANVAS_WORKERS` (núcleos − 1, máx. 4).
- `CANVAS_CHROME_PATH`: Chrome a usar; si no, el Headless Shell que descarga Remotion (`ensureBrowser()`).

## Uso local

```bash
node apps/render-worker/src/canvas.mjs stills documento.json ./frames 0,120,600   # PNG sueltos
node apps/render-worker/src/canvas.mjs video documento.json salida.mp4            # MP3 en <dir>/<audioAssetId>.mp3
```
