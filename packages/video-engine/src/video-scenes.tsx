import type { HookStyle, VideoDocument, VideoNiche, VideoScene } from "@content-gen/domain/video";
import type { ReactNode } from "react";
import { Audio, Sequence } from "remotion";
import { sceneFrames } from "./video-metadata";

export const assetUrl = (id: string, assetBaseUrl?: string) => `${(assetBaseUrl ?? "").replace(/\/$/, "")}/api/assets/${id}`;

export const sceneText = (content: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) if (typeof content[key] === "string") return content[key];
  return "";
};

export const sceneLines = (content: Record<string, unknown>, key: string) =>
  Array.isArray(content[key]) ? (content[key] as unknown[]).filter((item): item is string => typeof item === "string") : [];

export const sceneImage = (scene: VideoScene, assetBaseUrl?: string) =>
  scene.imageAssetId ? assetUrl(scene.imageAssetId, assetBaseUrl) : undefined;

// Movimiento del intro según el hook elegido y escala de título según el niche.
export const introMotion = (hookStyle: HookStyle) =>
  hookStyle === "shock" ? { titleFrom: 4, subtitleFrom: 18, titleSize: 148, titleY: 62, subtitleSize: 32 }
    : hookStyle === "countdown" ? { titleFrom: 8, subtitleFrom: 22, titleSize: 142, titleY: 56, subtitleSize: 30 }
      : hookStyle === "contrarian" ? { titleFrom: 10, subtitleFrom: 24, titleSize: 132, titleY: 48, subtitleSize: 31 }
        : hookStyle === "real-story" ? { titleFrom: 12, subtitleFrom: 28, titleSize: 126, titleY: 42, subtitleSize: 33 }
          : { titleFrom: 9, subtitleFrom: 26, titleSize: 136, titleY: 50, subtitleSize: 31 };

export const titleScale = (niche: VideoNiche) => niche === "history" ? 0.94 : niche === "news" ? 0.92 : 1;
export const bodyTitleSize = (niche: VideoNiche) => Math.round((niche === "history" ? 118 : niche === "news" ? 114 : 130) * titleScale(niche));
export const eventTitleSize = (niche: VideoNiche) => Math.round((niche === "history" ? 102 : niche === "news" ? 98 : 110) * titleScale(niche));
export const closeTitleSize = (niche: VideoNiche) => Math.round((niche === "history" ? 104 : niche === "news" ? 92 : 96) * titleScale(niche));

/** Coloca cada escena en su offset con su propio audio, como las composiciones de `video-autom`. */
export function VideoScenes({ document, assetBaseUrl, render }: { document: VideoDocument; assetBaseUrl?: string; render: (scene: VideoScene, durationInFrames: number) => ReactNode }) {
  let from = 0;
  return document.scenes.map((scene) => {
    const durationInFrames = sceneFrames(scene);
    const start = from;
    from += durationInFrames;
    return (
      <Sequence key={scene.id} from={start} durationInFrames={durationInFrames}>
        {scene.audioAssetId ? <Audio src={assetUrl(scene.audioAssetId, assetBaseUrl)} volume={1} /> : null}
        {render(scene, durationInFrames)}
      </Sequence>
    );
  });
}
