"use client";

import { useRef, useState, type CSSProperties, type ReactNode, type PointerEvent, type KeyboardEvent } from "react";
import { BatteryFull, Bookmark, ChevronDown, ChevronLeft, ChevronRight, Clapperboard, Heart, Home, MessageCircle, MoreHorizontal, Moon, Music2, Plus, Radio, Search, Send, Signal, Users, Wifi, X } from "lucide-react";
import type { PostCaption } from "@/lib/slide-types";
import { CaptionEditor, formatCaptionHashtags } from "./caption-editor";

export function TikTokPreview({ children, profileName = "tu.cuenta", logoUrl, caption, onCaptionChange, activeSlide = 0, totalSlides = 1, onSlideChange, sponsored = false, cta }: SocialPreviewProps) {
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [followed, setFollowed] = useState(false);
  const { move, ...navigation } = usePhotoNavigation(activeSlide, totalSlides, onSlideChange);
  return <div className="w-full min-w-0 max-w-[360px]" data-social-preview="tiktok">
    <section aria-label="Vista simulada de TikTok" className="overflow-hidden rounded-[22px] border border-[#888]/25 bg-black text-white" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
      <StatusBar />
      <div {...navigation} tabIndex={totalSlides > 1 ? 0 : undefined} aria-label={`Imagen ${activeSlide + 1} de ${totalSlides}`} className={`group relative isolate w-full overflow-hidden ${focus}`} data-preview-media="tiktok" style={{ aspectRatio: "9 / 16", touchAction: "pan-y" }} onDoubleClick={event => { if (!editableTarget(event.target)) setLiked(true); }}>
        {children}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-10 flex h-[54px] items-center justify-between bg-gradient-to-b from-black/55 to-transparent px-3 text-white" style={{ textShadow: "0 1px 3px #0008" }}>
          <Radio size={22} /><div className="flex items-center gap-4 text-[14px] font-semibold"><span className="text-white/75">Siguiendo</span><span className="relative pb-1">Para ti<span className="absolute inset-x-2 -bottom-1 h-0.5 rounded-full bg-white" /></span></div><Search size={23} strokeWidth={2.4} />
        </div>
        {totalSlides > 1 && <span aria-hidden="true" className="pointer-events-none absolute right-3 top-[62px] z-10 rounded-full bg-black/45 px-2 py-1 text-[11px]">{activeSlide + 1}/{totalSlides}</span>}
        {onSlideChange && <PhotoArrows active={activeSlide} total={totalSlides} move={move} />}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[36%] bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
        <div className="absolute right-2.5 z-20 flex w-11 flex-col items-center gap-3.5 text-white" style={{ bottom: sponsored ? "30%" : "23%", textShadow: "0 1px 3px #0008" }}>
          <div className="relative mb-1">
            <span className="block rounded-full border-[1.5px] border-white"><Avatar name={profileName} logoUrl={logoUrl} className="h-10 w-10" /></span>
            <button type="button" aria-label="Seguir cuenta (simulación)" aria-pressed={followed} onClick={() => setFollowed(!followed)} className={`absolute -bottom-2 left-1/2 flex h-[19px] w-[19px] -translate-x-1/2 items-center justify-center rounded-full bg-[#fe2c55] ${focus}`}><Plus size={13} strokeWidth={3} style={{ transform: followed ? "rotate(45deg)" : undefined }} /></button>
          </div>
          <button type="button" aria-label="Me gusta (simulación)" aria-pressed={liked} onClick={() => setLiked(!liked)} className={`flex flex-col items-center rounded ${focus}`}><Heart size={32} fill={liked ? "#fe2c55" : "white"} stroke={liked ? "#fe2c55" : "white"} strokeWidth={1} /><span className="mt-1 text-[11px] font-semibold">{liked ? 129 : 128}</span></button>
          <span aria-hidden="true" className="flex flex-col items-center"><svg width="31" height="31" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.5 2 2 5.8 2 10.5c0 2.6 1.4 5 3.5 6.5l-1.2 4.5 5.1-2.5c.8.2 1.7.2 2.6.2 5.5 0 10-3.8 10-8.7S17.5 2 12 2Z" /><circle cx="7" cy="10" r="1" fill="#555" /><circle cx="12" cy="10" r="1" fill="#555" /><circle cx="17" cy="10" r="1" fill="#555" /></svg><span className="mt-1 text-[11px] font-semibold">12</span></span>
          <button type="button" aria-label="Guardar publicación (simulación)" aria-pressed={saved} onClick={() => setSaved(!saved)} className={`flex flex-col items-center rounded ${focus}`}><Bookmark size={30} fill={saved ? "#face15" : "white"} stroke={saved ? "#face15" : "white"} strokeWidth={1} /><span className="mt-1 text-[11px] font-semibold">{saved ? 9 : 8}</span></button>
          <span aria-hidden="true" className="flex flex-col items-center"><svg width="32" height="32" viewBox="0 0 24 24" fill="white"><path d="M13.5 3 21 10l-7.5 6v-4c-5 0-7.5 2-11 7 0-8 4-12 11-12V3Z" /></svg><span className="mt-1 text-[11px] font-semibold">4</span></span>
        </div>
        <div className="absolute inset-x-0 bottom-3 z-20 text-white" style={{ textShadow: "0 1px 3px #0008" }}>
          <PhotoNavigation active={activeSlide} total={totalSlides} onChange={onSlideChange} overlay />
          <div className="px-3 pr-[66px]">
            <p className="mb-1 truncate text-[14px] font-bold" title={profileName}>{profileName}</p>
            {sponsored && <p className="mb-1 text-[10px] text-white/80">Publicidad</p>}
            <PreviewCaption caption={caption} profileName={profileName} overlay />
            <div aria-hidden="true" className="mt-2 flex items-center gap-1.5"><Music2 size={13} className="shrink-0" /><span className="truncate text-[11px]">Sonido original · {profileName}</span></div>
            {sponsored && cta && <div className="mt-3 flex h-9 items-center justify-between rounded bg-white/20 px-2 text-[12px] font-semibold"><span className="truncate">{cta}</span><ChevronRight size={15} /></div>}
          </div>
          <span aria-hidden="true" className="absolute bottom-0 right-3 flex h-9 w-9 items-center justify-center rounded-full border-[6px] border-[#252525] bg-[#131313]"><Avatar name={profileName} logoUrl={logoUrl} className="h-4 w-4" /></span>
        </div>
      </div>
      <div aria-hidden="true" className="flex h-[52px] items-center justify-around border-t border-white/15 bg-black text-white">
        <span className="flex flex-col items-center gap-1"><Home size={23} fill="white" /><span className="text-[9px] font-semibold">Inicio</span></span>
        <span className="flex flex-col items-center gap-1 text-white/70"><Users size={23} /><span className="text-[9px]">Amigos</span></span>
        <span className="relative mx-1 flex h-7 w-11 items-center justify-center"><span className="absolute inset-y-0 -left-1 w-5 rounded bg-[#25f4ee]" /><span className="absolute inset-y-0 -right-1 w-5 rounded bg-[#fe2c55]" /><span className="relative flex h-full w-full items-center justify-center rounded bg-white text-black"><Plus size={21} strokeWidth={2.5} /></span></span>
        <span className="flex flex-col items-center gap-1 text-white/70"><MessageCircle size={23} /><span className="text-[9px]">Bandeja</span></span>
        <span className="flex flex-col items-center gap-1 text-white/70"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="7" r="4" /><path d="M4 22v-3a8 8 0 0 1 16 0v3" /></svg><span className="text-[9px]">Perfil</span></span>
      </div>
      <HomeIndicator />
    </section>
    <PreviewTools caption={caption} onCaptionChange={onCaptionChange} />
  </div>;
}


