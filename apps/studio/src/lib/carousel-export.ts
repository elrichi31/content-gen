import { crc32 } from "node:zlib";
import sharp from "sharp";
import { carouselDocumentSchema, type CarouselDocument } from "@content-gen/domain/carousel";

const escape = (value = "") => value.replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character] ?? character);
const slideText = (slide: CarouselDocument["slides"][number]) => slide.ctaText ?? slide.quote ?? slide.title ?? slide.bigNumber ?? "Contenido";

export async function renderCarouselPng(document: CarouselDocument, index: number) {
  const slide = document.slides[index]; if (!slide) throw new Error("Slide no encontrada.");
  const height = document.platform === "tiktok" ? 1920 : 1350; const title = escape(slideText(slide)); const detail = escape(slide.content ?? slide.subtitle ?? slide.ctaSubtext ?? slide.quoteAuthor ?? document.topic);
  const svg = `<svg width="1080" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#101210"/><circle cx="900" cy="180" r="280" fill="#62de91" fill-opacity=".16"/><text x="90" y="130" fill="#62de91" font-family="monospace" font-size="28">CONTENT GEN / ${String(index + 1).padStart(2, "0")}</text><text x="90" y="${Math.round(height * .48)}" fill="#f5f5f0" font-family="Georgia, serif" font-size="88" font-weight="400">${title}</text><text x="90" y="${Math.round(height * .61)}" fill="#d8ddd7" font-family="Arial, sans-serif" font-size="34">${detail}</text><text x="90" y="${height - 90}" fill="#8f978f" font-family="monospace" font-size="24">${escape(document.topic)}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export function storedZip(files: { name: string; bytes: Buffer }[]) {
  let offset = 0; const locals: Buffer[] = []; const centrals: Buffer[] = [];
  for (const file of files) {
    const name = Buffer.from(file.name); const checksum = crc32(file.bytes) >>> 0; const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(checksum, 14); local.writeUInt32LE(file.bytes.length, 18); local.writeUInt32LE(file.bytes.length, 22); local.writeUInt16LE(name.length, 26); name.copy(local, 30); locals.push(local, file.bytes);
    const central = Buffer.alloc(46 + name.length); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(checksum, 16); central.writeUInt32LE(file.bytes.length, 20); central.writeUInt32LE(file.bytes.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42); name.copy(central, 46); centrals.push(central); offset += local.length + file.bytes.length;
  }
  const directory = Buffer.concat(centrals); const footer = Buffer.alloc(22); footer.writeUInt32LE(0x06054b50, 0); footer.writeUInt16LE(files.length, 8); footer.writeUInt16LE(files.length, 10); footer.writeUInt32LE(directory.length, 12); footer.writeUInt32LE(offset, 16); return Buffer.concat([...locals, directory, footer]);
}

export async function exportCarousel(value: unknown, format: "png" | "zip") {
  const document = carouselDocumentSchema.parse(value); const files = await Promise.all(document.slides.map(async (_, index) => ({ name: `slide-${String(index + 1).padStart(2, "0")}.png`, bytes: await renderCarouselPng(document, index) })));
  files.push({ name: "caption.txt", bytes: Buffer.from([document.caption.text, ...document.caption.hashtags].filter(Boolean).join("\n")) });
  return format === "png" ? files[0].bytes : storedZip(files);
}
