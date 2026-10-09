# MCP del Studio

Servidor MCP en `/api/mcp` (Streamable HTTP, SDK oficial) para que un agente maneje el Studio.
Acepta dos credenciales:

- **Token fijo (`MCP_TOKEN`)** para clientes que permiten enviar una cabecera: Claude Code, Hermes.
  Acceso completo.
- **OAuth** para ChatGPT, que no permite cabeceras propias. Cada persona autoriza la conexión con
  su cuenta del Studio y la puede revocar.

Cada herramienta llama a la misma ruta de API que usa la pantalla: misma validación, mismas reglas
y el gasto queda registrado en Costos igual que desde la app.

## Qué puede y qué no

- **Puede:** consultar todo; crear y editar marcas, campañas, piezas, pautas, publicaciones,
  automatizaciones y verticales del radar; generar carruseles (editables y de imágenes IA),
  anuncios, artículos y videos (guion, imágenes, animaciones, voz, caption y render); lanzar el radar
  o reinterpretar una búsqueda ya pagada; subir imágenes, audio o video desde una URL pública o en
  base64; ver una imagen guardada; sacar los textos listos para publicar de una campaña.
- **Por dónde empezar:** `resumen_estado` da en una llamada borradores, próximos 7 días, renders,
  gasto del mes, radar y automatizaciones.
- **Exportar PNG de carruseles y anuncios** sigue siendo desde la app: el PNG fiel lo captura el
  navegador; el renderizado del servidor es solo un respaldo sin el diseño.
- **No puede:** borrar ni archivar nada, ni publicar en redes. Lo que genera queda como borrador
  en la biblioteca. `exportar_articulo_blog` escribe el `.md` en el repo del sitio, pero el commit
  lo hace una persona.
- Las herramientas que gastan créditos lo dicen en su descripción (y llevan `openWorldHint`).
- **Lo que gasta pasa por la cola de aprobación.** Esas herramientas no corren al llamarlas:
  devuelven `solicitudId` y quedan `pendiente` en `/queue` (menú Sistema → Cola) hasta que una
  persona las aprueba o rechaza. Lo aprobado se genera de uno en uno, por orden, con su registro
  de pasos. Un pedido idéntico a otro sin terminar no se encola de nuevo (devuelve
  `duplicada: true`): así un agente que reintenta no lanza varios videos. El agente consulta el
  estado y el resultado con `ver_solicitud` y lo encolado con `listar_cola`. Si el servidor se
  reinicia a mitad de una generación, queda `fallida` y no se reintenta sola.

## Activarlo

1. Genera un token y ponlo en `.env.local` (local) o en las variables del despliegue:

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

   ```env
   MCP_TOKEN=el-token
   # Origen público HTTPS, sin barra final. Activa el OAuth de ChatGPT:
   MCP_PUBLIC_ORIGIN=https://studio.tu-dominio.com
   ```

2. Reinicia el Studio. Sin `MCP_TOKEN` ni `MCP_PUBLIC_ORIGIN` la ruta responde 503. La migración
   `0003_mcp_oauth` (tablas de permisos y tokens) se aplica sola al arrancar el contenedor.

El token da acceso completo al Studio: no lo subas a git ni lo pegues en chats. Para revocarlo,
cámbialo y reinicia.

## Conectar Claude Code

```bash
claude mcp add --transport http content-gen http://localhost:3000/api/mcp --header "Authorization: Bearer EL_TOKEN"
```

En producción, cambia la URL por la pública (`https://studio.tu-dominio.com/api/mcp`).

## Conectar Hermes

En la configuración de servidores MCP de Hermes (`~/.hermes/config.yaml`), un servidor HTTP con
la cabecera de autorización:

```yaml
mcp_servers:
  content-gen:
    url: "https://studio.tu-dominio.com/api/mcp"
    headers:
      Authorization: "Bearer EL_TOKEN"
```

Comprueba el formato exacto en la documentación de tu versión de Hermes.

## Conectar ChatGPT

Necesita el Studio desplegado con HTTPS y `MCP_PUBLIC_ORIGIN` configurado (ChatGPT no llega a
`localhost`). Portado del OAuth de control-gastos: ChatGPT se identifica solo con su documento
CIMD y su firma RS256, así que no hay client ID ni secreto que copiar.

1. En ChatGPT, con Developer Mode, crea una app/conector MCP.
2. URL del servidor: `https://studio.tu-dominio.com/api/mcp`.
3. Autenticación: **OAuth** (no "No Authentication"). Deja vacíos el client ID y el secreto.
4. Conecta: inicia sesión en el Studio, revisa los permisos y pulsa **Autorizar conexión**.
5. Prueba primero con una consulta: "lista mis campañas de Content Gen".

Permisos: `studio:read` (solo consultar) y `studio:write` (crear, editar y generar). Con solo
lectura, ChatGPT no ve las herramientas que escriben o gastan.

**Revocar:** `https://studio.tu-dominio.com/api/mcp/connections`, con tu sesión del Studio.
Cambiar la contraseña también corta todas tus conexiones.

**Controles:** consentimiento con sesión real y CSRF; PKCE S256 obligatorio; callback y recurso
fijos; códigos de un solo uso de 5 min; access tokens de 15 min y refresh tokens rotativos de
hasta 30 días (reusar uno ya canjeado revoca la conexión entera); solo se guardan hashes SHA-256;
120 peticiones por minuto por conexión. Si falta la configuración, se rechaza el acceso: nunca
queda abierto.

## Generar un video completo

`generar_video_completo` recibe `campaignId`, `topic` y opciones de plantilla, duración,
contexto, idioma y búsqueda web. La búsqueda web viene apagada (`webSearch: false`): si el
agente ya investigó, pasa lo que encontró en `context`, que el guion usa como fuente de verdad;
actívala solo cuando no haya información previa, porque es la llamada más cara del guion.
En una llamada prepara el guion, guarda el borrador,
genera imágenes (`standard`/`timeline`) o animaciones (`explainer`), añade caption y encola
el render. `imageSource` permite `unsplash` (por defecto), `openai` o `none`.

Para narración, elige un `voiceId` con `listar_voces`; sin él se genera sin voz. `modelId`
es opcional (por defecto `eleven_multilingual_v2`). Consume créditos de los proveedores.

Pasa por la cola (ver arriba): el resultado llega en `ver_solicitud` una vez aprobada y
terminada, e incluye `contentItemId`, `completedSteps`, `renderJob` y `abrir`. No significa
que el MP4 haya terminado: consulta `listar_renders` con ese `contentItemId` hasta que el
trabajo esté `completed`, y usa `ver_asset` con su `outputAssetId` para obtener la URL.
No publica en redes.

Si falla después de guardar, devuelve `status: incomplete`, `contentItemId`, `failedStep`
y `error`. El borrador queda en la biblioteca: continúa con las herramientas de escenas,
voz, caption y render; no repitas la generación completa porque crearía otro borrador y
volvería a gastar. Las escenas se procesan en serie para respetar sus revisiones.

## Tiempos

Las herramientas que gastan responden al instante porque solo encolan; lo que sigue aplica a
lo que tarda la generación una vez aprobada. Casi todo responde en segundos. Tardan más: carrusel de imágenes IA (1-2 min), artículo con
búsqueda web y guion de video con búsqueda (1-3 min) y el radar (varios minutos). Si el cliente
corta antes, sube su timeout de herramientas (en Claude Code, `MCP_TOOL_TIMEOUT` en milisegundos).
El render de video no espera: `renderizar_video` encola el trabajo y `listar_renders` da su avance.