export function InstagramStoryPreview({ children, profileName = "tu.cuenta", logoUrl, cta }: SocialPreviewProps) {
  const [liked, setLiked] = useState(false);
  return <div className="w-full min-w-0 max-w-[360px]" data-social-preview="instagram-story">
    <section aria-label="Vista simulada de Instagram Stories" className="overflow-hidden rounded-[22px] border border-[#888]/25 bg-black text-white" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
      <StatusBar />
      <div className="relative isolate w-full overflow-hidden" data-preview-media="instagram-story" style={{ aspectRatio: "9 / 16" }}>
        {children}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent px-3 pb-8 pt-2">
          <div className="mb-3 h-0.5 rounded-full bg-white/40"><div className="h-full w-2/3 rounded-full bg-white" /></div>
          <div className="flex items-center gap-2"><Avatar name={profileName} logoUrl={logoUrl} className="h-8 w-8" /><div className="min-w-0 flex-1"><p className="truncate text-[12px] font-semibold">{profileName}</p><p className="text-[10px] text-white/80">Publicidad</p></div><MoreHorizontal size={20} /><X size={22} /></div>
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/50 to-transparent" />
        {cta && <div className="absolute bottom-8 left-1/2 flex max-w-[85%] -translate-x-1/2 items-center gap-2 rounded-lg bg-white px-4 py-3 text-[13px] font-semibold text-black"><span className="truncate">{cta}</span><ChevronRight size={17} className="shrink-0" /></div>}
      </div>
      <div className="flex h-[58px] items-center gap-3 px-3">
        <span aria-hidden="true" className="flex h-9 flex-1 items-center rounded-full border border-white/40 px-4 text-[12px]">Enviar mensaje</span>
        <button type="button" aria-label="Me gusta (simulación)" aria-pressed={liked} onClick={() => setLiked(!liked)} className={`rounded ${focus}`}><Heart size={25} fill={liked ? "#ff3040" : "none"} stroke={liked ? "#ff3040" : "currentColor"} /></button><Send size={24} aria-hidden />
      </div>
      <HomeIndicator />
    </section>
    <p className="mt-2 text-[10px] text-muted-foreground">Vista simulada · interfaz de ejemplo</p>
  </div>;
}

