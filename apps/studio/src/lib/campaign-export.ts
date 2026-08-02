import type { CarouselDocument } from "@content-gen/domain/carousel";
import type { VideoDocument } from "@content-gen/domain/video";
import { captionText } from "./video-caption.ts";

type Piece = { id: string; type: "carousel" | "ad" | "video"; document: unknown };

export function campaignExportName(type: string, contentItemId: string, format: string) {
  return `${type}-${contentItemId.slice(0, 8)}.${format}`;
}

export function campaignCaptions(pieces: Piece[]) {
  return pieces.flatMap((piece) => {
    if (piece.type === "carousel") {
      const caption = (piece.document as CarouselDocument).caption;
      return caption ? [`[carousel-${piece.id.slice(0, 8)}]`, caption.text, caption.hashtags.join(" "), ""] : [];
    }
    if (piece.type === "video") {
      const caption = captionText(piece.document as VideoDocument);
      return caption ? [`[video-${piece.id.slice(0, 8)}]`, caption, ""] : [];
    }
    const ad = piece.document as { headline?: unknown; body?: unknown };
    const text = [ad.headline, ad.body].filter((value): value is string => typeof value === "string" && Boolean(value)).join("\n");
    return text ? [`[ad-${piece.id.slice(0, 8)}]`, text, ""] : [];
  }).join("\n").trim();
}
