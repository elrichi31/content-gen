"use client";

import { Player, Thumbnail } from "@remotion/player";
import { sceneTimelineFrames, timelineTotalFrames, type VideoDocument } from "@content-gen/domain/video";
import { getVideoTemplate } from "@content-gen/video-engine/templates";

/** Inicio y fin (en frames del video) de la escena `index`. */
export function sceneRange(document: VideoDocument, index: number) {
  let start = 0;
  for (let i = 0; i < index; i++) start += sceneTimelineFrames(document.scenes, i);
  return { start, end: start + sceneTimelineFrames(document.scenes, index) - 1 };
}

/**
 * Frame donde la escena ya muestra todo su texto: los bloques entran escalonados y al final
 * baja la opacidad, así que se toma un poco antes del cierre.
 */
const fullFrame = (document: VideoDocument, index: number) => {
  const { start, end } = sceneRange(document, index);
  return Math.max(start, Math.min(end, start + 110, end - 16));
};

const templateFor = (document: VideoDocument) => (getVideoTemplate(document.templateId) ?? getVideoTemplate("standard")!).component;
const common = (document: VideoDocument) => ({
  inputProps: { document, assetBaseUrl: "" },
  durationInFrames: timelineTotalFrames(document.scenes),
  fps: document.fps,
  compositionWidth: document.width,
  compositionHeight: document.height,
});

/** La escena tal como sale en el render (imagen, texto y colores), en un fotograma fijo. */
export function SceneThumbnail({ document, index, className }: { document: VideoDocument; index: number; className?: string }) {
  return (
    <Thumbnail
      component={templateFor(document)}
      {...common(document)}
      frameToDisplay={fullFrame(document, index)}
      style={{ width: "100%", height: "100%" }}
      className={className}
    />
  );
}

/** Reproductor limitado a una escena, con su voz si ya la tiene. */
export function ScenePlayer({ document, index }: { document: VideoDocument; index: number }) {
  const { start, end } = sceneRange(document, index);
  return (
    <Player
      // Al cambiar de escena el rango cambia: se remonta para empezar en la nueva.
      key={`${index}-${start}-${end}`}
      component={templateFor(document)}
      {...common(document)}
      inFrame={start}
      outFrame={end}
      initialFrame={fullFrame(document, index)}
      controls
      clickToPlay
      acknowledgeRemotionLicense
      style={{ width: "100%", aspectRatio: `${document.width} / ${document.height}`, borderRadius: 12, overflow: "hidden" }}
    />
  );
}
