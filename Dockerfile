# Imagen para Dokploy (o cualquier Docker). Es un solo servicio: la app lanza al worker de render
# como proceso hijo, así que ambos comparten contenedor. Ver docs/deploy-dokploy.md.
FROM node:24-bookworm-slim

ENV NEXT_TELEMETRY_DISABLED=1

# Librerías que necesita Chrome Headless Shell, con el que el motor Canvas dibuja cada frame, más CA,
# una fuente base y FFmpeg, que codifica el MP4 y mezcla la voz. `unzip`: @puppeteer/browsers baja
# Chrome en .zip y la imagen slim no trae con qué descomprimirlo.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libnss3 libdbus-1-3 libatk1.0-0 libgbm-dev libasound2 libxrandr2 libxkbcommon-dev libxfixes3 \
      libxcomposite1 libxdamage1 libatk-bridge2.0-0 libpango-1.0-0 libcairo2 libcups2 \
      ca-certificates fonts-liberation ffmpeg unzip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
# La caché de npm (~330MB) se borra en la misma capa: en un RUN aparte seguiría pesando en la imagen.
RUN npm ci && npm cache clean --force

# Chrome Headless Shell dentro de la imagen (la versión que espera puppeteer-core): si no, el primer
# render lo descargaría en caliente.
ENV CANVAS_CHROME_CACHE=/app/.chrome
RUN node --input-type=module -e "const { chromePath } = await import('./apps/render-worker/src/canvas.mjs'); console.log(await chromePath());"

# `next build` no abre ninguna conexión, pero exige que DATABASE_URL exista y tenga forma de URL de
# Postgres. Los valores de aquí son de relleno y no quedan en la imagen: en runtime mandan las variables
# de entorno reales (comprobado: Next no fija BETTER_AUTH_SECRET en el build, así que no hace falta
# pasarlo como build arg, que además quedaría visible en el historial de la imagen).
RUN DATABASE_URL=postgres://build:build@localhost:5432/build BETTER_AUTH_SECRET=solo-para-el-build npm run build \
    && rm -rf apps/studio/.next/cache

ENV NODE_ENV=production \
    STORAGE_ROOT=/app/storage

# Carpeta de medios y renders creada en la imagen y declarada como volumen, para que Docker la guarde
# fuera de la capa del contenedor. Ojo: un volumen declarado aquí es anónimo, y un redeploy crea un
# contenedor nuevo con otro volumen vacío. Para no perder nada entre deploys, en Dokploy hay que montar
# un volumen *con nombre* en /app/storage (ver docs/deploy-dokploy.md); ese montaje reemplaza a este.
RUN mkdir -p /app/storage/media /app/storage/renders
VOLUME ["/app/storage"]
EXPOSE 3000

# Migraciones y luego la app. STORAGE_ROOT debe ser un volumen persistente (medios y renders).
CMD ["sh", "-c", "npm run db:migrate && npm start"]
