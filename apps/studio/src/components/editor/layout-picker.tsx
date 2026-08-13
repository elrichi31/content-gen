"use client";

import { useState } from "react";
import { ChevronDown, LayoutGrid } from "lucide-react";
import type { Slide } from "@/lib/slide-types";
import type { BgStyleId } from "@/lib/themes";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  SlideVariantPreview,
  bigNumberVariants,
  contentVariants,
  coverVariants,
  ctaVariants,
  imageOverlayVariants,
  listVariants,
  quoteVariants,
  splitVariants,
  statGridVariants,
  timelineVariants,
} from "@/components/slide-renderer";

const variantsByLayout = {
  cover: coverVariants,
  content: contentVariants,
  list: listVariants,
  bigNumber: bigNumberVariants,
  quote: quoteVariants,
  split: splitVariants,
  imageOverlay: imageOverlayVariants,
  timeline: timelineVariants,
  statGrid: statGridVariants,
  cta: ctaVariants,
} satisfies Record<Slide["layout"], readonly { id: string; label: string }[]>;

export function LayoutVariantPicker({
  slide,
  activePrimary,
  selectedBgStyle,
  onChange,
}: {
  slide: Slide;
  activePrimary: string;
  selectedBgStyle: BgStyleId;
  onChange: (variant: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const variants = variantsByLayout[slide.layout];
  const current = slide.layoutVariant ?? variants[0]?.id ?? "default";
  const label = variants.find((variant) => variant.id === current)?.label ?? current;

  if (variants.length < 2) return null;

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <LayoutGrid className="h-3.5 w-3.5" /> Variante visual
      </Label>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 text-xs text-foreground transition-colors hover:bg-muted/60"
      >
        <span>{label}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="grid grid-cols-2 gap-2">
          {variants.map((variant) => (
            <button
              type="button"
              key={variant.id}
              onClick={() => { onChange(variant.id); setOpen(false); }}
              className={cn(
                "overflow-hidden rounded-lg border p-1.5 text-left transition-colors",
                current === variant.id ? "border-primary bg-primary/10" : "border-border/50 bg-muted/25 hover:border-border",
              )}
            >
              <div className="aspect-[4/5] overflow-hidden rounded-md bg-background">
                <SlideVariantPreview slide={{ ...slide, layoutVariant: variant.id }} primary={activePrimary} bgStyle={selectedBgStyle} />
              </div>
              <span className={cn("mt-1.5 block truncate text-center text-[10px]", current === variant.id ? "text-primary" : "text-muted-foreground")}>{variant.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
