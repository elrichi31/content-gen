import { normalizeResponsesUsage } from "@content-gen/domain/cost";

/**
 * `research` y `structuring` existen separados para poder abaratar el radar sin tocar el resto:
 * investigar necesita el modelo bueno porque decide qué buscar y qué creerse; ordenar unas notas
 * ya escritas en JSON, no. Ambos caen al modelo de texto si no se configuran.
 */
export type OpenAiPurpose = "text" | "script" | "voiceoverScript" | "research" | "structuring" | "image";

const modelEnv: Record<OpenAiPurpose, string> = { text: "OPENAI_TEXT_MODEL", script: "OPENAI_SCRIPT_MODEL", voiceoverScript: "OPENAI_VOICEOVER_SCRIPT_MODEL", research: "OPENAI_RESEARCH_MODEL", structuring: "OPENAI_STRUCTURING_MODEL", image: "OPENAI_IMAGE_MODEL" };
const defaults: Record<OpenAiPurpose, string> = { text: "gpt-5.6-sol", script: "gpt-5.6-sol", voiceoverScript: "gpt-5.6-sol", research: "gpt-5.6-terra", structuring: "gpt-5.6-luna", image: "gpt-image-2" };

/**
 * Investigar y estructurar **no** heredan `OPENAI_TEXT_MODEL`. Son los dos pasos del radar, que
 * es donde está el gasto, y hacer que sigan al modelo general significaba pagar el más caro sin
 * decidirlo: en una corrida real, investigar con el modelo insignia costó $1.28.
 *
 * Por defecto investigar usa `terra` (2,5× más barato que `sol`) y estructurar `luna` (25×),
 * porque ordenar unas notas ya escritas en JSON no necesita el modelo bueno.
 */
const INDEPENDENT_PURPOSES = new Set<OpenAiPurpose>(["research", "structuring"]);

export class OpenAiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export function openAiModel(purpose: OpenAiPurpose) {
  const configured = process.env[modelEnv[purpose]]?.trim();
  if (configured) return configured;
  // Imagen y los dos pasos del radar no heredan OPENAI_TEXT_MODEL: cada uno tiene el suyo.
  if (purpose === "image" || INDEPENDENT_PURPOSES.has(purpose)) return defaults[purpose];
  return process.env.OPENAI_TEXT_MODEL?.trim() || defaults[purpose];
}

function configuration(purpose: OpenAiPurpose) {
  if (process.env.CONTENT_GEN_AI_PROVIDER !== "openai") throw new OpenAiError("La IA está desactivada. Configura CONTENT_GEN_AI_PROVIDER=openai para generar.", 503);
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new OpenAiError("Falta configurar OPENAI_API_KEY.", 503);
  return { key, model: openAiModel(purpose) };
}

export async function openAiRequest(purpose: OpenAiPurpose, request: typeof fetch, url: string, init: RequestInit) {
  const { key, model } = configuration(purpose);
  const body = typeof init.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {};
  return request(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...body, model }) });
}

function message(value: unknown, fallback: string) {
  const error = (value as { error?: { message?: unknown } } | null)?.error?.message;
  return typeof error === "string" ? `OpenAI: ${error}` : fallback;
}

function outputText(value: unknown) {
  const response = value as { output_text?: unknown; output?: { content?: { type?: unknown; text?: unknown }[] }[] };
  if (typeof response?.output_text === "string") return response.output_text;
  for (const item of response?.output ?? []) for (const part of item.content ?? []) if (part.type === "output_text" && typeof part.text === "string") return part.text;
  throw new OpenAiError("La IA no devolvió texto JSON.", 502);
}

/**
 * Consumo ya normalizado a las unidades que se facturan. Se hace aquí, sobre el cuerpo completo,
 * porque las llamadas de `web_search` no aparecen en `usage`: hay que contarlas en `output`.
 */
function usage(value: unknown) {
  return normalizeResponsesUsage(value);
}

export type WebSource = { url: string; title: string };

/** Parámetros de seguimiento y de sesión que no deberían acabar publicados en el blog. */
const TRACKING_PARAMS = /^(utm_|msockid$|visit_id$|rd$|gclid$|fbclid$)/;

/**
 * Limpia la URL citada: quita el rastreo (incluido el `utm_source=openai` que añade la búsqueda)
 * y el fragmento. El resto de la query se conserva porque a veces identifica el documento.
 */
function cleanUrl(raw: string) {
  try {
    const url = new URL(raw);
    for (const name of [...url.searchParams.keys()]) if (TRACKING_PARAMS.test(name)) url.searchParams.delete(name);
    url.hash = "";
    return url.toString();
  } catch {
    return raw;
  }
}

function hostnameOf(raw: string) {
  try { return new URL(raw).hostname || raw; }
  catch { return raw; }
}

/**
 * Fuentes que la IA consultó con `web_search`. La Responses API las adjunta como anotaciones
 * del texto; se extraen para poder citarlas en el artículo y comprobar de dónde salió el dato.
 */
