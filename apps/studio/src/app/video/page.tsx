"use client";

import { useCallback, useEffect, useState } from "react";
import { Film, Plus } from "lucide-react";
import { videoDocumentSchema, type VideoDocument } from "@content-gen/domain/video";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { useRequestedContentId } from "@/lib/use-requested-content-id";
import { ImageGallery } from "@/components/video/image-gallery";
import { SavePanel } from "@/components/video/save-panel";
import { SceneEditor } from "@/components/video/scene-editor";
import { ScriptPreview } from "@/components/video/script-preview";
import { StepIndicator, type WizardStep } from "@/components/video/step-indicator";
import { TopicForm, type TopicFormValues } from "@/components/video/topic-form";
import { VideoList, type StoredVideo } from "@/components/video/video-list";
import { VoiceoverStep } from "@/components/video/voiceover-step";

type Campaign = { id: string; name: string };
type View = "wizard" | "videos" | "editor";
type Persisted = { revision: number; document: { data: unknown } };

const EMPTY_FORM: TopicFormValues = { topic: "", context: "", targetDurationSeconds: 45, templateId: "standard" };

export default function VideoPage() {
  const [view, setView] = useState<View>("wizard");
  const [step, setStep] = useState<WizardStep>(1);
  const [reached, setReached] = useState<WizardStep>(1);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [videos, setVideos] = useState<StoredVideo[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [form, setForm] = useState<TopicFormValues>(EMPTY_FORM);

  const [document, setDocument] = useState<VideoDocument | null>(null);
  const [contentId, setContentId] = useState("");
  const [revision, setRevision] = useState(0);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    const [campaignResponse, videoResponse] = await Promise.all([fetch("/api/campaigns"), fetch("/api/content-items?type=video")]);
    const nextCampaigns = (await campaignResponse.json()) as Campaign[];
    setCampaigns(nextCampaigns);
    setVideos(await videoResponse.json());
    setCampaignId((current) => current || nextCampaigns[0]?.id || "");
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const requestedId = useRequestedContentId();
  useEffect(() => {
    if (!requestedId || contentId === requestedId) return;
    const item = videos.find((entry) => entry.id === requestedId);
    if (item) openEditor(item);
    else if (videos.length) setNotice("Ese video no está disponible: puede estar archivado.");
  }, [requestedId, videos]);

  function adopt(content: Persisted) {
    const parsed = videoDocumentSchema.safeParse(content.document.data);
    if (!parsed.success) return setNotice("El servidor devolvió un documento de video inválido.");
    setDocument(parsed.data); setRevision(content.revision); setSavedSnapshot(JSON.stringify(parsed.data));
  }

  function openEditor(item: StoredVideo) {
    const parsed = videoDocumentSchema.safeParse(item.document.data);
    if (!parsed.success) return setNotice("Este contenido no es un VideoDocument v1 válido.");
    setDocument(parsed.data); setContentId(item.id); setRevision(item.revision); setCampaignId(item.campaignId);
    setSavedSnapshot(JSON.stringify(parsed.data)); setView("editor"); setNotice("");
  }

  function startNew(topic = "") {
    setForm({ ...EMPTY_FORM, topic });
    setDocument(null); setContentId(""); setRevision(0); setSavedSnapshot("");
    setStep(1); setReached(1); setView("wizard"); setNotice("");
  }

  /** Guarda el borrador para que imágenes, voz y render puedan trabajar sobre el documento persistido. */
  async function persist(next: VideoDocument) {
    const body = contentId
      ? { revision, campaignId, type: "video", document: { schemaVersion: 1, data: next } }
      : { campaignId, type: "video", document: { schemaVersion: 1, data: next } };
    const response = await fetch(contentId ? `/api/content-items/${contentId}` : "/api/content-items", {
      method: contentId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const saved = await response.json();
    if (!response.ok) throw new Error(typeof saved.error === "string" ? saved.error : "No se pudo guardar el video.");
    const persisted = videoDocumentSchema.parse(saved.document.data);
    setDocument(persisted); setContentId(saved.id); setRevision(saved.revision); setSavedSnapshot(JSON.stringify(persisted));
    await refresh();
    return saved as StoredVideo;
  }

  async function saveAnd(nextStep?: WizardStep) {
    if (!document) return;
    setSaving(true); setNotice("");
    try {
      await persist(document);
      if (nextStep) { setStep(nextStep); setReached((current) => (Math.max(current, nextStep) as WizardStep)); }
      else setNotice("Video guardado en la biblioteca central.");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "No se pudo guardar el video.");
    } finally {
      setSaving(false);
    }
  }

  const go = (next: WizardStep) => { setStep(next); setReached((current) => (Math.max(current, next) as WizardStep)); };
  const campaignName = campaigns.find((campaign) => campaign.id === campaignId)?.name ?? "sin campaña";
  const campaignNames = Object.fromEntries(campaigns.map((campaign) => [campaign.id, campaign.name]));

  return (
    <PageShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Video / Generador</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Video Generator</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Guion, imágenes, voz y render en el mismo flujo de cinco pasos del proyecto original.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant={view === "wizard" ? "default" : "outline"} onClick={() => startNew()}><Plus className="h-4 w-4" /> Nuevo video</Button>
          <Button type="button" variant={view === "wizard" ? "outline" : "default"} onClick={() => { setView("videos"); setNotice(""); }}><Film className="h-4 w-4" /> Mis videos</Button>
        </div>
      </div>

      {notice ? <p className="mb-4 text-sm text-primary">{notice}</p> : null}

      {view === "wizard" ? (
        <>
          <StepIndicator current={step} reached={reached} onSelect={go} />

          {step === 1 ? (
            <TopicForm
              campaigns={campaigns}
              campaignId={campaignId}
              onCampaign={setCampaignId}
              initial={form}
              onScript={(generated, values) => { setForm(values); setDocument(generated); setContentId(""); setRevision(0); setSavedSnapshot(""); go(2); }}
            />
          ) : null}

          {step === 2 && document ? (
            <ScriptPreview document={document} busy={saving} onContinue={() => void saveAnd(3)} />
          ) : null}

          {step === 3 && document && contentId ? (
            <ImageGallery contentItemId={contentId} revision={revision} document={document} onPersisted={adopt} onContinue={() => go(4)} />
          ) : null}

          {step === 4 && document && contentId ? (
            <div className="space-y-6">
              <VoiceoverStep contentItemId={contentId} revision={revision} document={document} onPersisted={adopt} />
              <div className="flex max-w-3xl gap-3">
                <Button type="button" variant="outline" className="flex-1" onClick={() => go(3)}>Volver a imágenes</Button>
                <Button type="button" className="flex-1" onClick={() => go(5)}>Continuar a guardar →</Button>
              </div>
            </div>
          ) : null}

          {step === 5 && document && contentId ? (
            <SavePanel
              contentItemId={contentId}
              revision={revision}
              document={document}
              campaignName={campaignName}
              onPersisted={adopt}
              onEdit={() => setView("editor")}
              onReset={() => startNew()}
              onGoToVideos={() => { setView("videos"); void refresh(); }}
            />
          ) : null}
        </>
      ) : null}

      {view === "videos" ? (
        <VideoList videos={videos} campaignNames={campaignNames} onEdit={(item) => openEditor(item)} onRegenerate={(topic) => startNew(topic)} onNew={() => startNew()} />
      ) : null}

      {view === "editor" && document ? (
        <SceneEditor
          document={document}
          onChange={setDocument}
          contentItemId={contentId}
          revision={revision}
          campaignId={campaignId || undefined}
          unsavedChanges={JSON.stringify(document) !== savedSnapshot}
          onPersisted={adopt}
          onSave={() => void saveAnd()}
          onBack={() => { setView("videos"); void refresh(); }}
        />
      ) : null}
    </PageShell>
  );
}
