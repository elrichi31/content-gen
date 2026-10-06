"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

export type NoticeTone = "success" | "error";
export type NoticeState = { tone: NoticeTone; message: string } | null;

export const noticeOk = (message: string): NoticeState => ({ tone: "success", message });
export const noticeError = (message: string): NoticeState => ({ tone: "error", message });

/**
 * Resultado de una operación, mostrado como toast (Sonner de shadcn). Las pantallas siguen
 * guardando su aviso en estado y renderizando <Notice>: aquí se convierte en toast.
 *
 * El tono no es decoración: el acierto y el fallo se distinguen. El acierto se va solo —lo que
 * confirma ya está en la pantalla—; el error se queda hasta que alguien lo cierra, porque
 * desaparecer antes de que lo lean es justo cómo se pierde un fallo.
 */
export function Notice({ notice, onDismiss }: { notice: NoticeState; onDismiss: () => void; className?: string }) {
  // El descarte va por referencia: quien lo usa suele pasar una función nueva en cada render.
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  useEffect(() => {
    if (!notice) return;
    // El id es el propio mensaje: el mismo aviso dos veces actualiza el toast en vez de apilarlo.
    const options = { id: `${notice.tone}:${notice.message}`, onDismiss: () => dismiss.current(), onAutoClose: () => dismiss.current() };
    if (notice.tone === "error") toast.error(notice.message, { ...options, duration: Infinity, closeButton: true });
    else toast.success(notice.message, { ...options, duration: 6000 });
  }, [notice]);

  return null;
}
