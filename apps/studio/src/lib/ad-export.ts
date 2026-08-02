import sharp from "sharp";
import { adDocumentSchema, type AdDocument } from "@content-gen/domain/ad";

const dimensions = { story: [1080, 1920], square: [1080, 1080], landscape: [1920, 1080] } as const;
const escape = (value: string) => value.replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character] ?? character);

function copy(ad: AdDocument) {
  if (ad.layout === "testimonial") return [ad.quote, `${ad.authorName} · ${ad.authorRole}`, ad.cta];
  if (ad.layout === "comparison") return [ad.compHeadline, `${ad.leftLabel}: ${ad.leftItems.join(" · ")}`, `${ad.rightLabel}: ${ad.rightItems.join(" · ")}`, ad.cta];
  if (ad.layout === "feature") return [ad.featHeadline, ad.featBody, ad.features.map((item) => `${item.emoji} ${item.label}`).join(" · "), ad.cta];
  if (ad.layout === "painSolution") return [`${ad.painEmoji} ${ad.painHeadline}`, ad.painDesc, `${ad.solutionEmoji} ${ad.solutionHeadline}`, ad.solutionDesc, ad.cta];
  return [ad.offerBadge, ad.headline, ad.body, `${ad.originalPrice}  ${ad.newPrice}`, ad.urgency, ad.cta];
}

export async function exportAd(value: unknown) {
  const ad = adDocumentSchema.parse(value); const [width, height] = dimensions[ad.format]; const lines = copy(ad).filter(Boolean).map(escape);
  const lineHeight = Math.max(44, Math.round(height / (lines.length + 5))); const text = lines.map((line, index) => `<text x="${Math.round(width * .08)}" y="${Math.round(height * .2) + index * lineHeight}" fill="${index === 0 ? ad.accentColor : ad.textColor}" font-family="Arial, sans-serif" font-size="${index === 0 ? Math.round(width / 20) : Math.round(width / 30)}" font-weight="${index === 0 ? 700 : 400}">${line}</text>`).join("");
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${ad.bgColor}"/><rect x="${Math.round(width * .08)}" y="${Math.round(height * .1)}" width="${Math.round(width * .12)}" height="8" fill="${ad.accentColor}"/>${text}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
