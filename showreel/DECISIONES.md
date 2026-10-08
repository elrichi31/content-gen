# DECISIONES — Showreel de motion design (15 s)

**Entregable:** `showreel.mp4`: 1920×1080, 60 fps (900 frames exactos), H.264 High 4:2:0, AAC 320 kbps, 15.000 s.
Hay además `showreel_envio.mp4`, una copia de 25 MB a 13 Mbps para mandar por chat, porque el master pesa 50 MB.

**Regla del encargo:** solo código. No se usó ningún modelo de imagen, video ni audio, ni samples. Todo lo que se ve se dibuja con Canvas 2D y todo lo que se oye lo calcula `numpy` muestra a muestra.

---

## 1. Idea central

Un showreel de un motion designer tiene que demostrar dos cosas: **gusto** (tipografía, color, ritmo) y **oficio** (easing, timing, principios de animación). Por eso la pieza se cuenta en 8 compases de música, y cada compás enseña una habilidad distinta:

| Compás | Tiempo | Escena | Qué demuestra |
|---|---|---|---|
| 1-2 | 0.00–3.75 | **INTRO**: un punto, una línea de tiempo, MOTION / DESIGN | Minimalismo y revelados con máscara. El playhead "renderiza" el color |
| 3 | 3.75–5.63 | **TYPE**: MOVE · SHAPE · TIME · FEEL | Tipografía cinética, wipes diagonales, golpes en cada kick |
| 4 | 5.63–7.50 | **GRID**: 247 formas | Ondas que se propagan desde cada kick, morph cuadrado↔círculo, giros de 45° en cada clap |
| 5 | 7.50–9.38 | **3D**: 720 puntos | Proyección en perspectiva hecha a mano, morph nube→esfera→cubo→toro→hélice |
| 6 | 9.38–11.25 | **CRAFT**: 4 paneles | Easing con onion skin, squash & stretch, overlap / follow-through, anticipación |
| 7 | 11.25–13.13 | **BUILD**: túnel + 3·2·1 | Tensión creciente, un anillo por cada golpe del redoble |
| 8 | 13.13–15.00 | **HELLO**: impacto + logo | Resolución. El punto del segundo 0 vuela y se convierte en el punto final de "CLAUDE." |

El **punto** es el hilo conductor: abre la pieza, late con el arpegio, se traga la pantalla para dar paso al drop, queda solo en el medio tiempo de silencio y termina como signo de puntuación del logo. Es un bookend que cierra la narrativa.

## 2. Música (src/music.py)

- **128 BPM porque 32 negras duran exactamente 15.000 s.** La duración pedida y la grilla musical coinciden sin redondeos, y cada evento visual cae en un instante musical exacto.
- **Fa menor, Fm–Db–Ab–Eb**: progresión épica y oscura, típica de tráiler o showreel.
- **Síntesis 100% propia:**
  - Kick: seno con barrido de tono más click de ruido.
  - Clap: tres ráfagas de ruido filtrado.
  - Hats: ruido más seis cuadradas inarmónicas, como las cajas de ritmos clásicas.
  - Bajo: sierra PolyBLEP más sub.
  - Supersaw de 7 voces desafinadas y abiertas en estéreo.
  - Plucks con delay ping-pong.
  - Campanas FM con ratio 3.5.
  - Risers de ruido con un SVF que barre.
- **Mezcla y efectos:** sidechain real calculado desde los tiempos del kick. Reverb por convolución con una respuesta al impulso sintética (ruido decreciente que se oscurece con el tiempo y está decorrelado L/R). Medio tiempo de **silencio absoluto** antes del impacto, porque el silencio es lo que hace que el golpe pegue.
- El video importa **exactamente las mismas listas de eventos** (KICKS, CLAPS, STABS, ROLL, BELLS), así que la sincronía es por construcción, no "a ojo".

## 3. Imagen (src/scene.html + src/render.mjs)

- **Cada frame es una función pura del tiempo** (`paint(f)`): no hay simulación con estado. Las partículas usan la solución analítica del arrastre, `x = v/k·(1−e^(−kt))`, y los muelles son osciladores amortiguados cerrados. Esto permite:
  1. Renderizar en **4 navegadores en paralelo** por tramos.
  2. Renderizar cualquier frame suelto para revisarlo.
  3. Obtener resultados reproducibles al bit.
- **Motion blur real** por acumulación de subframes con obturador de 180°: media exacta con alpha 1/(k+1).
- **Post:** aberración cromática ligada a kicks e impacto, viñeta, grano de película (4 tiles sembrados) y shake de cámara determinista.
- **HUD de sala de edición:** marcas de corte, timecode SMPTE, BPM, compás y tiempo con indicador de beat, y nombre de escena. Se dibuja en modo `difference` para que se lea sobre cualquier fondo.
- **Paleta cerrada:** tinta `#0a0a10`, papel `#f2eee5`, naranja `#ff4b1f`, azul eléctrico `#3a4dff` y ácido `#d6ff3a`. **Tipografía:** Inter Display Black más DejaVu Sans Mono, nada más.
- Los textos están en inglés (MOVE, THE CRAFT, SHOWREEL…) porque es el idioma estándar de los reels de motion. Este documento está en español.

