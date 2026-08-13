# Content Gen

Estudio local para crear, editar, guardar y exportar carruseles, anuncios y videos verticales. Usa Next.js para la interfaz, SQLite y filesystem para persistencia, y Remotion para preview y render MP4.

## Requisitos

- macOS, Linux o Windows.
- NVM recomendado.
- Node.js `24.19.0` y npm `11.17.0` (declarados en `.nvmrc` y `package.json`).

## Instalación

```bash
nvm install
nvm use
npm ci
cp .env.example .env.local
npm run db:init
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). El modo local funciona sin claves externas; la generación con IA, imágenes remotas y voz requieren configurar `.env.local`.

## Comandos principales

```bash
npm run dev               # Studio en desarrollo
npm run build             # Build de Next.js y bundle de Remotion
npm start                 # Servidor de producción después del build
npm test                  # Pruebas locales rápidas
npm run test:integration  # HTTP, SQLite, E2E con MP4 y rendimiento
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
| `DATABASE_URL` | Archivo SQLite local con prefijo `file:` | No |
| `MEDIA_STORAGE_PATH` | Compatibilidad de configuración; los medios siguen la DB | No |
| `MAX_ACTIVE_RENDER_JOBS` | Límite global entre 1 y 10 | No; predeterminado 2 |
| `RENDER_WORKER_AUTOSTART` | `1` automático, `0` manual | No |

## Datos y operación

Los datos locales viven bajo `storage/` y están ignorados por Git. Consulta [Operación](docs/operations.md) para backups, restore y recuperación de renders, y [Plantillas de video](docs/video-templates.md) para ampliar Remotion.

## Validación antes de subir cambios

```bash
npm run verify
```

GitHub Actions ejecuta el mismo comando en pushes a `main`/`master` y pull requests.
