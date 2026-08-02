"use client";

import { useEffect, useState } from "react";
import { Download, Hash, Save, Wand2 } from "lucide-react";
import type { VideoDocument } from "@content-gen/domain/video";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Caption = { text: string; hashtags: string[] };
type Stored = { revision: number; document: { data: unknown } };

const captionOf = (document: VideoDocument): Caption => {
  const value = (document as VideoDocument & { caption?: Partial<Caption> }).caption;
  return { text: typeof value?.text === "string" ? value.text : "", hashtags: Array.isArray(value?.hashtags) ? value.hashtags : [] };
};

export function VideoCaptionPanel({
  contentItemId,
  revision,
  document,
  onPersisted,
}: {
  contentItemId: string;
  revision: number;
  document: VideoDocument;
  onPersisted: (content: Stored) => void;
}) {
  const stored = captionOf(document);
  const [text, setText] = useState(stored.text);
  const [hashtags, setHashtags] = useState(stored.hashtags.join(" "));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const current = captionOf(document);
    setText(current.text);
    setHashtags(current.hashtags.join(" "));
  }, [document]);

  async function call(job: string, body: Record<string, unknown>) {
    setError("");
    setBusy(job);
    try {
      const response = await fetch(`/api/videos/${contentItemId}/caption`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, revision }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "No se pudo guardar el caption.");
      onPersisted(payload.content as Stored);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar el caption.");
    } finally {
      setBusy("");
    }
  }

  const save = () => call("edit", { action: "edit", caption: { text, hashtags: hashtags.split(/[\s,]+/).map((tag) => tag.trim()).filter(Boolean) } });

  if (!contentItemId) return <p className="text-xs text-muted-foreground">Guarda el video en una campaña para generar su caption.</p>;

  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-background/40 p-3">
      <div className="flex items-center gap-2">
        <Hash className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Caption TikTok</p>
      </div>

      <Button type="button" variant="outline" size="sm" className="w-full" disabled={busy !== ""} onClick={() => void call("generate", { action: "generate" })}>
        <Wand2 className="h-4 w-4" /> {busy === "generate" ? "Generando…" : "Generar con IA"}
      </Button>

      <div className="space-y-1.5">
        <Label htmlFor="video-caption-text" className="text-[10px] uppercase tracking-wider text-muted-foreground">Texto</Label>
        <Textarea id="video-caption-text" rows={5} value={text} onChange={(event) => setText(event.target.value)} placeholder="Gancho, contexto y llamada a la acción." />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="video-caption-hashtags" className="text-[10px] uppercase tracking-wider text-muted-foreground">Hashtags</Label>
        <Input id="video-caption-hashtags" className="h-8" value={hashtags} onChange={(event) => setHashtags(event.target.value)} placeholder="#video #contentgen" />
      </div>

      {stored.hashtags.length ? (
        <div className="flex flex-wrap gap-1.5">
          {stored.hashtags.map((tag) => <span key={tag} className="rounded-full border border-border/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">{tag}</span>)}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy !== "" || !text.trim()} onClick={() => void save()}>
          <Save className="h-4 w-4" /> {busy === "edit" ? "Guardando…" : "Guardar caption"}
        </Button>
        {stored.text ? (
          <Button type="button" variant="outline" size="sm" asChild>
            <a href={`/api/videos/${contentItemId}/caption`} download><Download className="h-4 w-4" /> Descargar .txt</a>
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
