import type { CanvasSpec } from "@content-gen/domain/canvas";

export type CanvasHtmlOptions = {
  /** Frames por segundo del render (por defecto 60). */
  fps?: number;
  /** Instantes promediados por frame para el motion blur (por defecto 6; en preview siempre 1). */
  subframes?: number;
  /** Preview en vivo: el padre manda el tiempo por postMessage en vez de pedir frames. */
  live?: boolean;
  /** Escala del lienzo respecto a `spec.width × spec.height` (preview más liviano). */
  scale?: number;
  /** Fotos de las escenas como data URL, por id de asset (solo render; la preview las recibe por postMessage). */
  images?: Record<string, string>;
  /** Con `live`: se reproduce sola en bucle, sin reloj del padre (biblioteca de animaciones). */
  autoplay?: boolean;
};

export function buildCanvasHtml(spec: CanvasSpec, options?: CanvasHtmlOptions): string;
export function canvasRuntime(spec: CanvasSpec, options: { fps: number; subframes: number; scale?: number; canvas: HTMLCanvasElement }): {
  duration: number;
  frames: number;
  ready: Promise<boolean>;
  draw(t: number, frame?: number): void;
  setImage(id: string, image: CanvasImageSource & { width: number; height: number }): void;
  renderFrame(frame: number, type?: string, quality?: number): string;
};
