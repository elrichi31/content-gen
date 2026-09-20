import type { CSSProperties } from "react";

/** Archivo variable (ancho 62–125): titular condensado y cuerpo normal salen de la misma familia. */
export const FONT = "var(--font-ad), Archivo, 'Arial Narrow', sans-serif";

export const fill: CSSProperties = { position: "absolute", left: 0, top: 0, right: 0, bottom: 0 };

/** Titular de cartel: condensado, negro, en mayúsculas y con el interlineado apretado. */
export const display = (size: number): CSSProperties => ({ fontFamily: FONT, fontWeight: 900, fontStretch: "62%", fontVariationSettings: "'wdth' 62", textTransform: "uppercase", letterSpacing: "-0.01em", lineHeight: 0.92, fontSize: size, margin: 0 });

/** Texto corrido. `stretch` estrecha un poco las citas largas sin llegar al condensado del titular. */
export const copy = (size: number, weight = 500, stretch = 100): CSSProperties => ({ fontFamily: FONT, fontWeight: weight, fontStretch: `${stretch}%`, fontSize: size, lineHeight: 1.22, margin: 0 });

type IconProps = { size: number | string; color?: string };
const stroke = { fill: "none", strokeWidth: 3.2, strokeLinecap: "square", strokeLinejoin: "miter" } as const;
/** `size` numérico va en píxeles (anuncios); una cadena como "6cqw" escala con el lienzo (carruseles). */
const dims = (size: number | string) => ({ width: typeof size === "number" ? size : undefined, height: typeof size === "number" ? size : undefined, style: { width: size, height: size, flexShrink: 0 } as CSSProperties });

export const Check = ({ size, color = "currentColor" }: IconProps) => <svg {...dims(size)} viewBox="0 0 24 24" stroke={color} {...stroke}><path d="M4 12.5 9.5 18 20 6.5" /></svg>;
export const Cross = ({ size, color = "currentColor" }: IconProps) => <svg {...dims(size)} viewBox="0 0 24 24" stroke={color} {...stroke}><path d="M5 5 19 19M19 5 5 19" /></svg>;
export const Arrow = ({ size, color = "currentColor", down = false }: IconProps & { down?: boolean }) => { const d = dims(size); return <svg width={d.width} height={d.height} style={down ? { ...d.style, transform: "rotate(90deg)" } : d.style} viewBox="0 0 24 24" stroke={color} {...stroke}><path d="M4 12h15M13 5.5 19.5 12 13 18.5" /></svg>; };
export const Clock = ({ size, color = "currentColor" }: IconProps) => <svg {...dims(size)} viewBox="0 0 24 24" stroke={color} {...stroke} strokeWidth={2.6}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
export const Star = ({ size, color = "currentColor", filled = true }: IconProps & { filled?: boolean }) => <svg {...dims(size)} viewBox="0 0 24 24" fill={filled ? color : "none"} stroke={color} strokeWidth={filled ? 0 : 1.6}><path d="m12 2.5 2.9 6.2 6.6.8-4.9 4.6 1.3 6.7L12 17.6 6.1 20.8l1.3-6.7L2.5 9.5l6.6-.8z" /></svg>;
export const QuoteMark = ({ size, color = "currentColor" }: IconProps) => <svg {...dims(size)} viewBox="0 0 24 24" fill={color}><path d="M3 21v-7.5C3 8 6.2 4.4 11 3.5l.6 2.4C8.9 6.7 7.6 8.4 7.4 11H11v10H3zm11 0v-7.5c0-5.5 3.2-9.1 8-10l.6 2.4c-2.7.8-4 2.5-4.2 5.1H22v10h-8z" /></svg>;

/** El botón que cierra el anuncio: bloque rectangular a todo el ancho, con flecha. */
export function Cta({ label, background, color, u }: { label: string; background: string; color: string; u: number }) {
  const size = u * 5.4;
  return (
    <div style={{ ...display(size), lineHeight: 1, alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "space-between", gap: u * 3, padding: `${u * 3.4}px ${u * 4.5}px`, background, color, borderRadius: u * 1 }}>
      <span>{label}</span>
      <Arrow size={size * 1.1} />
    </div>
  );
}
