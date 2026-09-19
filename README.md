# Content Gen

Estudio local para crear, editar, guardar y exportar carruseles, anuncios y videos verticales. Usa Next.js para la interfaz, Postgres para los datos y el login, el filesystem (un volumen) para los medios, y Remotion para preview y render MP4.

## Requisitos

- macOS, Linux o Windows.
- NVM recomendado.
- Node.js `24.19.0` y npm `11.17.0` (declarados en `.nvmrc` y `package.json`).
- Docker (para el Postgres local) o un Postgres 14+ accesible.

## Instalación

```bash
nvm install
nvm use
npm ci
cp .env.example .env.local
docker compose -f docker-compose.dev.yml up -d   # Postgres local en el puerto 5433
npm run db:migrate                               # crea/actualiza las tablas
npm run dev
```

¿Vienes de la versión con SQLite? Trae tus datos (y tu login) con `npm run db:import-sqlite`.

Abre [http://localhost:3000](http://localhost:3000). El modo local funciona sin claves externas; la generación con IA, imágenes remotas y voz requieren configurar `.env.local`.

## Comandos principales

```bash
npm run dev               # Studio en desarrollo
npm run build             # Build de Next.js y bundle de Remotion
npm start                 # Servidor de producción después del build
npm test                  # Pruebas locales rápidas
npm run test:integration  # HTTP, Postgres, E2E con MP4 y rendimiento
npm run db:migrate        # Aplica las migraciones pendientes (db/migrations)
npm run db:migrate -- status   # Qué migraciones hay aplicadas y cuáles pendientes
npm run db:migrate:create nombre   # Crea el archivo de una migración nueva
npm run verify            # Auditoría, secretos, tipos, lint, pruebas y build
npm run worker:once       # Procesa un render pendiente manualmente
npm run check:env         # Valida configuración del entorno
npm run check:integrity   # Revisa DB y referencias de assets
```

## Configuración

Parte de `.env.example`. No versionar `.env` ni `.env.local`.

| Variable | Uso | Obligatoria |
|---|---|---|
| `CONTENT_GEN_AI_PROVIDER` | `none` u `openai` | Sí; `none` para modo local |
| `OPENAI_API_KEY` | Texto e imágenes OpenAI | Solo con proveedor `openai` |
| `OPENAI_TEXT_MODEL` | Modelo general de texto | No |
| `OPENAI_SCRIPT_MODEL` | Modelo para guiones de video | No |
| `OPENAI_VOICEOVER_SCRIPT_MODEL` | Modelo para guion de voz | No |
| `OPENAI_IMAGE_MODEL` | Modelo de generación de imágenes | No |
| `UNSPLASH_ACCESS_KEY` | Búsqueda de imágenes | No |
| `ELEVENLABS_API_KEY` | Voces y narración | No |
| `ELEVENLABS_VOICE_MODEL` | Modelo TTS | No |
| `DATABASE_URL` | URL de Postgres (`postgres://usuario:clave@host:puerto/base`) | Sí |
| `TEST_DATABASE_URL` | Postgres con permiso `CREATE DATABASE`; cada prueba crea y borra su base | Solo para `npm test` |
| `STORAGE_ROOT` | Carpeta con `media/` y `renders/`; en despliegue, un volumen persistente | No; predeterminado `<repo>/storage` |
| `BETTER_AUTH_SECRET` | Firma las sesiones del login | Sí |
| `LEGAL_CONTACT_EMAIL` | Correo público en `/terms` y `/privacy` | No |
| `MAX_ACTIVE_RENDER_JOBS` | Límite global entre 1 y 10 | No; predeterminado 2 |
| `RENDER_WORKER_AUTOSTART` | `1` automático, `0` manual | No |

## Datos y operación

Los datos viven en Postgres; los medios y renders, bajo `storage/` (ignorada por Git). Los cambios de esquema son archivos SQL versionados en `db/migrations/`; el historial de lo aplicado queda en la tabla `pgmigrations`. Consulta [Operación](docs/operations.md) para backups, restore y recuperación de renders, y [Plantillas de video](docs/video-templates.md) para ampliar Remotion.

## Validación antes de subir cambios

```bash
npm run verify
```

GitHub Actions ejecuta el mismo comando en pushes a `main`/`master` y pull requests.
