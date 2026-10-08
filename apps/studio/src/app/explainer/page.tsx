"use client";

import { useCallback, useEffect, useState } from "react";
import { GraduationCap, Plus } from "lucide-react";
import { videoDocumentSchema, type VideoDocument } from "@content-gen/domain/video";
import { PageHeading, PageShell } from "@/components/page-shell";
import { ModeSwitch, VIDEO_MODES } from "@/components/mode-switch";
import { Button } from "@/components/ui/button";
import { Notice, noticeError, type NoticeState } from "@/components/ui/notice";
import { ExplainerAnimationStep } from "@/components/explainer/animation-step";
import { ExplainerScriptStep } from "@/components/explainer/script-step";
import { StepIndicator, type WizardStep } from "@/components/video/step-indicator";
import { TopicForm, type TopicFormValues } from "@/components/video/topic-form";
import { VideoList, type StoredVideo } from "@/components/video/video-list";
import { VoiceoverStep } from "@/components/video/voiceover-step";
import { VideoRenderPanel } from "@/components/video-render-panel";
import { useRequestedContentId } from "@/lib/use-requested-content-id";

type Campaign = { id: string; name: string };
type Persisted = { revision: number; document: { data: unknown } };

const STEPS = ["Tema", "Guion", "Voz", "Animaciones", "Render"] as const;
const EMPTY_FORM: TopicFormValues = { topic: "", context: "", targetDurationSeconds: 45, templateId: "explainer" };
const TEMPLATES = [["explainer", "Educativo", "Narración + animaciones"]] as const;
const isExplainer = (item: StoredVideo) => (item.document.data as { templateId?: unknown } | null)?.templateId === "explainer";

/**
 * Video educativo: la IA escribe el guion del narrador y luego anima cada escena en HTML/CSS.
 * Es un documento de video más (plantilla `explainer`), así que reutiliza la voz, la biblioteca y el render.
 */
