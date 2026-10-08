"use client";

import { useMemo, useState } from "react";
import { buildCanvasHtml } from "@content-gen/canvas-engine";
import { CANVAS_TEMPLATE_CATALOG, sampleCanvasSpec, type CanvasTemplateInfo } from "@content-gen/domain/canvas";
import { PageHeading, PageShell } from "@/components/page-shell";
import { ModeSwitch, VIDEO_MODES } from "@/components/mode-switch";
import { Card, CardContent } from "@/components/ui/card";

// Algunos colores de ejemplo: el motor pinta con la paleta del video (la de la marca).
const PALETTES: { name: string; colors: [string, string] }[] = [
  { name: "Cian", colors: ["#22d3ee", "#9be9f6"] },
  { name: "Naranja", colors: ["#ff4b1f", "#ffb39e"] },
  { name: "Lima", colors: ["#a3e635", "#d6f5a8"] },
  { name: "Violeta", colors: ["#a78bfa", "#d9ceff"] },
];

/** Una plantilla reproduciéndose en bucle con la misma runtime del render, en un iframe aislado. */
function TemplateCard({ info, palette }: { info: CanvasTemplateInfo; palette: [string, string] }) {
  const html = useMemo(() => buildCanvasHtml(sampleCanvasSpec(info.template, palette), { live: true, autoplay: true, scale: 0.3 }), [info.template, palette]);
  return (
    <Card>
      <CardContent className="flex gap-4">
        <iframe title={`Animación ${info.name}`} sandbox="allow-scripts" srcDoc={html} loading="lazy" className="h-[384px] w-[216px] shrink-0 rounded-lg border border-border bg-black" />
        <div className="min-w-0 space-y-3">
          <div>
            <p className="font-mono text-[11px] text-muted-foreground">{info.template}</p>
            <h3 className="text-lg font-semibold text-foreground">{info.name}</h3>
          </div>
          <p className="text-sm text-muted-foreground">{info.description}</p>
          <p className="text-sm"><span className="font-semibold text-foreground">Cuándo usarla: </span><span className="text-muted-foreground">{info.useFor}</span></p>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Qué rellena la IA</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
              {info.fields.map((field) => <li key={field}>{field}</li>)}
            </ul>
          </div>
          <p className="rounded-md bg-muted/50 p-2 text-xs italic text-muted-foreground">«{info.example.voiceover}»</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AnimationLibraryPage() {
  const [palette, setPalette] = useState(PALETTES[0].colors);
  return (
    <PageShell>
      <ModeSwitch modes={VIDEO_MODES} current="/video/animaciones" className="mb-4" />
      <PageHeading
        title="Biblioteca de animaciones"
        description="Las plantillas del motor Canvas. En cada video la IA elige una por escena y ancla sus momentos a las palabras de la voz; en la preview de Canvas puedes cambiar la de cualquier escena."
        actions={
          <div role="radiogroup" aria-label="Color de ejemplo" className="flex items-center gap-2">
            {PALETTES.map((item) => (
              <button key={item.name} type="button" role="radio" aria-checked={palette === item.colors} aria-label={item.name} title={item.name} onClick={() => setPalette(item.colors)}
                className={`h-7 w-7 rounded-full border-2 ${palette === item.colors ? "border-foreground" : "border-transparent"}`} style={{ background: item.colors[0] }} />
            ))}
          </div>
        }
      />
      <div className="grid gap-4 xl:grid-cols-2">
        {CANVAS_TEMPLATE_CATALOG.map((info) => <TemplateCard key={info.template} info={info} palette={palette} />)}
      </div>
    </PageShell>
  );
}
