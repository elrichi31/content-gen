import { sceneAccent, type VideoDocument, type VideoScene } from "@content-gen/domain/video";
import {
  AccentBar, ActionList, AlertLayout, BlockSequence, CloseLayout, DarkShell, DefenseLayout, DetailText,
  ExplainLayout, GlitchTitle, IndicatorCard, NarrativeText, PhaseLabel, PhaseLayout, Reveal, TerminalBlock, TimestampDisplay,
} from "./components";
import type { VideoProps } from "./video-metadata";
import { bodyTitleSize, closeTitleSize, introMotion, sceneImage, sceneLines, sceneText, titleScale, VideoScenes } from "./video-scenes";

type SceneProps = { document: VideoDocument; scene: VideoScene; durationInFrames: number; assetBaseUrl?: string };

/* ─── intro ─── */
const IntroScene = ({ document, scene, durationInFrames: d, assetBaseUrl }: SceneProps) => {
  const accent = sceneAccent(scene);
  const motion = introMotion(document.hookStyle);
  return (
    <DarkShell accent={accent} durationInFrames={d} variant="alert" bgSrc={sceneImage(scene, assetBaseUrl)} niche={document.niche} hookStyle={document.hookStyle} sceneKey="intro">
      <AlertLayout
        tag={<BlockSequence from={0} durationInFrames={d}><Reveal y={12} blurFrom={8}><PhaseLabel text={sceneText(scene.content, "tag")} accent={accent[0]} /></Reveal></BlockSequence>}
        title={<BlockSequence from={motion.titleFrom} durationInFrames={d - motion.titleFrom}><Reveal y={motion.titleY} scaleFrom={0.88} blurFrom={30} durationInFrames={38}><GlitchTitle text={sceneText(scene.content, "title") || document.title} accent={accent} size={Math.round(motion.titleSize * titleScale(document.niche))} /></Reveal></BlockSequence>}
        subtitle={<BlockSequence from={motion.subtitleFrom} durationInFrames={d - motion.subtitleFrom}><Reveal y={16} blurFrom={10}><DetailText text={sceneText(scene.content, "subtitle")} size={motion.subtitleSize} /></Reveal></BlockSequence>}
      />
    </DarkShell>
  );
};

/* ─── layers ─── */
const LayersScene = ({ document, scene, durationInFrames: d, assetBaseUrl }: SceneProps) => {
  const accent = sceneAccent(scene);
  return (
    <DarkShell accent={accent} durationInFrames={d} variant="terminal" bgSrc={sceneImage(scene, assetBaseUrl)} niche={document.niche} hookStyle={document.hookStyle} sceneKey="layers">
      <ExplainLayout
        tag={<BlockSequence from={0} durationInFrames={d}><Reveal y={12} blurFrom={8}><PhaseLabel text={sceneText(scene.content, "tag")} accent={accent[0]} /></Reveal></BlockSequence>}
        terminal={<BlockSequence from={10} durationInFrames={d - 10}><Reveal y={20} blurFrom={14}><TerminalBlock lines={sceneLines(scene.content, "terminal")} accent={accent} startFrame={12} /></Reveal></BlockSequence>}
        definition={<BlockSequence from={60} durationInFrames={d - 60}><Reveal y={36} scaleFrom={0.94} blurFrom={22}><NarrativeText text={sceneText(scene.content, "definition")} size={62} /></Reveal></BlockSequence>}
      />
    </DarkShell>
  );
};

