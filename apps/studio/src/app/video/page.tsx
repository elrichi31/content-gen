"use client";

import { useCallback, useEffect, useState } from "react";
import { Film, Plus } from "lucide-react";
import { videoDocumentSchema, type VideoDocument } from "@content-gen/domain/video";
import { PageHeading, PageShell } from "@/components/page-shell";
import { ModeSwitch, VIDEO_MODES } from "@/components/mode-switch";
import { Button } from "@/components/ui/button";
import { Notice, noticeError, noticeOk, type NoticeState } from "@/components/ui/notice";
import { useRadarTopic } from "@/lib/use-radar-topic";
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

const isExplainer = (item: StoredVideo) => (item.document.data as { templateId?: unknown } | null)?.templateId === "explainer";
const EMPTY_FORM: TopicFormValues = { topic: "", context: "", targetDurationSeconds: 45, templateId: "standard" };

export default function VideoPage() {
  const [view, setView] = useState<View>("wizard");
  const [step, setStep] = useState<WizardStep>(1);
  const [reached, setReached] = useState<WizardStep>(1);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [videos, setVideos] = useState<StoredVideo[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [form, setForm] = useState<TopicFormValues>(EMPTY_FORM);
  // Llegada desde el radar. El tema tarda en cargar, así que el formulario se rellena al llegar.
  const radar = useRadarTopic("video");

  const [document, setDocument] = useState<VideoDocument | null>(null);
  const [contentId, setContentId] = useState("");
  const [revision, setRevision] = useState(0);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [notice, setNotice] = useState<NoticeState>(null);
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
    // La biblioteca enlaza todo video a /video; los educativos tienen su propio editor.
    if (item && isExplainer(item)) window.location.replace(`/explainer?id=${item.id}`);
    else if (item) openEditor(item);
    else if (videos.length) setNotice(noticeError("Ese video no está disponible: puede estar archivado."));
  }, [requestedId, videos]);

  function adopt(content: Persisted) {
    const parsed = videoDocumentSchema.safeParse(content.document.data);
    if (!parsed.success) return setNotice(noticeError("El servidor devolvió un documento de video inválido."));
    setDocument(parsed.data); setRevision(content.revision); setSavedSnapshot(JSON.stringify(parsed.data));
  }

  /**
   * La imagen se guarda sola en el servidor. Se toma de la respuesta solo la imagen de esa escena
   * (y la revisión): así no se pierde el texto que el usuario editó y aún no guardó.
   */
  function adoptImage(content: Persisted, sceneId: string) {
    const parsed = videoDocumentSchema.safeParse(content.document.data);
    if (!parsed.success) return setNotice(noticeError("El servidor devolvió un documento de video inválido."));
    const saved = parsed.data.scenes.find((item) => item.id === sceneId);
    setRevision(content.revision); setSavedSnapshot(JSON.stringify(parsed.data));
    setDocument((current) => current && saved ? { ...current, scenes: current.scenes.map((item) => item.id === sceneId ? { ...item, imageAssetId: saved.imageAssetId, content: { ...item.content, imageAssetHistory: saved.content.imageAssetHistory } } : item) } : parsed.data);
  }

  function openEditor(item: StoredVideo) {
    const parsed = videoDocumentSchema.safeParse(item.document.data);
    if (!parsed.success) return setNotice(noticeError("Este contenido no es un VideoDocument v1 válido."));
    setDocument(parsed.data); setContentId(item.id); setRevision(item.revision); setCampaignId(item.campaignId);
    setSavedSnapshot(JSON.stringify(parsed.data)); setView("editor"); setNotice(null);
  }

  function startNew(topic = "") {
    setForm({ ...EMPTY_FORM, topic });
    setDocument(null); setContentId(""); setRevision(0); setSavedSnapshot("");
    setStep(1); setReached(1); setView("wizard"); setNotice(null);
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
    // Trazabilidad con el tema del radar, si el video salió de uno. No bloquea el guardado.
    await radar.link(saved.id);
    await refresh();
    return saved as StoredVideo;
  }

  async function saveAnd(nextStep?: WizardStep) {
    if (!document) return;
    setSaving(true); setNotice(null);
    try {
      await persist(document);
      if (nextStep) { setStep(nextStep); setReached((current) => (Math.max(current, nextStep) as WizardStep)); }
      else setNotice(noticeOk("Video guardado en la biblioteca central."));
    } catch (reason) {
      setNotice(noticeError(reason instanceof Error ? reason.message : "No se pudo guardar el video."));
    } finally {
      setSaving(false);
    }
  }

  const go = (next: WizardStep) => { setStep(next); setReached((current) => (Math.max(current, next) as WizardStep)); };
  const campaignName = campaigns.find((campaign) => campaign.id === campaignId)?.name ?? "sin campaña";
  const campaignNames = Object.fromEntries(campaigns.map((campaign) => [campaign.id, campaign.name]));

  return (
    <PageShell>
      <ModeSwitch modes={VIDEO_MODES} current="/video" className="mb-4" />
      <PageHeading
        title="Video"
        description="Tema → guion → imágenes de fondo → voz → guardar. Después puedes editar cada escena con vista previa."
        actions={<><Button type="button" variant={view === "wizard" ? "default" : "outline"} onClick={() => startNew()}><Plus className="h-4 w-4" /> Nuevo video</Button><Button type="button" variant={view === "wizard" ? "outline" : "default"} onClick={() => { setView("videos"); setNotice(null); }}><Film className="h-4 w-4" /> Mis videos</Button></>}
      />

      {notice ? <Notice className="mb-4" notice={notice} onDismiss={() => setNotice(null)} /> : null}

      {view === "wizard" ? (
        <>
          <StepIndicator current={step} reached={reached} onSelect={go} />

          {step === 1 ? (
            <TopicForm
              // Remontar al llegar el tema: TopicForm toma `initial` solo al construirse, y sin
              // esto el encargo del radar aparecería vacío por haber cargado un instante tarde.
              key={radar.topic?.id ?? "manual"}
              campaigns={campaigns}
              campaignId={campaignId}
              onCampaign={setCampaignId}
              initial={radar.brief ? { ...form, topic: radar.brief.topic, context: radar.brief.context } : form}
              onScript={(generated, values) => { setForm(values); setDocument(generated); setContentId(""); setRevision(0); setSavedSnapshot(""); go(2); }}
            />
          ) : null}

          {step === 2 && document ? (
            <ScriptPreview document={document} busy={saving} onContinue={() => void saveAnd(3)} />
          ) : null}

          {step === 3 && document && contentId ? (
            <ImageGallery contentItemId={contentId} revision={revision} document={document} campaignId={campaignId || undefined} onPersisted={adopt} onContinue={() => go(4)} />
          ) : null}

          {step === 4 && document && contentId ? (
            <div className="space-y-6">
              <VoiceoverStep contentItemId={contentId} revision={revision} document={document} onPersisted={adopt} />
              <div className="flex justify-between gap-3 border-t border-border pt-4">
                <Button type="button" variant="outline" onClick={() => go(3)}>← Volver a imágenes</Button>
                <Button type="button" onClick={() => go(5)}>Continuar a guardar →</Button>
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
        <VideoList videos={videos.filter((item) => !isExplainer(item))} campaignNames={campaignNames} onEdit={(item) => openEditor(item)} onRegenerate={(topic) => startNew(topic)} onNew={() => startNew()} />
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
          onImagePersisted={adoptImage}
          onSave={() => void saveAnd()}
          onBack={() => { setView("videos"); void refresh(); }}
        />
      ) : null}
    </PageShell>
  );
}
