"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ImagePlus } from "lucide-react";
import { SCENE_LABELS, sceneAccent, type VideoDocument, type VideoSceneKey } from "@content-gen/domain/video";
import { Button } from "@/components/ui/button";

const oneLine = (value: unknown) => typeof value === "string" ? value.replace(/\n/g, " · ") : "";

export function ScriptPreview({ document, busy, onContinue }: { document: VideoDocument; busy: boolean; onContinue: () => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">{document.title}</h2>
          <p className="mt-1 font-mono text-sm text-muted-foreground">{document.slug}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">niche: {document.niche}</span>
            <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">hook: {document.hookStyle}</span>
            <span className="rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">{document.targetDurationSeconds}s</span>
          </div>
        </div>
        <div className="flex gap-1">
          {document.scenes.map((scene) => (
            <span key={scene.id} title={scene.id} className="h-4 w-4 rounded-full" style={{ background: sceneAccent(scene)[0] }} />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {document.scenes.map((scene) => {
          const accent = sceneAccent(scene)[0];
          const open = expanded === scene.id;
          return (
            <div key={scene.id} className="overflow-hidden rounded-xl border" style={{ borderColor: `${accent}55`, background: `${accent}0d` }}>
              <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:opacity-90" onClick={() => setExpanded(open ? null : scene.id)}>
                <span className="flex min-w-0 items-center gap-3">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: accent }} />
                  <span className="text-sm font-semibold text-foreground">{SCENE_LABELS[scene.id as VideoSceneKey] ?? scene.id}</span>
                  <span className="ml-2 truncate font-mono text-xs text-muted-foreground">{oneLine(scene.content.title ?? scene.content.headline)}</span>
                </span>
                {open ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              </button>
              {open ? <pre className="max-h-60 overflow-auto whitespace-pre-wrap px-4 pb-3 font-mono text-xs text-muted-foreground">{JSON.stringify(scene.content, null, 2)}</pre> : null}
            </div>
          );
        })}
      </div>

      <Button type="button" className="w-full" disabled={busy} onClick={onContinue}>
        <ImagePlus className="h-4 w-4" /> {busy ? "Guardando el video…" : "Generar imágenes →"}
      </Button>
    </div>
  );
}
