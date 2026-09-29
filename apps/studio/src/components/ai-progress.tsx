"use client";

import { useEffect, useState } from "react";
import { ThinkingOrb, type OrbState } from "thinking-orbs";

/**
 * Indicador de «la IA está trabajando»: orb animado + porcentaje. Con `percent` muestra el avance
 * real; sin él lo estima por tiempo (sube rápido y se frena antes del 95%, nunca llega solo al 100).
 */
export function AiProgress({ label, percent, estimateMs = 15_000, state = "working", size = 20 }: { label: string; percent?: number; estimateMs?: number; state?: OrbState; size?: 20 | 64 }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (percent !== undefined) return;
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - start), 250);
    return () => clearInterval(timer);
  }, [percent]);
  const value = Math.round(percent ?? 95 * (1 - Math.exp(-3 * elapsed / estimateMs)));
  return (
    <span className="inline-flex items-center gap-2" role="status" aria-live="polite">
      <ThinkingOrb state={state} size={size} aria-label={label} />
      <span>{label}… <span className="tabular-nums">{value}%</span></span>
    </span>
  );
}
