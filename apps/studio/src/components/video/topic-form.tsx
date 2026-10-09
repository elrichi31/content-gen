"use client";

import { useRef, useState } from "react";
import { FileText, Sparkles, X } from "lucide-react";
import type { VideoDocument } from "@content-gen/domain/video";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AiProgress } from "@/components/ai-progress";

// Presets y sugerencias del asistente original.
const DURATION_PRESETS = [30, 45, 60, 90];
const SUGGESTIONS = [
  "Ransomware", "Ingeniería social", "Inteligencia artificial en 2026",
  "Quantum computing", "Deepfakes", "Criptomonedas y fraudes",
  "Vulnerabilidades en móviles", "Espionaje corporativo",
];

export type TopicFormValues = { topic: string; context: string; targetDurationSeconds: number; templateId: "standard" | "timeline" | "explainer" };

const VIDEO_TEMPLATES = [["standard", "Estándar", "7 escenas temáticas"], ["timeline", "Timeline", "Cronología de eventos"]] as const;

/** `templates` y `description` permiten reutilizarlo en el video educativo, que tiene una sola plantilla. */
export function TopicForm({
  campaigns,
  campaignId,
  onCampaign,
  initial,
  onScript,
  templates = VIDEO_TEMPLATES,
  description = "La IA generará el guion completo en 7 escenas; después se anima y renderiza con el motor Canvas.",
}: {
  campaigns: { id: string; name: string }[];
  campaignId: string;
  onCampaign: (id: string) => void;
  initial: TopicFormValues;
  onScript: (document: VideoDocument, values: TopicFormValues) => void;
  templates?: readonly (readonly [TopicFormValues["templateId"], string, string])[];
  description?: string;
}) {
  const [topic, setTopic] = useState(initial.topic);
  const [context, setContext] = useState(initial.context);
  const [contextFileName, setContextFileName] = useState("");
  const [targetDurationSeconds, setTargetDuration] = useState(initial.targetDurationSeconds);
  const [templateId, setTemplateId] = useState(initial.templateId);
  // Apagada por defecto: el contexto pegado arriba suele bastar y la búsqueda es lo más caro del guion.
  const [webSearch, setWebSearch] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  async function readFile(file: File) {
    setContext(await file.text());
    setContextFileName(file.name);
  }

  async function submit() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/videos/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, templateId, targetDurationSeconds, webSearch, ...(context.trim() ? { context } : {}), ...(campaignId ? { campaignId } : {}) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Error desconocido");
      onScript(payload.document as VideoDocument, { topic, context, targetDurationSeconds, templateId });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo generar el guion.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">¿Sobre qué es el video?</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="wizard-campaign">Campaña</Label>
          <Select value={campaignId} onValueChange={onCampaign}>
            <SelectTrigger id="wizard-campaign"><SelectValue placeholder="Selecciona la campaña" /></SelectTrigger>
            <SelectContent>{campaigns.map((campaign) => <SelectItem key={campaign.id} value={campaign.id}>{campaign.name}</SelectItem>)}</SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">El video, sus imágenes y su audio se guardan en esta campaña.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="wizard-topic">Tema</Label>
          <Input id="wizard-topic" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Ej: Ransomware, Deepfakes, Dark Web…" className="h-12 text-base" />
        </div>

        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <Button key={suggestion} type="button" variant="outline" size="sm" className="h-7 text-xs font-normal" onClick={() => setTopic(suggestion)}>{suggestion}</Button>
          ))}
        </div>

        <Card>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="wizard-context" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Contexto del video <span className="font-normal normal-case opacity-70">(opcional)</span></Label>
              <input ref={fileInput} type="file" accept=".md,.txt,text/markdown,text/plain" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file); event.target.value = ""; }} />
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => fileInput.current?.click()}>Subir .md / .txt</Button>
            </div>
            <Textarea id="wizard-context" rows={8} value={context} onChange={(event) => { setContext(event.target.value); setContextFileName(""); }} placeholder="Pega aquí info actualizada (datos, cifras, fechas, fuentes). La IA la usará como fuente de verdad para el guion." className="font-mono text-xs" />
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">
                {contextFileName ? <span className="inline-flex items-center gap-1 text-primary"><FileText className="h-3 w-3" /> {contextFileName}</span> : "El tema sigue siendo obligatorio · el contexto enriquece los datos"}
                {context.trim() ? ` · ${context.trim().length.toLocaleString("es")} caracteres` : ""}
              </p>
              {context.trim() ? <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => { setContext(""); setContextFileName(""); }}><X className="h-3 w-3" /> Limpiar</Button> : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20">
        <Card>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Duración del video</p>
              <span className="font-mono text-xs font-bold text-primary">{targetDurationSeconds}s</span>
            </div>
            <div className="flex gap-2">
              {DURATION_PRESETS.map((seconds) => (
                <Button key={seconds} type="button" variant={targetDurationSeconds === seconds ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setTargetDuration(seconds)}>{seconds}s</Button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">Las escenas se escalan proporcionalmente con las mismas proporciones del proyecto original.</p>
          </CardContent>
        </Card>

        {templates.length > 1 ? <Card>
          <CardContent className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tipo de composición</p>
            <div className="flex gap-2">
              {templates.map(([value, title, hint]) => (
                <Button key={value} type="button" variant={templateId === value ? "default" : "outline"} className="h-auto flex-1 flex-col items-start gap-0.5 px-3 py-2 text-left" onClick={() => setTemplateId(value)}>
                  <span className="text-sm font-semibold">{title}</span>
                  <span className="text-[10px] font-normal opacity-70">{hint}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card> : null}

        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <input type="checkbox" aria-label="Buscar en internet datos y fuentes" className="mt-0.5 h-4 w-4 accent-primary" checked={webSearch} onChange={(event) => setWebSearch(event.target.checked)} />
          <span>Buscar en internet datos y fuentes antes de escribir el guion <span className="block text-[10px] opacity-70">Solo si no tienes la información a mano: tarda más y cuesta más. Si ya la tienes, pégala en el contexto.</span></span>
        </label>

        {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}

        <Button type="button" className="w-full" disabled={loading || !topic.trim() || !campaignId} onClick={() => void submit()}>
          {loading ? <AiProgress label={webSearch ? "Investigando y generando guion" : "Generando guion"} estimateMs={webSearch ? 70_000 : 25_000} state="composing" /> : <><Sparkles className="h-4 w-4" /> Generar guion →</>}
        </Button>
        {campaignId ? null : <p className="text-center text-xs text-muted-foreground">Selecciona una campaña para empezar.</p>}
      </aside>
    </div>
  );
}
