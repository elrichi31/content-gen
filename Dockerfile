# Imagen para Dokploy (o cualquier Docker). Es un solo servicio: la app lanza al worker de render
# como proceso hijo, así que ambos comparten contenedor. Ver docs/deploy-dokploy.md.
FROM node:24-bookworm-slim

ENV NEXT_TELEMETRY_DISABLED=1

# Librerías que necesita Chrome Headless Shell, con el que Remotion renderiza el video
# (lista de https://www.remotion.dev/docs/docker) más CA y una fuente base.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libnss3 libdbus-1-3 libatk1.0-0 libgbm-dev libasound2 libxrandr2 libxkbcommon-dev libxfixes3 \
      libxcomposite1 libxdamage1 libatk-bridge2.0-0 libpango-1.0-0 libcairo2 libcups2 \
      ca-certificates fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN npm ci

# Chrome Headless Shell dentro de la imagen: si no, el primer render lo descargaría en caliente.
RUN node --input-type=module -e "import { ensureBrowser } from '@remotion/renderer'; await ensureBrowser();"

# `next build` no abre ninguna conexión, pero exige que DATABASE_URL exista y tenga forma de URL de
# Postgres. Los valores de aquí son de relleno y no quedan en la imagen: en runtime mandan las variables
# de entorno reales (comprobado: Next no fija BETTER_AUTH_SECRET en el build, así que no hace falta
# pasarlo como build arg, que además quedaría visible en el historial de la imagen).
RUN DATABASE_URL=postgres://build:build@localhost:5432/build BETTER_AUTH_SECRET=solo-para-el-build npm run build

ENV NODE_ENV=production \
    STORAGE_ROOT=/app/storage
EXPOSE 3000

# Migraciones y luego la app. STORAGE_ROOT debe ser un volumen persistente (medios y renders).
CMD ["sh", "-c", "npm run db:migrate && npm start"]
