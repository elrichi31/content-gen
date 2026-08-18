"use client";

import { topicBrief, type RadarFormat, type RadarTopic } from "@content-gen/domain/radar";
import { useCallback, useEffect, useState } from "react";

/**
 * Enlace profundo desde el radar: `/carousel|/video|/articles?topic=<radarTopicId>`.
 *
 * Sigue la misma convención que `useRequestedContentId` —leer de `window` en un efecto— para no
 * obligar a envolver cada editor en un límite de Suspense.
 *
 * Solo se pasa el identificador por la URL, nunca el encargo entero: el texto de un tema no cabe
 * cómodamente en una query, y traerlo del servidor garantiza que se usa la versión vigente.
 */
export function useRadarTopic(format: RadarFormat) {
  const [topic, setTopic] = useState<RadarTopic | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("topic");
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/radar/topics/${id}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<{ topic: RadarTopic }> : null)
      .then((payload) => { if (!cancelled && payload?.topic) setTopic(payload.topic); })
      // Que el tema no cargue no debe impedir usar el generador a mano.
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  /**
   * Deja constancia de que esta pieza salió del tema. Se llama al guardar, y su fallo no puede
   * tumbar el guardado: perder el enlace es molesto, perder la pieza es grave.
   */
  const link = useCallback(async (contentItemId: string) => {
    if (!topic) return;
    try {
      await fetch(`/api/radar/topics/${topic.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentItemId, format }),
      });
    } catch { /* el enlace es trazabilidad, no parte del guardado */ }
  }, [topic, format]);

  return { topic, loading, brief: topic ? topicBrief(topic, format) : null, link };
}
