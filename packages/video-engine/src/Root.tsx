import { Composition } from "remotion";
import { videoTemplates } from "./template-registry";

export const RemotionRoot = () => Object.values(videoTemplates).map((template) => (
  <Composition
    key={template.compositionId}
    id={template.compositionId}
    component={template.component}
    durationInFrames={template.durationInFrames}
    fps={template.fps}
    width={template.width}
    height={template.height}
    defaultProps={template.defaultProps}
    calculateMetadata={template.calculateMetadata}
  />
));
