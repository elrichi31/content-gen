"use client";

import { useEffect, useMemo, useRef } from "react";
import { buildCanvasHtml } from "@content-gen/canvas-engine";
import { buildCanvasSpec } from "@content-gen/domain/canvas";
import type { VideoDocument } from "@content-gen/domain/video";

/**
 * Un fotograma de la escena `index` con el motor Canvas, el mismo del render: foto de fondo,
 * animación y texto. Se toma al final de la narración, cuando la escena ya muestra todo.
 */
function SceneFrame({ document, index, scale, className }: { document: VideoDocument; index: number; scale: number; className?: string }) {
  const spec = useMemo(() => buildCanvasSpec(document), [document]);
  const html = useMemo(() => buildCanvasHtml(spec, { live: true, scale }), [spec, scale]);
  const scene = spec.scenes[index];
  const t = scene ? Math.max(scene.start, Math.min(scene.start + scene.duration - 0.3, scene.voiceEnd - 0.1)) : 0;
  const frame = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);

  // El iframe aislado no puede pedir la foto con la sesión: se descarga aquí y se le pasa decodificada.
  useEffect(() => {
    ready.current = false;
    const onMessage = async (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.type !== "canvas-engine:ready") return;
      ready.current = true;
      const target = event.source as Window;
      target.postMessage({ type: "canvas-engine:time", t }, "*");
      if (!scene?.image) return;
      const blob = await fetch(`/api/assets/${scene.image}`).then((response) => (response.ok ? response.blob() : null)).catch(() => null);
      const image = blob ? await createImageBitmap(blob).catch(() => null) : null;
      if (image) target.postMessage({ type: "canvas-engine:image", id: scene.image, image }, "*", [image]);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [html, t, scene?.image]);

  // Cambiar de escena con el mismo documento no recarga el iframe: basta con moverlo de tiempo.
  useEffect(() => { if (ready.current) frame.current?.contentWindow?.postMessage({ type: "canvas-engine:time", t }, "*"); }, [t]);

  return <iframe ref={frame} title={`Escena ${index + 1}`} sandbox="allow-scripts" srcDoc={html} tabIndex={-1} className={className} style={{ width: "100%", height: "100%", border: 0, pointerEvents: "none" }} />;
}

/** Miniatura de la escena tal como sale en el render. */
export function SceneThumbnail({ document, index, className }: { document: VideoDocument; index: number; className?: string }) {
  return <SceneFrame document={document} index={index} scale={0.25} className={className} />;
}

/** Vista previa de una escena en el editor; el video completo, con voz, se reproduce en el paso de render. */
export function ScenePlayer({ document, index }: { document: VideoDocument; index: number }) {
  return (
    <div style={{ width: "100%", aspectRatio: `${document.width} / ${document.height}`, borderRadius: 12, overflow: "hidden", background: "#07080d" }}>
      <SceneFrame document={document} index={index} scale={0.5} />
    </div>
  );
}