export default function ExplainerPage() {
  const [view, setView] = useState<"wizard" | "list">("wizard");
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
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);

  const refresh = useCallback(async () => {
    const [campaignResponse, videoResponse] = await Promise.all([fetch("/api/campaigns"), fetch("/api/content-items?type=video")]);
    const nextCampaigns = (await campaignResponse.json()) as Campaign[];
    setCampaigns(nextCampaigns);
    setVideos(((await videoResponse.json()) as StoredVideo[]).filter(isExplainer));
    setCampaignId((current) => current || nextCampaigns[0]?.id || "");
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const go = (next: WizardStep) => { setStep(next); setReached((current) => (Math.max(current, next) as WizardStep)); };

  function adopt(content: Persisted) {
    const parsed = videoDocumentSchema.safeParse(content.document.data);
    if (!parsed.success) return setNotice(noticeError("El servidor devolvió un documento de video inválido."));
    setDocument(parsed.data); setRevision(content.revision); setSavedSnapshot(JSON.stringify(parsed.data));
  }

  function open(item: StoredVideo) {
    const parsed = videoDocumentSchema.safeParse(item.document.data);
    if (!parsed.success) return setNotice(noticeError("Este contenido no es un video válido."));
    setDocument(parsed.data); setContentId(item.id); setRevision(item.revision); setCampaignId(item.campaignId);
    setSavedSnapshot(JSON.stringify(parsed.data)); setStep(4); setReached(5); setView("wizard"); setNotice(null);
  }

  const requestedId = useRequestedContentId();
  useEffect(() => {
    if (!requestedId || contentId === requestedId) return;
    const item = videos.find((entry) => entry.id === requestedId);
    if (item) open(item);
  }, [requestedId, videos]);

  function startNew() {
    setForm(EMPTY_FORM); setDocument(null); setContentId(""); setRevision(0); setSavedSnapshot("");
    setStep(1); setReached(1); setView("wizard"); setNotice(null);
  }

  /** Guarda el guion para que voz, animaciones y render trabajen sobre el documento persistido. */
  async function saveAnd(nextStep: WizardStep) {
    if (!document) return;
    setSaving(true); setNotice(null);
    try {
      const body = { ...(contentId ? { revision } : {}), campaignId, type: "video", document: { schemaVersion: 1, data: document } };
      const response = await fetch(contentId ? `/api/content-items/${contentId}` : "/api/content-items", { method: contentId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const saved = await response.json();
      if (!response.ok) throw new Error(typeof saved.error === "string" ? saved.error : "No se pudo guardar el video.");
      adopt(saved); setContentId(saved.id);
      await refresh();
      go(nextStep);
    } catch (reason) {
      setNotice(noticeError(reason instanceof Error ? reason.message : "No se pudo guardar el video."));
    } finally {
      setSaving(false);
    }
  }

  const unsaved = document !== null && JSON.stringify(document) !== savedSnapshot;
  const campaignNames = Object.fromEntries(campaigns.map((campaign) => [campaign.id, campaign.name]));

  return (
    <PageShell>
      <ModeSwitch modes={VIDEO_MODES} current="/explainer" className="mb-4" />
      <PageHeading
        title="Video educativo"
        description="Explica cómo funciona algo con narración y animaciones generadas por IA, sin imágenes. Se renderiza con HyperFrames o con el motor Canvas a 60 fps."
        actions={<><Button type="button" variant={view === "wizard" ? "default" : "outline"} onClick={startNew}><Plus className="h-4 w-4" /> Nuevo</Button><Button type="button" variant={view === "list" ? "default" : "outline"} onClick={() => { setView("list"); setNotice(null); }}><GraduationCap className="h-4 w-4" /> Mis videos educativos</Button></>}
      />

      {notice ? <Notice className="mb-4" notice={notice} onDismiss={() => setNotice(null)} /> : null}

      {view === "wizard" ? (
        <>
          <StepIndicator current={step} reached={reached} onSelect={go} steps={STEPS} />

          {step === 1 ? (
            <TopicForm
              campaigns={campaigns}
              campaignId={campaignId}
              onCampaign={setCampaignId}
              initial={form}
              templates={TEMPLATES}
              description="La IA escribe el guion del narrador escena por escena y describe la animación de cada una."
              onScript={(generated, values) => { setForm(values); setDocument(generated); setContentId(""); setRevision(0); setSavedSnapshot(""); setReached(2); setStep(2); }}
            />
          ) : null}

          {step === 2 && document ? <ExplainerScriptStep document={document} onChange={setDocument} busy={saving} onContinue={() => void saveAnd(3)} /> : null}

          {step === 3 && document && contentId ? (
            <div className="space-y-6">
              <VoiceoverStep contentItemId={contentId} revision={revision} document={document} onPersisted={adopt} canGenerateScript={false} />
              <div className="flex justify-between gap-3 border-t border-border pt-4">
                <Button type="button" variant="outline" onClick={() => go(2)}>← Volver al guion</Button>
                <Button type="button" onClick={() => go(4)}>Continuar a las animaciones →</Button>
              </div>
            </div>
          ) : null}

          {step === 4 && document && contentId ? (
            <div className="space-y-6">
              <ExplainerAnimationStep contentItemId={contentId} document={document} onPersisted={adopt} />
              <div className="flex justify-between gap-3 border-t border-border pt-4">
                <Button type="button" variant="outline" onClick={() => go(3)}>← Volver a la voz</Button>
                <Button type="button" onClick={() => go(5)}>Continuar al render →</Button>
              </div>
            </div>
          ) : null}

          {step === 5 && document && contentId ? (
            <div className="mx-auto max-w-2xl space-y-3">
              {document.scenes.some((scene) => !scene.content.canvas) ? <p className="text-sm text-muted-foreground">Hay escenas sin animación: en el video saldrán solo con su título.</p> : null}
              <VideoRenderPanel contentItemId={contentId} unsavedChanges={unsaved} hyperframesOnly defaultEngine="canvas" />
            </div>
          ) : null}
        </>
      ) : (
        <VideoList videos={videos} campaignNames={campaignNames} onEdit={(item) => open(item)} onRegenerate={() => startNew()} onNew={startNew} />
      )}
    </PageShell>
  );
}
