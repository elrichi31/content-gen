import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { z } from "zod";

const maxBytes = 500_000;
const blockedName = (host: string) => host === "localhost" || host.endsWith(".localhost");

function blockedIp(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168;
  }
  const normalized = address.toLowerCase();
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mapped ? blockedIp(mapped) : normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
}

export class RemixError extends Error {
  constructor(message: string) { super(message); }
}

export const carouselRemixInputSchema = z.object({
  url: z.string().trim().url().max(2_000),
  audience: z.string().trim().min(2).max(160).default("Audiencia general"),
  tone: z.string().trim().min(2).max(120).default("Claro y editorial"),
  slideCount: z.number().int().min(3).max(20),
});

export function safeRemixUrl(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port && url.port !== (url.protocol === "https:" ? "443" : "80") || blockedName(url.hostname) || blockedIp(url.hostname)) throw new RemixError("La URL no es pública ni segura para remix.");
  return url;
}

type PublicLoader = (url: URL, address: string) => Promise<string>;

function pageText(url: URL, address: string) {
  return new Promise<string>((resolve, reject) => {
    const client = url.protocol === "https:" ? httpsRequest : httpRequest;
    const request = client(url, { headers: { Accept: "text/html" }, lookup: (_host, options, done) => { const family = isIP(address); if (options.all) done(null, [{ address, family }]); else done(null, address, family); }, servername: url.hostname }, (response) => {
      const length = Number(response.headers["content-length"]);
      if (response.statusCode && (response.statusCode < 200 || response.statusCode >= 300)) { response.resume(); return reject(new RemixError("No se pudo leer la URL para remix.")); }
      if (!String(response.headers["content-type"] ?? "").toLowerCase().includes("text/html")) { response.resume(); return reject(new RemixError("La URL debe devolver una página HTML.")); }
      if (Number.isFinite(length) && length > maxBytes) { response.resume(); return reject(new RemixError("La página supera el límite permitido.")); }
      const chunks: Buffer[] = []; let size = 0;
      response.on("data", (chunk: Buffer) => { size += chunk.length; if (size > maxBytes) response.destroy(new RemixError("La página supera el límite permitido.")); else chunks.push(chunk); });
      response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      response.on("error", reject);
    });
    request.setTimeout(10_000, () => request.destroy(new RemixError("La URL tardó demasiado en responder.")));
    request.on("error", reject); request.end();
  });
}

const clean = (value: string) => value.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]*>/gi, " ").replace(/\s+/g, " ").trim();
function meta(html: string, key: string) { return html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1] ?? ""; }

export function extractRemixContext(html: string) {
  const title = clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const description = clean(meta(html, "description") || meta(html, "og:description"));
  const context = [title, description].filter(Boolean).join(". ").slice(0, 240);
  if (!context) throw new RemixError("No se pudo extraer contexto útil de la URL.");
  return context;
}

type PublicLookup = (hostname: string, options: { all: true; verbatim: true }) => Promise<{ address: string }[]>;

export async function remixContext(value: string, lookup: PublicLookup = dnsLookup, load: PublicLoader = pageText) {
  const url = safeRemixUrl(value); const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.some(({ address }) => blockedIp(address))) throw new RemixError("La URL apunta a una red privada y fue bloqueada.");
  const address = addresses[0]?.address; if (!address) throw new RemixError("La URL no resolvió una IP pública.");
  return extractRemixContext(await load(url, address));
}
