# MCP del Studio

Servidor MCP en `/api/mcp` (Streamable HTTP, SDK oficial) para que un agente maneje el Studio:
Claude Code, Hermes o cualquier cliente MCP que permita enviar una cabecera.

Cada herramienta llama a la misma ruta de API que usa la pantalla: misma validación, mismas reglas
y el gasto queda registrado en Costos igual que desde la app.

## Qué puede y qué no

- **Puede:** consultar todo; crear y editar marcas, campañas, piezas, pautas, publicaciones,
  automatizaciones y verticales del radar; generar carruseles (editables y de imágenes IA),
  anuncios, artículos y videos (guion, imágenes, animaciones, voz, caption y render); lanzar el radar.
- **No puede:** borrar ni archivar nada, ni publicar en redes. Lo que genera queda como borrador
  en la biblioteca. `exportar_articulo_blog` escribe el `.md` en el repo del sitio, pero el commit
  lo hace una persona.
- Las herramientas que gastan créditos lo dicen en su descripción (y llevan `openWorldHint`).

## Activarlo

1. Genera un token y ponlo en `.env.local` (local) o en las variables del despliegue:

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

   ```env
   MCP_TOKEN=el-token
   # Solo si el Studio va detrás de un proxy y la URL interna no es la pública:
   MCP_PUBLIC_ORIGIN=https://studio.tu-dominio.com
   ```

2. Reinicia el Studio. Sin `MCP_TOKEN` (o con menos de 32 caracteres) la ruta responde 503.

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

## Tiempos

Casi todo responde en segundos. Tardan más: carrusel de imágenes IA (1-2 min), artículo con
búsqueda web y guion de video con búsqueda (1-3 min) y el radar (varios minutos). Si el cliente
corta antes, sube su timeout de herramientas (en Claude Code, `MCP_TOOL_TIMEOUT` en milisegundos).
El render de video no espera: `renderizar_video` encola el trabajo y `listar_renders` da su avance.
