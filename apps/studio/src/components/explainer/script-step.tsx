"use client";

import type { VideoDocument } from "@content-gen/domain/video";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ResearchSources } from "@/components/video/script-preview";

type Field = "title" | "voiceover" | "visual";
const field = (scene: VideoDocument["scenes"][number], key: Field) => (typeof scene.content[key] === "string" ? scene.content[key] as string : "");

/** Guion del video educativo: por escena, el texto en pantalla, la narración y la animación pedida. */
export function ExplainerScriptStep({ document, onChange, busy, onContinue }: { document: VideoDocument; onChange: (next: VideoDocument) => void; busy: boolean; onContinue: () => void }) {
  const update = (sceneId: string, key: Field, value: string) => onChange({
    ...document,
    scenes: document.scenes.map((scene) => scene.id === sceneId ? { ...scene, content: { ...scene.content, [key]: value } } : scene),
  });
  const incomplete = document.scenes.some((scene) => !field(scene, "voiceover").trim() || !field(scene, "visual").trim());

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">{document.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Revisa lo que dice el narrador y qué animación acompaña cada escena. La animación se genera después de la voz, con la duración real de cada escena.</p>
      </div>

      {document.scenes.map((scene, index) => (
        <Card key={scene.id}>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{index + 1}</span>
              <Input aria-label={`Título en pantalla de la escena ${index + 1}`} value={field(scene, "title")} onChange={(event) => update(scene.id, "title", event.target.value)} className="h-9 font-semibold" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`narracion-${scene.id}`} className="text-[10px] uppercase tracking-wider text-muted-foreground">Narración</Label>
              <Textarea id={`narracion-${scene.id}`} rows={3} value={field(scene, "voiceover")} onChange={(event) => update(scene.id, "voiceover", event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`visual-${scene.id}`} className="text-[10px] uppercase tracking-wider text-muted-foreground">Animación</Label>
              <Textarea id={`visual-${scene.id}`} rows={3} value={field(scene, "visual")} onChange={(event) => update(scene.id, "visual", event.target.value)} className="text-xs" />
            </div>
          </CardContent>
        </Card>
      ))}

      <ResearchSources document={document} />

      <Button type="button" className="w-full" disabled={busy || incomplete} onClick={onContinue}>
        {busy ? "Guardando…" : "Guardar y continuar a la voz →"}
      </Button>
      {incomplete ? <p className="text-center text-xs text-muted-foreground">Cada escena necesita narración y animación.</p> : null}
    </div>
  );
}
