"use client";

import { useEffect, useRef, useState } from "react";
import type { AdDocument } from "@content-gen/domain/ad";
import { InstagramPreview, InstagramStoryPreview, TikTokPreview } from "@/components/preview/social-preview";
import { AdRenderer } from "./ad-renderer";

type Platform = "instagram" | "tiktok";
const ratio: Record<AdDocument["format"], number> = { story: 16 / 9, square: 1, landscape: 9 / 16 };

export function AdPlatformFrame({ ad, platform, profileName, logoUrl }: { ad: AdDocument; platform: Platform; profileName?: string; logoUrl?: string | null }) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(358);
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(1, entry.contentRect.width - 2)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const height = width * ratio[ad.format];
  const creative = <div className="w-full shrink-0" style={{ aspectRatio: `1 / ${ratio[ad.format]}` }}><AdRenderer ad={ad} w={width} h={height} /></div>;
  const shared = { profileName, logoUrl, sponsored: true, cta: ad.cta, caption: { text: ad.headline || ad.compHeadline || ad.featHeadline || ad.quote, hashtags: [] } };
  return <div ref={container} className="w-full min-w-0 max-w-[360px]">
    {platform === "tiktok" ? <TikTokPreview {...shared}><div className="flex h-full w-full items-center bg-black">{creative}</div></TikTokPreview> : ad.format === "story" ? <InstagramStoryPreview {...shared}>{creative}</InstagramStoryPreview> : <InstagramPreview {...shared} mediaRatio={`1 / ${ratio[ad.format]}`}>{creative}</InstagramPreview>}
  </div>;
}
