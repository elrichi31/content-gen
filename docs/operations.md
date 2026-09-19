# Operación

## Inicio y diagnóstico

```bash
nvm use
npm ci
docker compose -f docker-compose.dev.yml up -d   # Postgres local
npm run db:migrate
npm run build
npm start
```

Visita `/diagnostics` para comprobar DB, almacenamiento, worker, runtime e integraciones sin revelar secretos.

## Migraciones de base de datos

Los cambios de esquema son archivos SQL en `db/migrations/`, aplicados en orden con `node-pg-migrate`. Lo aplicado queda registrado en la tabla `pgmigrations` de la propia base: es el historial de qué se le hizo y cuándo.

```bash
npm run db:migrate                 # aplica las pendientes
npm run db:migrate -- status       # aplicadas y pendientes
npm run db:migrate -- down         # deshace la última (solo si el archivo tiene sección Down)
npm run db:migrate:create nombre   # crea un archivo nuevo para escribir el cambio
```

Reglas: nunca se edita una migración ya aplicada (se crea otra); `0001_baseline` es el esquema final que tenía la base en la época SQLite y no es reversible a propósito. En despliegue, `npm run db:migrate` corre antes de arrancar la app.

## Traer datos de la versión con SQLite

```bash
npm run db:import-sqlite                        # origen: storage/content-gen.sqlite
npm run db:import-sqlite -- ruta/otra.sqlite
npm run db:import-sqlite -- --force             # vacía el destino antes de importar
```

Copia todo en una sola transacción, conserva IDs y los hashes de contraseña (el login sigue con la misma clave) y comprueba el número de filas de cada tabla. Se niega a mezclar con un destino que ya tenga datos.

## Backup

Detén escrituras activas y ejecuta (necesita `pg_dump`, el cliente de PostgreSQL, en el PATH):

```bash
npm run backup -- antes-de-cambio
```

El backup queda en `storage/backups/antes-de-cambio/` con `database.dump`, los medios y `manifest.json`. Los nombres solo aceptan letras, números, guion, punto y guion bajo. En el servidor, el respaldo programado de la base conviene dejarlo al servicio de Postgres de Dokploy y respaldar aparte el volumen de medios.

## Restore seguro

Restore nunca sobrescribe lo activo: crea una base nueva y exige una carpeta destino vacía (necesita `pg_restore`):

```bash
npm run restore -- antes-de-cambio restore_prueba
DATABASE_URL=postgres://.../restore_prueba STORAGE_ROOT=./storage/restore_prueba npm run check:integrity
```

El destino es a la vez el nombre de la base nueva (minúsculas, números y `_`) y la carpeta `storage/<destino>` de los medios. La sustitución de lo activo debe hacerse con la aplicación detenida y conservando un backup adicional. Los backups de la época SQLite (`schemaVersion 1`) no se restauran aquí: se traen con `npm run db:import-sqlite`.

## Render jobs

Con `RENDER_WORKER_AUTOSTART=1`, cada job encolado inicia un worker desacoplado. En modo manual:

```bash
npm run worker:once
```

Los jobs fallidos conservan el diagnóstico en la UI. Usa el botón **Reintentar** del editor o del detalle; no edites la base a mano. Un job `processing` sin actividad se considera recuperable y la API lo vuelve a encolar.

Si el render falla repetidamente:

1. Ejecuta `npm run check:env` y `npm run check:integrity`.
2. Confirma espacio disponible en `storage/`.
3. Ejecuta `npm run build` para validar Next.js y Remotion.
4. Pon `RENDER_WORKER_AUTOSTART=0` y ejecuta `npm run worker:once` para observar el error.
5. Conserva el mensaje del job; nunca compartas `.env.local` ni un volcado completo de la base como log.

## Release local

```bash
npm ci
npm run verify
npm run test:integration
npm start
```

`npm start` requiere un build previo. Para un release, comprueba al menos crear y guardar una pieza, exportar PNG/ZIP y completar un MP4.
