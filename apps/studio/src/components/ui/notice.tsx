"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type NoticeTone = "success" | "error";
export type NoticeState = { tone: NoticeTone; message: string } | null;

export const noticeOk = (message: string): NoticeState => ({ tone: "success", message });
export const noticeError = (message: string): NoticeState => ({ tone: "error", message });

/**
 * Resultado de una operación, con tono.
 *
 * El tono no es decoración: hasta ahora el acierto y el fallo se pintaban igual, así que «no se
 * pudo exportar» salía con el mismo color que «exportado». Un aviso que no distingue las dos cosas
 * es peor que ninguno, porque se lee de reojo y se da por bueno.
 *
 * El acierto se va solo —lo que confirma ya está en la pantalla—; el error se queda hasta que
 * alguien lo cierra, porque desaparecer antes de que lo lean es justo cómo se pierde un fallo.
 */
export function Notice({ notice, onDismiss, className }: { notice: NoticeState; onDismiss: () => void; className?: string }) {
  const tone = notice?.tone;
  const message = notice?.message;

  // El descarte va por referencia: quien lo usa suele pasar una función nueva en cada render, y
  // con ella en las dependencias el temporizador se reiniciaría siempre y el aviso no se iría.
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  useEffect(() => {
    if (tone !== "success" || !message) return;
    const timer = setTimeout(() => dismiss.current(), 6000);
    return () => clearTimeout(timer);
  }, [tone, message]);

  if (!notice) return null;
  const failed = notice.tone === "error";

  return (
    <div
      role={failed ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
        failed ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-primary/30 bg-primary/10 text-foreground",
        className,
      )}
    >
      {failed ? <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden /> : <Check className="mt-px h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />}
      <span className="min-w-0 flex-1 break-words">{notice.message}</span>
      <button type="button" onClick={onDismiss} aria-label="Cerrar aviso" className="shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
