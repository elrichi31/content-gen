type PipelineDocument = {
  title?: string;
  templateId?: string;
  scenes: { id: string; content: Record<string, unknown> }[];
};
type SavedVideo = { type: string; revision: number; document: PipelineDocument };
type RenderJob = { id: string; status: string };
export type VideoPipelineDependencies = {
  create: () => Promise<string>;
  read: (id: string) => Promise<SavedVideo>;
  image: (id: string, sceneId: string, prompt: string, source: "openai" | "unsplash", revision: number) => Promise<unknown>;
  animation: (id: string, sceneId: string) => Promise<unknown>;
  voiceover: (id: string, revision: number) => Promise<unknown>;
  audio: (id: string, sceneId: string, voiceId: string, modelId: string, revision: number) => Promise<unknown>;
  caption: (id: string, revision: number) => Promise<unknown>;
  canvasPlan: (id: string) => Promise<unknown>;
  render: (id: string, engine?: RenderEngine) => Promise<RenderJob>;
  /** Avisa de cada paso al empezarlo, para que la cola muestre qué se está generando. */
  progress?: (step: string) => void;
};
export type RenderEngine = "remotion" | "hyperframes" | "canvas";
type PipelineInput = { topic: string; imageSource: "none" | "openai" | "unsplash"; voiceId?: string; modelId?: string; engine?: RenderEngine };
type PipelineResult = {
  status: "queued" | "incomplete";
  contentItemId: string;
  title?: string;
  completedSteps: string[];
  renderJob?: RenderJob;
  /** Con Canvas: las animaciones que quedaron en cada escena, para ver de un vistazo si el plan salió. */
  animations?: Record<string, string[]>;
  failedStep?: string;
  error?: string;
};

/** Plantillas de `content.canvas` (un plan suelto o una lista de animaciones); vacío si no hay plan. */
const sceneTemplates = (canvas: unknown) => (Array.isArray(canvas) ? canvas : canvas ? [canvas] : []).map((beat) => String((beat as { template?: unknown }).template ?? "title"));

/** Guarda primero; si un proveedor falla conserva el borrador y no encola un video incompleto. */
export async function runVideoPipeline(input: PipelineInput, deps: VideoPipelineDependencies): Promise<PipelineResult> {
  deps.progress?.("create");
  const contentItemId = await deps.create();
  const completedSteps = ["create"];
  let step = "read";
  const at = (name: string) => { step = name; deps.progress?.(name); };
  let title: string | undefined;
  try {
    const read = async () => {
      const current = await deps.read(contentItemId);
      if (current.type !== "video") throw new Error("Esa pieza no es un video.");
      return current;
    };
    const current = await read();
    title = current.document.title;
    // El guion de voz va primero: es la llamada barata y, si falla, no se han gastado imágenes.
    // El educativo ya trae su narración en el guion (sus animaciones se escriben sobre ella):
    // regenerarla era una llamada de más que además la desalineaba.
    const hasNarration = current.document.scenes.every((scene) => typeof scene.content.voiceover === "string" && scene.content.voiceover.trim());
    const rewritesNarration = Boolean(input.voiceId) && !(current.document.templateId === "explainer" && hasNarration);
    if (rewritesNarration) {
      at("voiceover");
      await deps.voiceover(contentItemId, (await read()).revision);
      completedSteps.push(step);
    }
    // Canvas no usa las animaciones HTML del educativo (dibuja su propio plan, que se genera al final),
    // pero sí las imágenes, también en el educativo: van de fondo bajo la plantilla.
    const canvas = input.engine === "canvas";
    for (const scene of current.document.scenes) {
      if (current.document.templateId === "explainer" && !canvas) {
        at(`animation:${scene.id}`);
        await deps.animation(contentItemId, scene.id);
      } else if (input.imageSource !== "none") {
        at(`image:${scene.id}`);
        const prompt = typeof scene.content.imagePrompt === "string" && scene.content.imagePrompt.trim().length >= 3
          ? scene.content.imagePrompt.trim().slice(0, 1500) : input.topic;
        await deps.image(contentItemId, scene.id, prompt, input.imageSource, (await read()).revision);
      } else continue;
      completedSteps.push(step);
    }
    if (input.voiceId) {
      for (const scene of current.document.scenes) {
        at(`audio:${scene.id}`);
        await deps.audio(contentItemId, scene.id, input.voiceId, input.modelId ?? "eleven_multilingual_v2", (await read()).revision);
        completedSteps.push(step);
      }
    }
    // Después de la voz: así los cues del plan se comprueban contra los tiempos reales por palabra.
    let animations: Record<string, string[]> | undefined;
    if (canvas) {
      // El educativo trae el plan del guion (la narración se escribió para esas animaciones): replanificar
      // gastaba otra llamada y podía cambiar lo elegido. Solo se planifica si falta o la voz se reescribió.
      const planned = !rewritesNarration && current.document.scenes.every((scene) => scene.content.canvas);
      if (!planned) {
        at("canvas-plan");
        await deps.canvasPlan(contentItemId);
        completedSteps.push(step);
      }
      animations = Object.fromEntries((await read()).document.scenes.map((scene) => [scene.id, sceneTemplates(scene.content.canvas)]));
    }
    at("caption");
    await deps.caption(contentItemId, (await read()).revision);
    completedSteps.push(step);
    at("verify");
    await read();
    at("render");
    const renderJob = await deps.render(contentItemId, input.engine);
    completedSteps.push(step);
    return { status: "queued", contentItemId, title, completedSteps, renderJob, ...(animations ? { animations } : {}) };
  } catch (error) {
    return { status: "incomplete", contentItemId, title, completedSteps, failedStep: step, error: error instanceof Error ? error.message : "La generación falló." };
  }
}