export interface SocialPreviewProps {
  children: ReactNode;
  profileName?: string;
  logoUrl?: string | null;
  caption?: PostCaption | null;
  onCaptionChange?: (caption: PostCaption) => void;
  activeSlide?: number;
  totalSlides?: number;
  onSlideChange?: (index: number) => void;
  sponsored?: boolean;
  cta?: string;
}

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0095f6]";
const editableTarget = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest("button,input,textarea,[contenteditable='true']"));

function Avatar({ name, logoUrl, className = "h-8 w-8" }: { name: string; logoUrl?: string | null; className?: string }) {
  return <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e8e8e8] text-[12px] font-semibold text-[#222] ${className}`}>
    {logoUrl ? <img src={logoUrl} alt="" className="h-full w-full object-cover" /> : name.slice(0, 1).toUpperCase()}
  </span>;
}

function StatusBar() {
  return <div aria-hidden="true" className="flex h-8 items-center justify-between px-5 text-[13px] font-semibold">
    <span>9:41</span><span className="flex items-center gap-1"><Signal size={14} fill="currentColor" /><Wifi size={14} /><BatteryFull size={21} /></span>
  </div>;
}

function HomeIndicator() {
  return <div aria-hidden="true" className="flex h-5 items-center justify-center"><span className="h-1 w-28 rounded-full bg-current" /></div>;
}

function PhotoNavigation({ active, total, onChange, overlay = false, maxVisible = 7 }: { active: number; total: number; onChange?: (index: number) => void; overlay?: boolean; maxVisible?: number }) {
  if (total < 2 || !onChange) return null;
  // Preserve useful hit areas without making a long carousel's indicator row overflow.
  const start = Math.min(Math.max(0, active - Math.floor(maxVisible / 2)), Math.max(0, total - maxVisible));
  const indices = Array.from({ length: Math.min(maxVisible, total) }, (_, i) => start + i);
  return <div className="flex h-7 items-center justify-center" aria-label="Imágenes del carrusel">
    {indices.map(i => <button key={i} type="button" aria-label={`Ir a imagen ${i + 1}`} aria-current={i === active ? "true" : undefined} onClick={() => onChange(i)} className={`flex h-7 w-3 items-center justify-center rounded ${focus}`}>
      <span className={`h-[5px] w-[5px] rounded-full ${i === active ? overlay ? "bg-white" : "bg-[#0095f6]" : overlay ? "bg-white/50" : "bg-[#c7c7c7]"}`} style={{ transform: i !== active && (i === start || i === start + maxVisible - 1) && total > maxVisible ? "scale(.7)" : undefined }} />
    </button>)}
  </div>;
}

