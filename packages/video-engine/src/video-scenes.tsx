import { sceneLeadFrames, sceneTimelineFrames, type HookStyle, type VideoDocument, type VideoNiche, type VideoScene } from "@content-gen/domain/video";
import type { ReactNode } from "react";
import { Audio, Sequence, useVideoConfig } from "remotion";
import { safeContentHeight } from "./text-fit";

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

// Alto aproximado de los elementos de una línea (etiqueta, timestamp, año) y de la barra final.
const LABEL = 44;
const STAMP = 54;
const YEAR = 148;
const BAR = 5;

/**
 * Alto máximo de cada bloque de texto por layout. Las listas y subtítulos tienen un tope fijo
 * y el título se queda con el resto, contando los huecos de cada layout: así la escena entera
 * nunca pasa del área segura y el texto baja de cuerpo en vez de salir cortado.
 */
export const sceneBudgets = (canvasHeight: number) => {
  const h = safeContentHeight(canvasHeight);
  return {
    intro: { subtitle: 260, title: h - LABEL - 32 - 60 - 260 },
    layers: { terminal: 520, definition: h - LABEL - 48 * 2 - 520 },
    phase: { indicator: 560, title: h - STAMP - 44 * 2 - 560 },
    defense: { actions: 760, title: h - LABEL - 48 * 2 - 760 },
    close: { subtitle: 300, title: h - LABEL - 32 - 56 - 300 - 32 - BAR },
    event: { impact: 360, headline: h - LABEL - 24 - YEAR - 28 - 36 - 360 },
  };
};
export const useSceneBudgets = () => sceneBudgets(useVideoConfig().height);

/**
 * Coloca cada escena en su offset con su propio audio, como las composiciones de `video-autom`.
 * La voz de la primera escena entra tras `INTRO_LEAD_FRAMES` para que no se pierda el arranque.
 */
export function VideoScenes({ document, assetBaseUrl, render }: { document: VideoDocument; assetBaseUrl?: string; render: (scene: VideoScene, durationInFrames: number) => ReactNode }) {
  let from = 0;
  return document.scenes.map((scene, index) => {
    const durationInFrames = sceneTimelineFrames(document.scenes, index);
    const lead = sceneLeadFrames(index);
    const start = from;
    from += durationInFrames;
    return (
      <Sequence key={scene.id} from={start} durationInFrames={durationInFrames}>
        {scene.audioAssetId ? <Sequence from={lead} layout="none"><Audio src={assetUrl(scene.audioAssetId, assetBaseUrl)} volume={1} /></Sequence> : null}
        {render(scene, durationInFrames)}
      </Sequence>
    );
  });
}
