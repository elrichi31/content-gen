"use client";

import type { AdDocument } from "@content-gen/domain/ad";
import { Heart, MessageCircle, Send, Bookmark, Music2, Search } from "lucide-react";
import { AdRenderer } from "./ad-renderer";

type Platform = "instagram" | "tiktok";

const ratio: Record<AdDocument["format"], number> = { story: 16 / 9, square: 1, landscape: 9 / 16 };

export function AdPlatformFrame({ ad, platform }: { ad: AdDocument; platform: Platform }) {
  const width = platform === "tiktok" ? 300 : 340;
  const height = Math.round(width * ratio[ad.format]);

  if (platform === "tiktok") {
    return (
      <div className="relative overflow-hidden rounded-[1.4rem] border border-white/10 bg-black shadow-2xl shadow-black/50" style={{ width }}>
        <div className="flex items-center justify-center gap-6 py-2 text-xs text-white/60">
          <span>Siguiendo</span>
          <b className="text-white">Para ti</b>
          <Search className="h-3.5 w-3.5" />
        </div>
        <div className="relative" style={{ width, height }}>
          <AdRenderer ad={ad} w={width} h={height} />
          <div className="absolute bottom-16 right-2 flex flex-col items-center gap-4 text-white">
            <div className="flex flex-col items-center gap-1"><Heart className="h-6 w-6" /><span className="text-[10px]">12.4k</span></div>
            <div className="flex flex-col items-center gap-1"><MessageCircle className="h-6 w-6" /><span className="text-[10px]">318</span></div>
            <div className="flex flex-col items-center gap-1"><Send className="h-6 w-6" /><span className="text-[10px]">Enviar</span></div>
            <Music2 className="h-6 w-6 animate-spin-slow" />
          </div>
          <div className="absolute bottom-3 left-3 right-14 text-white">
            <p className="text-sm font-semibold">@content.gen</p>
            <p className="line-clamp-2 text-xs text-white/80">{ad.headline || ad.compHeadline || ad.featHeadline || ad.quote}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-[#0c0d0c] shadow-2xl shadow-black/40" style={{ width }}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">C</div>
        <span className="text-sm font-semibold text-foreground">content.gen</span>
        <span className="ml-auto text-muted-foreground">•••</span>
      </div>
      <div style={{ width, height }}>
        <AdRenderer ad={ad} w={width} h={height} />
      </div>
      <div className="flex items-center gap-4 px-3 py-2.5 text-foreground">
        <Heart className="h-5 w-5" />
        <MessageCircle className="h-5 w-5" />
        <Send className="h-5 w-5" />
        <Bookmark className="ml-auto h-5 w-5" />
      </div>
    </div>
  );
}
