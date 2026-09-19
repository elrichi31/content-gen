# Despliegue en Dokploy

La imagen (`Dockerfile`) se probó en local: migra sola una base vacía, valida el login con un secreto distinto al del build, renderiza video con Chrome dentro del contenedor y, tras destruirlo y crear otro con la misma base y el mismo volumen, conserva login, datos y MP4. Lo que **no** está probado es el panel de Dokploy en sí: los campos de abajo salen de su documentación oficial, pero no se ejecutaron en un servidor real; compruébalos en tu versión.

## Piezas

| Pieza | Qué es | Dónde vive lo que no se puede perder |
|---|---|---|
| **App** | Este repo, construido con el `Dockerfile`. Incluye el worker de render (la app lo lanza como proceso hijo). | Nada: el contenedor es desechable. |
| **Postgres** | Servicio de base de datos de Dokploy. Guarda el login, campañas, métricas y tokens de TikTok. | En el volumen del propio Postgres. |
| **Volumen de medios** | Carpeta persistente montada en `/app/storage`. Guarda imágenes, audios, videos y renders. | En el volumen. |

## Pasos

1. **Crear el Postgres** (servicio de base de datos, Postgres 14 o superior). Anota su URL *interna*: el host es el nombre del servicio dentro de la red de Dokploy, no `localhost`.
2. **Crear la aplicación** desde el repositorio de GitHub (rama `main`), con tipo de build **Dockerfile**: `Dockerfile Path` = `Dockerfile`, `Docker Context Path` = `.`, y `Docker Build Stage` vacío. No hace falta rellenar «Build Time Arguments» ni «Build-time Secrets»: la imagen no necesita nada en el build.
3. **Variables de entorno** de la aplicación (ver tabla).
4. **Volumen:** monta uno persistente en `/app/storage`. Sin él, cada redeploy borra los medios (el login y los datos no, porque están en Postgres). Que sea un volumen *con nombre* de Docker y no un bind mount: los «Volume Backups» de Dokploy solo funcionan con volúmenes con nombre.
5. **Dominio:** `Host` = tu dominio, `Container Port` = `3000`, **HTTPS** activado y certificado `letsencrypt`. El registro DNS (tipo A) del dominio tiene que apuntar a la IP del servidor. TikTok exige `https` para el redirect.
6. **Desplegar.** El contenedor ejecuta `npm run db:migrate` y luego arranca; en el primer arranque crea todas las tablas y en los siguientes no hace nada. Dokploy ofrece un webhook para redesplegar automáticamente con cada push a GitHub.

## Variables de entorno

| Variable | Valor | Nota |
|---|---|---|
| `DATABASE_URL` | URL interna del Postgres | Obligatoria |
| `BETTER_AUTH_SECRET` | Cadena larga y aleatoria | Obligatoria. `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Si la cambias, se cierran todas las sesiones. |
| `BETTER_AUTH_URL` | `https://tu-dominio` | Recomendada en producción |
| `STORAGE_ROOT` | `/app/storage` | Ya viene en la imagen; solo cámbiala si montas el volumen en otra ruta |
| `LEGAL_CONTACT_EMAIL` | Correo de contacto | Se publica en `/terms` y `/privacy` |
| `CONTENT_GEN_AI_PROVIDER`, `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `UNSPLASH_*` | Las mismas que en `.env.local` | Según lo que uses |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | Del portal de TikTok | Ver más abajo |
| `TIKTOK_REDIRECT_URI` | `https://tu-dominio/api/tiktok/callback` | Igual, carácter por carácter, al registrado en el portal |

No pongas `ALLOW_SIGNUP` en el despliegue: es el interruptor que abre el registro público.

## Primer usuario y datos

**Opción A, empezar de cero.** En la terminal del contenedor:

```bash
ALLOW_SIGNUP=1 npm run auth:create-user -- "correo@ejemplo.com" "una-contraseña-larga" "Nombre"
```

**Opción B, llevarte lo que ya tienes** (login incluido, con la misma contraseña):

1. Desde tu máquina, con un túnel SSH al Postgres del servidor, apunta `DATABASE_URL` a él y ejecuta `npm run db:import-sqlite` (o, con los datos ya en tu Postgres local, haz `pg_dump` y `pg_restore` al del servidor).
2. Copia `storage/media/` al volumen del servidor (`rsync`/`scp`; son unos 5 GB). Los renders viejos de `storage/renders/` y los artefactos de pruebas no hacen falta.

## TikTok

Con el dominio ya activo, en el portal de developers registra como plataforma **Web**: la URL del sitio, `https://tu-dominio/terms`, `https://tu-dominio/privacy` y el redirect `https://tu-dominio/api/tiktok/callback`. Ver `docs/operations.md` para el resto de la operación.

## Respaldos

Pendiente de configurar en el panel, y ambos necesitan un **destino S3** dado de alta en Dokploy (puede ser un bucket externo, no hace falta uno propio):

- **La base:** el servicio Postgres tiene su propia pestaña de backups programados con cron (verifícala en tu versión).
- **Los medios:** sección **Volume Backups**, eligiendo el servicio y el volumen de `/app/storage`, con su cron y su destino S3.

`npm run backup` sirve para una copia puntual desde una máquina con `pg_dump`.

## Seguridad conocida al momento de escribir esto

`npm audit` reporta vulnerabilidades altas y una crítica en `next` 16.0.0–16.3.2 (ejecución remota sin autenticar en el optimizador de imágenes con AVIF, y en servidores Windows). El repo fija `next` en `16.3.0`. Antes de exponer el servidor conviene subir a `16.3.5` o superior.
