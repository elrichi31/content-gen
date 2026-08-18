export type OpenAiPurpose = "text" | "script" | "voiceoverScript" | "image";

const modelEnv: Record<OpenAiPurpose, string> = { text: "OPENAI_TEXT_MODEL", script: "OPENAI_SCRIPT_MODEL", voiceoverScript: "OPENAI_VOICEOVER_SCRIPT_MODEL", image: "OPENAI_IMAGE_MODEL" };
const defaults: Record<OpenAiPurpose, string> = { text: "gpt-5.6-sol", script: "gpt-5.6-sol", voiceoverScript: "gpt-5.6-sol", image: "gpt-image-2" };

export class OpenAiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export function openAiModel(purpose: OpenAiPurpose) {
  return process.env[modelEnv[purpose]]?.trim() || (purpose === "image" ? defaults.image : process.env.OPENAI_TEXT_MODEL?.trim() || defaults[purpose]);
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

function usage(value: unknown) {
  const raw = (value as { usage?: unknown } | null)?.usage;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
}

export type WebSource = { url: string; title: string };

/**
 * Fuentes que la IA consultó con `web_search`. La Responses API las adjunta como anotaciones
 * del texto; se extraen para poder citarlas en el artículo y comprobar de dónde salió el dato.
 */
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

export function webSources(value: unknown): WebSource[] {
  const response = value as { output?: { content?: { annotations?: { type?: unknown; url?: unknown; title?: unknown }[] }[] }[] };
  const found = new Map<string, WebSource>();
  for (const item of response?.output ?? []) {
    for (const part of item.content ?? []) {
      for (const annotation of part.annotations ?? []) {
        if (annotation.type !== "url_citation" || typeof annotation.url !== "string") continue;
        const url = cleanUrl(annotation.url);
        // Sin título el enlace saldría como «[](url)»: mejor el dominio que un hueco.
        const title = typeof annotation.title === "string" && annotation.title.trim()
          ? annotation.title.trim().replace(/\s+/g, " ")
          : new URL(url, "https://example.invalid").hostname;
        if (!found.has(url)) found.set(url, { url, title });
      }
    }
  }
  return [...found.values()];
}

/** Herramienta de búsqueda web de la Responses API. */
export const WEB_SEARCH_TOOL = { type: "web_search" } as const;

/**
 * Texto libre, con herramientas si se piden. La búsqueda web no se puede combinar con el modo
 * JSON («Web Search cannot be used with JSON mode»), así que investigar y redactar son dos pasos.
 */
export async function generateOpenAiText({ system, prompt, purpose = "text", tools, timeoutMs = 120_000, request = fetch }: {
  system: string;
  prompt: string;
  purpose?: Exclude<OpenAiPurpose, "image">;
  tools?: readonly Record<string, unknown>[];
  timeoutMs?: number;
  request?: typeof fetch;
}) {
  const { key, model } = configuration(purpose);
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

export async function generateOpenAiJson({ system, prompt, purpose = "text", tools, timeoutMs = 60_000, request = fetch }: {
  system: string;
  prompt: string;
  purpose?: Exclude<OpenAiPurpose, "image">;
  tools?: readonly Record<string, unknown>[];
  timeoutMs?: number;
  request?: typeof fetch;
}) {
  const { key, model } = configuration(purpose);
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

export async function generateOpenAiImage({ prompt, request = fetch }: { prompt: string; request?: typeof fetch }) {
  const { key, model } = configuration("image");
  const response = await request("https://api.openai.com/v1/images/generations", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(120_000), body: JSON.stringify({ model, prompt, size: "1024x1536", quality: "low", output_format: "webp" }) });
  const body = await response.json().catch(() => null) as { data?: { b64_json?: unknown }[] } | null;
  const base64 = body?.data?.[0]?.b64_json;
  if (!response.ok || typeof base64 !== "string") throw new OpenAiError(message(body, "OpenAI no devolvió una imagen."), 502);
  return { base64, model };
}