export function webSources(value: unknown): WebSource[] {
  const response = value as { output?: { content?: { annotations?: { type?: unknown; url?: unknown; title?: unknown }[] }[] }[] };
  const found = new Map<string, WebSource>();
  for (const item of response?.output ?? []) {
    for (const part of item.content ?? []) {
      for (const annotation of part.annotations ?? []) {
        if (annotation.type !== "url_citation" || typeof annotation.url !== "string") continue;
        const url = cleanUrl(annotation.url);
        // Sin título el enlace saldría como «[](url)»: mejor el dominio que un hueco. La URL
        // puede venir malformada, así que el respaldo del respaldo es la propia cadena.
        const title = typeof annotation.title === "string" && annotation.title.trim()
          ? annotation.title.trim().replace(/\s+/g, " ")
          : hostnameOf(url);
        if (!found.has(url)) found.set(url, { url, title });
      }
    }
  }
  return [...found.values()];
}

/** Herramienta de búsqueda web de la Responses API. */
export const SEARCH_CONTEXT_SIZES = ["low", "medium", "high"] as const;
export type SearchContextSize = (typeof SEARCH_CONTEXT_SIZES)[number];

/**
 * Cuanto contenido de los resultados se le entrega al modelo. Es el unico control DURO sobre el
 * gasto de una busqueda: pedirle al modelo que busque menos es una instruccion que puede ignorar
 * —y en una corrida real se le pidieron 8 busquedas e hizo 19—, mientras que esto lo aplica la API.
 *
 * En el radar, los tokens de entrada que traen las busquedas son ~62% del costo de la corrida.
 */
export function webSearchTool({ contextSize }: { contextSize?: SearchContextSize } = {}) {
  return contextSize
    ? { type: "web_search", search_context_size: contextSize } as const
    : { type: "web_search" } as const;
}

/** Busqueda con el contexto por defecto del proveedor; la usa la redaccion de articulos. */
export const WEB_SEARCH_TOOL = webSearchTool();

/**
 * Texto libre, con herramientas si se piden. La búsqueda web no se puede combinar con el modo
 * JSON («Web Search cannot be used with JSON mode»), así que investigar y redactar son dos pasos.
 */
export async function generateOpenAiText({ system, prompt, purpose = "text", tools, timeoutMs = 120_000, model: override, request = fetch }: {
  system: string;
  prompt: string;
  purpose?: Exclude<OpenAiPurpose, "image">;
  tools?: readonly Record<string, unknown>[];
  timeoutMs?: number;
  /** Modelo explícito para esta llamada; gana sobre la configuración del propósito. */
  model?: string | null;
  request?: typeof fetch;
}) {
  const { key, model: configured } = configuration(purpose);
  const model = override?.trim() || configured;
  const response = await request("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({ model, input: [{ role: "system", content: system }, { role: "user", content: prompt }], ...(tools?.length ? { tools } : {}) }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new OpenAiError(message(body, "No se pudo completar la generación."), 502);
  return { text: outputText(body), model, usage: usage(body), sources: webSources(body) };
}

export async function generateOpenAiJson({ system, prompt, purpose = "text", tools, timeoutMs = 120_000, model: override, request = fetch }: {
  system: string;
  prompt: string;
  purpose?: Exclude<OpenAiPurpose, "image">;
  tools?: readonly Record<string, unknown>[];
  timeoutMs?: number;
  /** Modelo explícito para esta llamada; gana sobre la configuración del propósito. */
  model?: string | null;
  request?: typeof fetch;
}) {
  const { key, model: configured } = configuration(purpose);
  const model = override?.trim() || configured;
  const response = await request("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model,
      input: [{ role: "system", content: system }, { role: "user", content: prompt }],
      text: { format: { type: "json_object" } },
      ...(tools?.length ? { tools } : {}),
    }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new OpenAiError(message(body, "No se pudo completar la generación."), 502);
  try { return { value: JSON.parse(outputText(body)), model, usage: usage(body), sources: webSources(body) }; }
  catch (error) { if (error instanceof OpenAiError) throw error; throw new OpenAiError("La IA no devolvió JSON válido.", 422); }
}

export async function generateOpenAiImage({ prompt, size = "1024x1536", request = fetch }: { prompt: string; size?: "1024x1024" | "1024x1536" | "1536x1024"; request?: typeof fetch }) {
  const { key, model } = configuration("image");
  const response = await request("https://api.openai.com/v1/images/generations", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(120_000), body: JSON.stringify({ model, prompt, size, quality: "low", output_format: "webp" }) });
  const body = await response.json().catch(() => null) as { data?: { b64_json?: unknown }[] } | null;
  const base64 = body?.data?.[0]?.b64_json;
  if (!response.ok || typeof base64 !== "string") throw new OpenAiError(message(body, "OpenAI no devolvió una imagen."), 502);
  return { base64, model };
}