function usePhotoNavigation(active: number, total: number, onChange?: (index: number) => void) {
  const down = useRef<{ x: number; y: number } | null>(null);
  const move = (delta: number) => onChange?.(Math.max(0, Math.min(total - 1, active + delta)));
  return {
    move,
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      down.current = total > 1 && !editableTarget(event.target) ? { x: event.clientX, y: event.clientY } : null;
    },
    onPointerUp(event: PointerEvent<HTMLDivElement>) {
      const start = down.current;
      down.current = null;
      if (!start || editableTarget(event.target)) return;
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? 1 : -1);
    },
    onPointerCancel() { down.current = null; },
    onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
      if (editableTarget(event.target) || !onChange || total < 2) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); move(event.key === "ArrowRight" ? 1 : -1); }
    },
  };
}

function PhotoArrows({ active, total, move }: { active: number; total: number; move: (delta: number) => void }) {
  if (total < 2) return null;
  return <>
    {active > 0 && <button type="button" aria-label="Imagen anterior" onClick={() => move(-1)} className={`absolute left-2 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 ${focus}`}><ChevronLeft size={18} /></button>}
    {active < total - 1 && <button type="button" aria-label="Imagen siguiente" onClick={() => move(1)} className={`absolute right-2 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 ${focus}`}><ChevronRight size={18} /></button>}
  </>;
}

function PreviewCaption({ caption, profileName, overlay = false, hashtagColor = "#00376b" }: { caption?: PostCaption | null; profileName: string; overlay?: boolean; hashtagColor?: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!caption?.text && !caption?.hashtags?.length) return null;
  const hashtags = formatCaptionHashtags(caption?.hashtags ?? []);
  const lengthy = (caption?.text.length ?? 0) + hashtags.length > 100 || caption?.text.includes("\n");
  return <div className="min-w-0 text-[12px] leading-[1.45] [overflow-wrap:anywhere]">
    <p className={`${expanded ? "max-h-32 overflow-y-auto" : "line-clamp-2"} whitespace-pre-wrap`}>
      {!overlay && <span className="font-semibold">{profileName} </span>}
      {caption?.text}{hashtags && <span className={overlay ? "font-medium" : undefined} style={{ color: overlay ? "inherit" : hashtagColor }}> {hashtags}</span>}
    </p>
    {lengthy && <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className={`mt-0.5 rounded text-[12px] ${overlay ? "text-white/90" : "opacity-60"} ${focus}`}>{expanded ? "menos" : "más"}</button>}
  </div>;
}

function PreviewTools({ caption, onCaptionChange, children }: Pick<SocialPreviewProps, "caption" | "onCaptionChange"> & { children?: ReactNode }) {
  return <div className="mt-2 text-foreground">
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] leading-relaxed text-muted-foreground">Vista simulada · interacciones de ejemplo</span>{children}
    </div>
    {caption !== undefined && <details className="mt-2 border-t border-border pt-2 text-xs">
      <summary className="w-fit cursor-pointer rounded text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary">{onCaptionChange ? "Editar descripción" : "Copiar descripción"}</summary>
      <div className="pt-2"><CaptionEditor caption={caption} onCaptionChange={onCaptionChange} initialEditing={Boolean(onCaptionChange)} /></div>
    </details>}
  </div>;
}

