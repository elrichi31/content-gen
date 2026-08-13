# Operación local

## Inicio y diagnóstico

```bash
nvm use
npm ci
npm run db:init
npm run build
npm start
```

Visita `/diagnostics` para comprobar DB, almacenamiento, worker, runtime e integraciones sin revelar secretos.

## Backup

Detén escrituras activas y ejecuta:

```bash
npm run backup -- antes-de-cambio
```

El backup queda en `storage/backups/antes-de-cambio/` con SQLite, medios y `manifest.json`. Los nombres solo aceptan letras, números, guion, punto y guion bajo.

## Restore seguro

Restore nunca sobrescribe el storage activo; exige una carpeta destino vacía:

```bash
npm run restore -- antes-de-cambio restore-prueba
DATABASE_URL=file:./storage/restore-prueba/content-gen.sqlite npm run check:integrity
```

Después de validar, cambia temporalmente `DATABASE_URL` para abrir la copia restaurada. La sustitución del storage activo debe hacerse con la aplicación detenida y conservando un backup adicional.

## Render jobs

Con `RENDER_WORKER_AUTOSTART=1`, cada job encolado inicia un worker desacoplado. En modo manual:

```bash
npm run worker:once
```

Los jobs fallidos conservan el diagnóstico en la UI. Usa el botón **Reintentar** del editor o del detalle; no edites SQLite manualmente. Un job `processing` sin actividad se considera recuperable y la API lo vuelve a encolar.

Si el render falla repetidamente:

1. Ejecuta `npm run check:env` y `npm run check:integrity`.
2. Confirma espacio disponible en `storage/`.
3. Ejecuta `npm run build` para validar Next.js y Remotion.
4. Pon `RENDER_WORKER_AUTOSTART=0` y ejecuta `npm run worker:once` para observar el error.
5. Conserva el mensaje del job; nunca compartas `.env.local` ni la DB completa como log.

## Release local

```bash
npm ci
npm run verify
npm run test:integration
npm start
```

`npm start` requiere un build previo. Para un release, comprueba al menos crear y guardar una pieza, exportar PNG/ZIP y completar un MP4.
