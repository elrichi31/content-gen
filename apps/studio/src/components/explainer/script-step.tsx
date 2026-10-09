"use client";

import { CANVAS_TEMPLATE_CATALOG } from "@content-gen/domain/canvas";
import type { VideoDocument } from "@content-gen/domain/video";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ResearchSources } from "@/components/video/script-preview";

type Field = "title" | "voiceover" | "visual";
const field = (scene: VideoDocument["scenes"][number], key: Field) => (typeof scene.content[key] === "string" ? scene.content[key] as string : "");
/** Nombres de las animaciones que la IA eligió con el guion (un plan suelto o una lista). */
const chosen = (canvas: unknown) => (Array.isArray(canvas) ? canvas : canvas ? [canvas] : [])
  .map((beat) => { const template = (beat as { template?: unknown }).template; return CANVAS_TEMPLATE_CATALOG.find((item) => item.template === template)?.name ?? String(template); });

/** Guion del video educativo: por escena, el texto en pantalla, la narración y la animación pedida. */
export function ExplainerScriptStep({ document, onChange, busy, onContinue }: { document: VideoDocument; onChange: (next: VideoDocument) => void; busy: boolean; onContinue: () => void }) {
  const update = (sceneId: string, key: Field, value: string) => onChange({
    ...document,
    scenes: document.scenes.map((scene) => scene.id === sceneId ? { ...scene, content: { ...scene.content, [key]: value } } : scene),
  });
  const incomplete = document.scenes.some((scene) => !field(scene, "voiceover").trim() || !field(scene, "visual").trim());

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">{document.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Revisa lo que dice el narrador y qué animación acompaña cada escena. El guion se escribió a partir de las animaciones del motor: cada escena trae las suyas, que se ajustan a la voz real y puedes cambiar en el paso de animaciones.</p>
      </div>

      <div className="space-y-4">
        {document.scenes.map((scene, index) => (
          <Card key={scene.id}>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{index + 1}</span>
                <Input aria-label={`Título en pantalla de la escena ${index + 1}`} value={field(scene, "title")} onChange={(event) => update(scene.id, "title", event.target.value)} className="h-9 font-semibold" />
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`narracion-${scene.id}`} className="text-[10px] uppercase tracking-wider text-muted-foreground">Narración</Label>
                  <Textarea id={`narracion-${scene.id}`} rows={3} value={field(scene, "voiceover")} onChange={(event) => update(scene.id, "voiceover", event.target.value)} />
                  {chosen(scene.content.canvas).length ? <p className="text-xs text-muted-foreground">Animaciones elegidas: <span className="font-medium text-foreground">{chosen(scene.content.canvas).join(" → ")}</span>. Si cambias la narración, mantén las palabras que las disparan.</p> : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`visual-${scene.id}`} className="text-[10px] uppercase tracking-wider text-muted-foreground">Idea visual</Label>
                  <Textarea id={`visual-${scene.id}`} rows={3} value={field(scene, "visual")} onChange={(event) => update(scene.id, "visual", event.target.value)} className="text-xs" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <ResearchSources document={document} />

      <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">{incomplete ? "Cada escena necesita narración e idea visual." : null}</p>
        <Button type="button" className="shrink-0" disabled={busy || incomplete} onClick={onContinue}>
          {busy ? "Guardando…" : "Guardar y continuar a la voz →"}
        </Button>
      </div>
    </div>
  );
}