/* ─── phase ─── */
const PhaseScene = ({ document, scene, durationInFrames: d, assetBaseUrl }: SceneProps) => {
  const accent = sceneAccent(scene);
  return (
    <DarkShell accent={accent} durationInFrames={d} variant="body" bgSrc={sceneImage(scene, assetBaseUrl)} niche={document.niche} hookStyle={document.hookStyle} sceneKey={scene.id as "phase1" | "phase2" | "phase3"}>
      <PhaseLayout
        timestamp={<BlockSequence from={6} durationInFrames={d - 6}><Reveal y={10} blurFrom={6}><TimestampDisplay time={sceneText(scene.content, "timestamp")} accent={accent} /></Reveal></BlockSequence>}
        title={<BlockSequence from={12} durationInFrames={d - 12}><Reveal y={44} scaleFrom={0.9} blurFrom={28} durationInFrames={36}><GlitchTitle text={sceneText(scene.content, "title")} accent={accent} size={bodyTitleSize(document.niche)} /></Reveal></BlockSequence>}
        indicator={<BlockSequence from={62} durationInFrames={d - 62}><Reveal y={20} blurFrom={12}><IndicatorCard accent={accent} items={sceneLines(scene.content, "indicator")} /></Reveal></BlockSequence>}
      />
    </DarkShell>
  );
};

/* ─── reality ─── */
const RealityScene = ({ document, scene, durationInFrames: d, assetBaseUrl }: SceneProps) => {
  const accent = sceneAccent(scene);
  return (
    <DarkShell accent={accent} durationInFrames={d} variant="body" bgSrc={sceneImage(scene, assetBaseUrl)} niche={document.niche} hookStyle={document.hookStyle} sceneKey="reality">
      <DefenseLayout
        tag={<BlockSequence from={0} durationInFrames={d}><Reveal y={12} blurFrom={8}><PhaseLabel text={sceneText(scene.content, "tag")} accent={accent[0]} /></Reveal></BlockSequence>}
        title={<BlockSequence from={10} durationInFrames={d - 10}><Reveal y={38} scaleFrom={0.93} blurFrom={24}><NarrativeText text={sceneText(scene.content, "title")} size={58} /></Reveal></BlockSequence>}
        actions={<BlockSequence from={34} durationInFrames={d - 34}><Reveal y={24} blurFrom={14}><ActionList items={sceneLines(scene.content, "actions")} accent={accent} /></Reveal></BlockSequence>}
      />
    </DarkShell>
  );
};

/* ─── close ─── */
const CloseScene = ({ document, scene, durationInFrames: d, assetBaseUrl }: SceneProps) => {
  const accent = sceneAccent(scene);
  return (
    <DarkShell accent={accent} durationInFrames={d} variant="close" bgSrc={sceneImage(scene, assetBaseUrl)} niche={document.niche} hookStyle={document.hookStyle} sceneKey="close">
      <CloseLayout
        tag={<BlockSequence from={0} durationInFrames={d}><Reveal y={12} blurFrom={8}><PhaseLabel text={sceneText(scene.content, "tag")} accent={accent[0]} /></Reveal></BlockSequence>}
        title={<BlockSequence from={8} durationInFrames={d - 8}><Reveal y={40} scaleFrom={0.92} blurFrom={26} durationInFrames={36}><GlitchTitle text={sceneText(scene.content, "title")} accent={accent} size={closeTitleSize(document.niche)} /></Reveal></BlockSequence>}
        subtitle={<BlockSequence from={30} durationInFrames={d - 30}><Reveal y={18} blurFrom={10}><NarrativeText text={sceneText(scene.content, "subtitle")} size={46} accent="rgba(255,255,255,0.85)" /></Reveal></BlockSequence>}
        bar={<BlockSequence from={40} durationInFrames={d - 40}><Reveal y={10} blurFrom={6}><AccentBar accent={accent} /></Reveal></BlockSequence>}
      />
    </DarkShell>
  );
};

const scenesByKind = { intro: IntroScene, layers: LayersScene, phase: PhaseScene, reality: RealityScene, close: CloseScene } as const;

export function StandardVideo({ document, assetBaseUrl }: VideoProps) {
  return (
    <VideoScenes
      document={document}
      assetBaseUrl={assetBaseUrl}
      render={(scene, durationInFrames) => {
        const Scene = scenesByKind[scene.kind as keyof typeof scenesByKind] ?? IntroScene;
        return <Scene document={document} scene={scene} durationInFrames={durationInFrames} assetBaseUrl={assetBaseUrl} />;
      }}
    />
  );
}
