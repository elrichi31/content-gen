import { resolve, sep } from "node:path";

export const assetExtensions: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "audio/mpeg": "mp3", "audio/wav": "wav", "video/mp4": "mp4" };
const storageKeyPattern = /^assets\/[a-f0-9]{64}\.(?:jpg|json|mp3|mp4|png|wav|webp)$/;

export function assertAssetMimeType(mimeType: string) {
  if (!assetExtensions[mimeType]) throw new Error("Tipo de archivo no permitido.");
}

export function assertAssetFile(bytes: Buffer, mimeType: string) {
  assertAssetMimeType(mimeType);
  if (bytes.length < 1) throw new Error("El archivo está vacío.");
}

export function assertAssetSignature(bytes: Uint8Array, mimeType: string) {
  const ascii = (start: number, end: number) => Buffer.from(bytes.slice(start, end)).toString("ascii");
  const valid = mimeType === "image/png" ? [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)
    : mimeType === "image/jpeg" ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : mimeType === "image/webp" ? ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP"
        : mimeType === "audio/mpeg" ? ascii(0, 3) === "ID3" || bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0
          : mimeType === "audio/wav" ? ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE"
            : mimeType === "video/mp4" ? ascii(4, 8) === "ftyp"
              : false;
  if (!valid) throw new Error("El contenido no coincide con el tipo declarado.");
}

export function resolveAssetPath(mediaRoot: string, storageKey: string) {
  const root = resolve(mediaRoot); const path = resolve(root, storageKey);
  if (!storageKeyPattern.test(storageKey) || !path.startsWith(`${root}${sep}`)) throw new Error("Ruta de asset inválida.");
  return path;
}

/**
 * Cabecera `Range` de un solo tramo («bytes=0-», «bytes=100-199», «bytes=-500») → bytes inclusivos.
 * `null` = sin Range o con varios tramos (se responde el archivo entero); `"invalid"` = fuera del archivo (416).
 */
export function parseByteRange(header: string | null, size: number): { start: number; end: number } | "invalid" | null {
  const match = header?.trim().match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  return start <= end && start < size ? { start, end } : "invalid";
}