export function InstagramPreview({ children, profileName = "tu.cuenta", logoUrl, caption, onCaptionChange, activeSlide = 0, totalSlides = 1, onSlideChange, sponsored = false, cta, mediaRatio = "4 / 5" }: SocialPreviewProps & { mediaRatio?: string }) {
  const [dark, setDark] = useState(false);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const { move, ...navigation } = usePhotoNavigation(activeSlide, totalSlides, onSlideChange);
  const palette = { background: dark ? "#000" : "#fff", color: dark ? "#f5f5f5" : "#111", fontFamily: "Arial, Helvetica, sans-serif" } satisfies CSSProperties;
  return <div className="w-full min-w-0 max-w-[360px]" data-social-preview="instagram">
    <section aria-label="Vista simulada de Instagram" className="overflow-hidden rounded-[22px] border border-[#888]/25" style={palette}>
      <StatusBar />
      <div aria-hidden="true" className="flex h-12 items-center justify-between px-3">
        <div className="flex items-center gap-1"><img src="/preview/instagram-wordmark.svg" alt="Instagram" className="h-9 w-[102px] object-contain" style={{ filter: dark ? "invert(1)" : undefined }} /><ChevronDown size={15} /></div>
        <div className="flex items-center gap-5"><Heart size={24} strokeWidth={1.7} /><Send size={24} strokeWidth={1.7} /></div>
      </div>
      <div className="flex h-[58px] items-center gap-2.5 border-t border-current/10 px-3">
        <span className="rounded-full bg-[linear-gradient(35deg,#ffd776,#f56040,#e1306c,#833ab4)] p-[2px]"><span className="block rounded-full p-[2px]" style={{ background: palette.background }}><Avatar name={profileName} logoUrl={logoUrl} /></span></span>
        <div className="min-w-0 flex-1 text-[12px]"><p className="truncate font-semibold" title={profileName}>{profileName}</p><p className="mt-0.5 text-[10px] opacity-70">{sponsored ? "Publicidad" : "Publicación sugerida"}</p></div>
        <MoreHorizontal aria-hidden size={22} />
      </div>
      <div {...navigation} tabIndex={totalSlides > 1 ? 0 : undefined} aria-label={`Imagen ${activeSlide + 1} de ${totalSlides}`} className={`group relative w-full overflow-hidden ${focus}`} style={{ aspectRatio: mediaRatio, touchAction: "pan-y" }} data-preview-media="instagram" onDoubleClick={event => { if (!editableTarget(event.target)) setLiked(true); }}>
        {children}
        {totalSlides > 1 && <span aria-hidden="true" className="pointer-events-none absolute right-3 top-3 z-10 rounded-full bg-black/65 px-2 py-1 text-[10px] font-medium text-white">{activeSlide + 1}/{totalSlides}</span>}
        {onSlideChange && <PhotoArrows active={activeSlide} total={totalSlides} move={move} />}
      </div>
      {sponsored && cta && <div className="flex h-9 items-center justify-between bg-[#0095f6] px-3 text-[12px] font-semibold text-white"><span className="truncate">{cta}</span><ChevronRight size={16} aria-hidden /></div>}
      <div className="flex h-[46px] items-center gap-2 px-3">
        <div className="flex shrink-0 items-center gap-3.5">
          <button type="button" aria-label="Me gusta (simulación)" aria-pressed={liked} onClick={() => setLiked(!liked)} className={`rounded py-2 ${focus}`}><Heart size={24} strokeWidth={1.7} fill={liked ? "#ff3040" : "none"} stroke={liked ? "#ff3040" : "currentColor"} /></button>
          <MessageCircle aria-hidden size={24} strokeWidth={1.7} /><Send aria-hidden size={24} strokeWidth={1.7} />
        </div>
        <div className="flex min-w-0 flex-1 justify-center"><PhotoNavigation active={activeSlide} total={totalSlides} onChange={onSlideChange} maxVisible={5} /></div>
        <button type="button" aria-label="Guardar publicación (simulación)" aria-pressed={saved} onClick={() => setSaved(!saved)} className={`shrink-0 rounded py-2 ${focus}`}><Bookmark size={24} strokeWidth={1.7} fill={saved ? "currentColor" : "none"} /></button>
      </div>
      <div className="space-y-1 px-3 pb-3">
        <p className="text-[12px] font-semibold">{liked ? 129 : 128} Me gusta</p>
        <PreviewCaption caption={caption} profileName={profileName} hashtagColor={dark ? "#e0f1ff" : "#00376b"} />
        <p aria-hidden="true" className="pt-1 text-[11px] opacity-60">Ver los 12 comentarios</p>
        <p aria-hidden="true" className="pt-1 text-[10px] uppercase opacity-50">Hace 2 horas</p>
      </div>
      <div aria-hidden="true" className="flex h-[47px] items-center justify-around border-t border-current/10">
        <span title="Inicio"><Home size={24} fill="currentColor" strokeWidth={1.7} /></span><Clapperboard size={24} strokeWidth={1.7} /><Send size={24} strokeWidth={1.7} /><Search size={24} strokeWidth={1.7} /><Avatar name={profileName} logoUrl={logoUrl} className="h-6 w-6" />
      </div>
      <HomeIndicator />
    </section>
    <PreviewTools caption={caption} onCaptionChange={onCaptionChange}><button type="button" aria-label={`Ver Instagram en modo ${dark ? "claro" : "oscuro"}`} aria-pressed={dark} onClick={() => setDark(!dark)} className="flex items-center gap-1 rounded border border-border px-1.5 py-1 text-[10px] focus-visible:outline-2 focus-visible:outline-primary"><Moon size={12} />{dark ? "Oscuro" : "Claro"}</button></PreviewTools>
  </div>;
}