## 4. Lo que descarté y por qué

| Opción | Por qué no |
|---|---|
| **ffmpeg puro** (drawtext / filter_complex) | Imposible conseguir este nivel de tipografía y animación con un mantenimiento razonable |
| **HyperFrames / Remotion** (ya están en el repo) | Funcionarían, pero para 15 s auto-contenidos un canvas propio da control total, 0 dependencias nuevas y render por tramos en paralelo |
| **WebGL / shaders** | Chromium headless sin GPU usa raster por software: más riesgo y depuración más lenta, para una ganancia visual que Canvas 2D ya cubría |
| **Simulación de partículas con estado** | Rompe el render en paralelo y el acceso aleatorio a frames. Lo cambié por fórmulas cerradas |
| **Intermedios en PNG a disco** | 900 PNGs de 1080p son ~2.5 GB. Lo cambié por pipe directo a ffmpeg (segmentos x264 qp 4 en 4:4:4) |
| **Saturación tanh fuerte en el master** | Dejaba el tema a -7 LUFS, sin dinámica y con true peak de +2 dB. Ver iteraciones |
| **Reverse swell antes del impacto** | Le quitaba fuerza al silencio. Lo eliminé |
| **Letras en mayúsculas compactas en la intro + timeline debajo** | Chocaban visualmente. Las marcas pasaron a cruzar la línea y las palabras quedaron arriba y abajo |

## 5. Iteraciones

Sin poder escuchar ni ver en tiempo real, cada iteración se basó en **medir**: loudness EBU R128 y bandas espectrales por beat para el audio, y hojas de contactos de frames clave para la imagen.

1. **Audio v1:** -7.2 LUFS, true peak +2.2 dBFS, LRA 2.5. El análisis por bandas mostró graves (kick + sub) 7 dB por encima de los medios y risers saturando >6 kHz. **Arreglo:** kick -3 dB, sub a la mitad, bajo y risers abajo, supersaw y hats arriba, saturación suave. **Resultado:** -10.7 LUFS y -0.8 dB de pico antes del mux; el master final queda en **-13.5 LUFS** con loudnorm a -14 y TP -1.
2. **Render v1:** recursión infinita porque la función `renderFrame` pisaba al wrapper de `window`. Renombrada a `paint`.
3. **Hoja de contactos 1:**
   - Franja roja en el borde durante el impacto: la aberración desplazaba canales y dejaba un hueco. Ahora el rojo se escala desde el centro.
   - Objeto 3D débil: puntos más grandes, núcleo claro y halo aditivo.
   - Túnel del build vacío al principio: anillos con crecimiento más rápido.
4. **Error de perspectiva:** puntos de la nube detrás de la cámara daban un radio negativo. Añadí plano cercano (near-plane clipping).
5. **Hoja de contactos 2:** el barrido de papel mostraba escalones de motion blur. Subí de 4 a **8 subframes**.
6. **Estrobo en 3D:** con 8 subframes, los puntos más rápidos se veían como "cuentas de collar". Tres cambios:
   - Curva `outCubic` en la convergencia desde la nube. `inOutExpo` tiene un pico de velocidad ~7× la media.
   - Tope al tamaño de los puntos cercanos.
   - **Subframes adaptativos:** 16 en los 5 momentos de movimiento extremo.
7. **Verificación final:**
   - `ffprobe`: 1920×1080, 60/1, 900 frames, 15.000 s.
   - Loudness: -13.5 LUFS.
   - **Sincronía:** detecté los 16 kicks en el audio del MP4 y los comparé con el WAV fuente. Error ≤ 0.02 ms (un caso de 4 ms), muy por debajo de un frame (16.7 ms).

## 6. Números

- **Render final:** 3 min 40 s (4 workers de Chromium, 8 subframes, 16 en tramos rápidos), entre 0.15 y 0.5 s por frame y worker.
- **Síntesis de audio:** ~23 s (los filtros variables en el tiempo son un bucle Python).
- **Tiempo total del encargo**, desde la primera orden hasta el entregable verificado: **≈ 20 minutos** (14:39 → 14:59 UTC).

## 7. Cómo reproducirlo

```bash
python3 src/music.py music.wav                 # numpy
node src/render.mjs video showreel.mp4 music.wav 4 8   # Playwright + Chromium + ffmpeg
node src/render.mjs stills ./frames 0,225,450  # frames sueltos para revisar
```
