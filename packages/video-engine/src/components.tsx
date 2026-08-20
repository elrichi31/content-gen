import type { CSSProperties, FC, ReactNode } from "react";
import { useState } from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  random,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { AccentPair } from "@content-gen/domain/video";
import { fitFontSize, fontStack, monoStack, safeBounds, safeContentWidth } from "./text-fit.ts";

// Background image that simply disappears if the file is missing, instead of
// failing the whole render. This lets a video be saved/previewed with some (or
// no) scene images and have them appear automatically once generated later.
const OptionalBg: FC<{ src: string; style: CSSProperties }> = ({ src, style }) => {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <Img src={src} style={style} onError={() => setFailed(true)} />;
};

/** Ancho útil de una escena: el lienzo menos los márgenes seguros de `DarkShell`. */
const useSafeContentWidth = () => safeContentWidth(useVideoConfig().width);

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

// `interpolate` exige un inputRange estrictamente creciente. En escenas muy cortas
// los puntos calculados a partir de la duración se solapan: se comprimen en vez de romper el render.
const rising = (points: number[]) => points.reduce<number[]>((result, value, index) => [...result, index === 0 ? value : Math.max(value, result[index - 1] + 1)], []);

const loop = (
  frame: number,
  values: [number, number, number],
  cycle: number,
  phase = 0,
) => interpolate((frame + phase) % cycle, [0, cycle / 2, cycle], values, clamp);

const revealSpring = (frame: number, fps: number, durationInFrames = 32) =>
  spring({
    fps,
    frame,
    durationInFrames,
    config: { damping: 200, stiffness: 180, mass: 0.9 },
  });

type MotionNiche =
  | "cybersecurity"
  | "ai"
  | "history"
  | "fraud"
  | "news"
  | "general";

type MotionHookStyle =
  | "shock"
  | "curiosity"
  | "contrarian"
  | "countdown"
  | "real-story";

type MotionSceneKey =
  | "intro"
  | "layers"
  | "phase1"
  | "phase2"
  | "phase3"
  | "reality"
  | "close"
  | "event1"
  | "event2"
  | "event3"
  | "event4"
  | "today";

type MotionProfile = {
  imageScale: [number, number, number];
  imageX: [number, number, number];
  imageY: [number, number, number];
  imageRotate: [number, number, number];
  pulse: number;
  gridOpacity: number;
  particleCount: number;
  particleTravel: number;
  tintOpacity: number;
  vignetteOpacity: number;
};

const normalizeNiche = (value?: string): MotionNiche => {
  switch (value) {
    case "cybersecurity":
    case "ai":
    case "history":
    case "fraud":
    case "news":
      return value;
    default:
      return "general";
  }
};

const normalizeHookStyle = (value?: string): MotionHookStyle => {
  switch (value) {
    case "shock":
    case "curiosity":
    case "contrarian":
    case "countdown":
    case "real-story":
      return value;
    default:
      return "curiosity";
  }
};

const getMotionProfile = ({
  niche,
  hookStyle,
  sceneKey,
}: {
  niche: MotionNiche;
  hookStyle: MotionHookStyle;
  sceneKey?: MotionSceneKey;
}): MotionProfile => {
  const profileByNiche: Record<MotionNiche, MotionProfile> = {
    cybersecurity: {
      imageScale: [1.1, 1.15, 1.2],
      imageX: [-5, 2, 6],
      imageY: [-2, 0, 4],
      imageRotate: [-0.9, 0.2, 0.8],
      pulse: 0.18,
      gridOpacity: 0.24,
      particleCount: 18,
      particleTravel: 8,
      tintOpacity: 0.24,
      vignetteOpacity: 0.64,
    },
    ai: {
      imageScale: [1.07, 1.12, 1.16],
      imageX: [4, 0, -4],
      imageY: [-3, -1, 2],
      imageRotate: [0.4, 0, -0.4],
      pulse: 0.16,
      gridOpacity: 0.14,
      particleCount: 12,
      particleTravel: 5,
      tintOpacity: 0.18,
      vignetteOpacity: 0.52,
    },
    history: {
      imageScale: [1.12, 1.16, 1.2],
      imageX: [-7, -3, 2],
      imageY: [-4, -1, 3],
      imageRotate: [-0.6, -0.2, 0.3],
      pulse: 0.11,
      gridOpacity: 0.08,
      particleCount: 22,
      particleTravel: 4,
      tintOpacity: 0.22,
      vignetteOpacity: 0.72,
    },
    fraud: {
      imageScale: [1.09, 1.13, 1.17],
      imageX: [8, 3, -2],
      imageY: [-2, 1, 5],
      imageRotate: [0.9, 0.1, -0.5],
      pulse: 0.2,
      gridOpacity: 0.18,
      particleCount: 16,
      particleTravel: 7,
      tintOpacity: 0.2,
      vignetteOpacity: 0.66,
    },
    news: {
      imageScale: [1.05, 1.08, 1.12],
      imageX: [-8, -2, 3],
      imageY: [0, 1, 3],
      imageRotate: [-0.35, 0, 0.35],
      pulse: 0.15,
      gridOpacity: 0.12,
      particleCount: 10,
      particleTravel: 5,
      tintOpacity: 0.18,
      vignetteOpacity: 0.58,
    },
    general: {
      imageScale: [1.08, 1.12, 1.16],
      imageX: [-4, 1, 4],
      imageY: [-2, 0, 3],
      imageRotate: [-0.4, 0, 0.4],
      pulse: 0.14,
      gridOpacity: 0.16,
      particleCount: 14,
      particleTravel: 6,
      tintOpacity: 0.18,
      vignetteOpacity: 0.6,
    },
  };

  const base = profileByNiche[niche];
  const hookBoost = hookStyle === "shock"
    ? 1.16
    : hookStyle === "countdown"
      ? 1.1
      : hookStyle === "contrarian"
        ? 1.06
        : hookStyle === "real-story"
          ? 0.94
          : 1;
  const isIntro = sceneKey === "intro";
  const isCalmScene = sceneKey === "reality" || sceneKey === "today" || sceneKey === "close";
  const sceneScaleBoost = isIntro ? 1.04 : isCalmScene ? 0.96 : 1;
  const sceneTravelBoost = sceneKey === "phase3" || sceneKey === "event4" ? 1.14 : isCalmScene ? 0.86 : 1;

  return {
    imageScale: base.imageScale.map((v) => Number((v * hookBoost * sceneScaleBoost).toFixed(3))) as [number, number, number],
    imageX: base.imageX.map((v) => Number((v * sceneTravelBoost).toFixed(2))) as [number, number, number],
    imageY: base.imageY.map((v) => Number((v * sceneTravelBoost).toFixed(2))) as [number, number, number],
    imageRotate: base.imageRotate.map((v) => Number((v * sceneTravelBoost).toFixed(2))) as [number, number, number],
    pulse: base.pulse * hookBoost,
    gridOpacity: isCalmScene ? base.gridOpacity * 0.78 : base.gridOpacity,
    particleCount: Math.max(8, Math.round(base.particleCount * (isCalmScene ? 0.72 : 1))),
    particleTravel: base.particleTravel * sceneTravelBoost,
    tintOpacity: isIntro ? base.tintOpacity + 0.04 : base.tintOpacity,
    vignetteOpacity: base.vignetteOpacity,
  };
};

/* ─── SCENE SHELL (RED VARIANT) ─── */

export const DarkShell: FC<{
  accent: AccentPair;
  durationInFrames: number;
  children: ReactNode;
  variant?: "alert" | "body" | "terminal" | "close";
  bgSrc?: string;
  niche?: string;
  hookStyle?: string;
  sceneKey?: MotionSceneKey;
}> = ({ accent, durationInFrames, children, variant = "body", bgSrc, niche, hookStyle, sceneKey }) => {
  const frame = useCurrentFrame();
  const motionProfile = getMotionProfile({
    niche: normalizeNiche(niche),
    hookStyle: normalizeHookStyle(hookStyle),
    sceneKey,
  });
  const imageProgress = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], clamp);
  const bgScale = interpolate(imageProgress, [0, 0.55, 1], motionProfile.imageScale, clamp);
  const bgX = interpolate(imageProgress, [0, 0.55, 1], motionProfile.imageX, clamp);
  const bgY = interpolate(imageProgress, [0, 0.55, 1], motionProfile.imageY, clamp);
  const bgRotate = interpolate(imageProgress, [0, 0.55, 1], motionProfile.imageRotate, clamp);
  const bgBlurOpacity = interpolate(imageProgress, [0, 0.5, 1], [0.15, 0.22, 0.12], clamp);
  const contentOpacity = interpolate(
    frame,
    rising([0, 10, durationInFrames - 14, durationInFrames - 1]),
    [0.72, 1, 1, 0.82],
    { ...clamp, easing: Easing.inOut(Easing.cubic) },
  );
  const driftY = loop(frame, [8, 0, 8], 200);

  return (
    <AbsoluteFill style={{ backgroundColor: "#050101", color: "white", overflow: "hidden" }}>
      {bgSrc && (
        <>
          <OptionalBg
            src={bgSrc}
            style={{
              position: "absolute",
              inset: -24,
              width: "calc(100% + 48px)",
              height: "calc(100% + 48px)",
              objectFit: "cover",
              objectPosition: "center",
              opacity: bgBlurOpacity,
              filter: "blur(18px) saturate(1.1)",
              transform: `translate3d(${bgX * -0.45}px, ${bgY * -0.4}px, 0) scale(${bgScale + 0.05})`,
            }}
          />
          <OptionalBg
            src={bgSrc}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center",
              opacity: 0.95,
              transform: `translate3d(${bgX}px, ${bgY}px, 0) scale(${bgScale}) rotate(${bgRotate}deg)`,
            }}
          />
        </>
      )}
      <DarkBackground
        accent={accent}
        variant={variant}
        niche={normalizeNiche(niche)}
        sceneKey={sceneKey}
        motionProfile={motionProfile}
      />
      {variant === "alert" && <AlertBorder accent={accent} />}
      <div
        style={{
          position: "absolute",
          left: safeBounds.left,
          right: safeBounds.right,
          top: safeBounds.top,
          bottom: safeBounds.bottom,
          fontFamily: fontStack,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: contentOpacity,
            transform: `translateY(${driftY}px)`,
            transformOrigin: "center center",
          }}
        >
          {children}
        </div>
      </div>
      <ScanLine />
    </AbsoluteFill>
  );
};

/* ─── DARK BACKGROUND ─── */

const DarkBackground: FC<{
  accent: AccentPair;
  variant: string;
  niche: MotionNiche;
  sceneKey?: MotionSceneKey;
  motionProfile: MotionProfile;
}> = ({ accent, variant, niche, sceneKey, motionProfile }) => {
  const frame = useCurrentFrame();
  const pulseOpacity = variant === "alert"
    ? interpolate((frame * 2) % 60, [0, 30, 60], [motionProfile.pulse * 0.55, motionProfile.pulse * 1.35, motionProfile.pulse * 0.55], clamp)
    : motionProfile.pulse;
  const sweep = interpolate((frame * 1.8) % 160, [0, 160], [-320, 1280], clamp);

  return (
    <>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 50% 30%, ${accent[1]}11 0%, transparent 50%), radial-gradient(circle at 80% 80%, ${accent[0]}09 0%, transparent 40%), linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.1) 40%, rgba(0,0,0,0.1) 60%, rgba(0,0,0,0.65) 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          opacity: motionProfile.gridOpacity,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
          maskImage: "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.6) 30%, rgba(0,0,0,0.3) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at 50% 45%, ${accent[0]}${Math.round(pulseOpacity * 255).toString(16).padStart(2, "0")} 0%, transparent 45%)`,
          transform: `scale(${loop(frame, [1, 1.06, 1], 120)})`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `linear-gradient(135deg, ${accent[1]}${Math.round(motionProfile.tintOpacity * 255).toString(16).padStart(2, "0")} 0%, transparent 35%, transparent 70%, ${accent[0]}11 100%)`,
          mixBlendMode: niche === "history" ? "screen" : "normal",
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 50%, transparent 30%, rgba(0,0,0,${motionProfile.vignetteOpacity}) 100%)`,
        }}
      />
      {(niche === "cybersecurity" || niche === "ai") && (
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            width: 220,
            background: `linear-gradient(90deg, transparent 0%, ${accent[0]}18 50%, transparent 100%)`,
            transform: `translateX(${sweep}px) skewX(-18deg)`,
            opacity: niche === "cybersecurity" ? 0.5 : 0.32,
            filter: "blur(6px)",
          }}
        />
      )}
      {niche === "fraud" && (
        <>
          <div
            style={{
              position: "absolute",
              inset: "-10% -30%",
              background: `repeating-linear-gradient(-28deg, transparent 0 72px, ${accent[0]}12 72px 82px)`,
              opacity: 0.42,
              transform: `translateX(${interpolate((frame * 1.2) % 240, [0, 240], [-30, 30], clamp)}px)`,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `radial-gradient(circle at 50% 24%, ${accent[0]}12 0%, transparent 32%)`,
            }}
          />
        </>
      )}
      {niche === "history" && (
        <AbsoluteFill
          style={{
            background: "linear-gradient(180deg, rgba(18,12,4,0.18) 0%, transparent 30%, transparent 70%, rgba(18,12,4,0.28) 100%)",
            mixBlendMode: "screen",
          }}
        />
      )}
      {niche === "news" && (
        <>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 74,
              height: 3,
              background: `linear-gradient(90deg, transparent 0%, ${accent[0]}55 25%, ${accent[1]}66 75%, transparent 100%)`,
              opacity: 0.58,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 88,
              height: 2,
              background: `linear-gradient(90deg, transparent 0%, ${accent[1]}55 25%, ${accent[0]}66 75%, transparent 100%)`,
              opacity: 0.5,
            }}
          />
        </>
      )}
      {Array.from({ length: motionProfile.particleCount }).map((_, i) => {
        const size = 2 + random(`zd-p-s-${i}`) * 3;
        const baseLeft = 5 + random(`zd-p-l-${i}`) * 90;
        const baseTop = 10 + random(`zd-p-t-${i}`) * 80;
        const cycle = 100 + Math.floor(random(`zd-p-c-${i}`) * 60);
        const progress = ((frame + i * 9) % cycle) / cycle;
        const opacity = interpolate(progress, [0, 0.3, 0.7, 1], [0, 0.35, 0.2, 0], clamp);
        return (
          <div
            key={`zd-p-${i}`}
            style={{
              position: "absolute",
              width: size,
              height: size,
              borderRadius: 999,
              left: `${baseLeft}%`,
              top: `${baseTop - progress * motionProfile.particleTravel}%`,
              opacity,
              background: i % 2 === 0 ? accent[0] : accent[1],
              boxShadow: `0 0 12px ${accent[0]}`,
            }}
          />
        );
      })}
      {sceneKey === "intro" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(circle at 50% 50%, transparent 0%, transparent 42%, ${accent[0]}08 68%, transparent 100%)`,
            opacity: 0.55,
            transform: `scale(${loop(frame, [0.96, 1.04, 0.96], 90)})`,
          }}
        />
      )}
    </>
  );
};

/* ─── SCAN LINE (CRT effect) ─── */

const ScanLine: FC = () => {
  const frame = useCurrentFrame();
  const y = interpolate((frame * 3) % 240, [0, 240], [-5, 105], clamp);

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: `${y}%`,
        height: 3,
        background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 20%, rgba(255,255,255,0.06) 80%, transparent 100%)",
        pointerEvents: "none",
      }}
    />
  );
};

/* ─── ALERT BORDER ─── */

const AlertBorder: FC<{ accent: AccentPair }> = ({ accent }) => {
  const frame = useCurrentFrame();
  const pulse = interpolate((frame * 3) % 60, [0, 30, 60], [0.15, 0.55, 0.15], clamp);

  return (
    <div
      style={{
        position: "absolute",
        inset: 24,
        border: `3px solid ${accent[0]}`,
        borderRadius: 32,
        opacity: pulse,
        boxShadow: `inset 0 0 60px ${accent[0]}22, 0 0 40px ${accent[0]}33`,
        pointerEvents: "none",
      }}
    />
  );
};

/* ─── GLITCH TITLE ─── */

export const GlitchTitle: FC<{ text: string; accent: AccentPair; size?: number }> = ({
  text,
  accent,
  size: requestedSize = 140,
}) => {
  const frame = useCurrentFrame();
  const maxWidth = useSafeContentWidth();
  // Los tres calcos comparten cuerpo para que los fantasmas corten líneas igual que el texto principal.
  const size = fitFontSize({ text, maxWidth, size: requestedSize, weight: 900, letterSpacing: -6, minRatio: 0.45 });
  const glitchActive = (frame % 90) > 82 || (frame % 60) > 55;
  const offsetR = glitchActive ? interpolate(random(`g-r-${frame}`), [0, 1], [-6, 6]) : 0;
  const offsetB = glitchActive ? interpolate(random(`g-b-${frame}`), [0, 1], [-4, 4]) : 0;
  const skew = glitchActive ? interpolate(random(`g-s-${frame}`), [0, 1], [-1.5, 1.5]) : 0;

  return (
    <div style={{ position: "relative", width: "100%", maxWidth, textAlign: "center" }}>
      {/* Red ghost */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          fontSize: size,
          lineHeight: 0.9,
          fontWeight: 900,
          letterSpacing: -6,
          whiteSpace: "pre-line",
          color: "transparent",
          WebkitTextStroke: `2px ${accent[0]}66`,
          transform: `translate(${offsetR}px, ${-offsetR * 0.5}px) skewX(${skew}deg)`,
          opacity: glitchActive ? 0.7 : 0,
        }}
      >
        {text}
      </div>
      {/* Blue ghost */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          fontSize: size,
          lineHeight: 0.9,
          fontWeight: 900,
          letterSpacing: -6,
          whiteSpace: "pre-line",
          color: "transparent",
          WebkitTextStroke: `2px #4488ff66`,
          transform: `translate(${offsetB}px, ${offsetB * 0.5}px) skewX(${-skew}deg)`,
          opacity: glitchActive ? 0.5 : 0,
        }}
      >
        {text}
      </div>
      {/* Main text */}
      <div
        style={{
          position: "relative",
          fontSize: size,
          lineHeight: 0.9,
          fontWeight: 900,
          letterSpacing: -6,
          whiteSpace: "pre-line",
          color: "rgba(255,255,255,0.95)",
          textShadow: `0 2px 24px rgba(0,0,0,0.9), 0 0 40px ${accent[0]}44, 0 0 80px ${accent[0]}22`,
          transform: `skewX(${skew * 0.3}deg)`,
        }}
      >
        {text}
      </div>
    </div>
  );
};

/* ─── TIMESTAMP DISPLAY ─── */

export const TimestampDisplay: FC<{ time: string; accent: AccentPair }> = ({ time, accent }) => {
  const frame = useCurrentFrame();
  const blink = Math.floor(frame / 15) % 2 === 0;
  const size = fitFontSize({ text: time, maxWidth: useSafeContentWidth() - 14 - 16, size: 36, weight: 700, family: monoStack, letterSpacing: 4 });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
      }}
    >
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: 999,
          background: accent[0],
          boxShadow: `0 0 20px ${accent[0]}`,
          opacity: blink ? 1 : 0.3,
        }}
      />
      <div
        style={{
          fontFamily: monoStack,
          fontSize: size,
          fontWeight: 700,
          letterSpacing: 4,
          color: accent[0],
          textShadow: `0 0 16px ${accent[0]}66`,
        }}
      >
        {time}
      </div>
    </div>
  );
};

/* ─── TERMINAL BLOCK ─── */

export const TerminalBlock: FC<{
  lines: readonly string[];
  accent: AccentPair;
  startFrame?: number;
}> = ({ lines, accent, startFrame = 0 }) => {
  const frame = useCurrentFrame();
  const charsPerFrame = 1.2;
  // Un comando o una URL no parte, y la consola pierde el sentido si cada linea tiene
  // un cuerpo distinto: se ajusta el bloque entero a la linea mas ancha.
  const size = Math.min(...lines.map((line) => fitFontSize({ text: line, maxWidth: 780 - 32 * 2, size: 28, weight: 500, family: monoStack })), 28);
  const cursorHeight = Math.round(24 * (size / 28));

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 780,
        margin: "0 auto",
        padding: "28px 32px",
        borderRadius: 20,
        border: `1px solid ${accent[0]}33`,
        background: "rgba(10,4,4,0.85)",
        backdropFilter: "blur(12px)",
        boxShadow: `0 0 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)`,
      }}
    >
      {lines.map((line, i) => {
        const lineStart = startFrame + i * 28;
        const elapsed = Math.max(0, frame - lineStart);
        const visibleChars = Math.min(line.length, Math.floor(elapsed * charsPerFrame));
        const showCursor = elapsed > 0 && visibleChars < line.length;
        const lineOpacity = elapsed > 0 ? 1 : 0;

        return (
          <div
            key={`term-${i}`}
            style={{
              fontFamily: monoStack,
              fontSize: size,
              lineHeight: 1.7,
              fontWeight: 500,
              color: i === lines.length - 1 ? accent[0] : "rgba(255,255,255,0.72)",
              opacity: lineOpacity,
              textShadow: i === lines.length - 1 ? `0 0 8px ${accent[0]}44` : "none",
            }}
          >
            {line.substring(0, visibleChars)}
            {showCursor && (
              <span
                style={{
                  display: "inline-block",
                  width: Math.round(12 * (size / 28)),
                  height: cursorHeight,
                  background: accent[0],
                  marginLeft: 2,
                  opacity: Math.floor(frame / 8) % 2 === 0 ? 1 : 0,
                  verticalAlign: "middle",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

/* ─── PHASE LABEL ─── */

export const PhaseLabel: FC<{ text: string; accent: string }> = ({ text, accent }) => {
  const frame = useCurrentFrame();
  const pulse = loop(frame, [0.85, 1.2, 0.85], 70);
  const size = fitFontSize({ text: text.toUpperCase(), maxWidth: useSafeContentWidth() - 12 - 16, size: 28, weight: 700, letterSpacing: 5 });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        letterSpacing: 5,
        textTransform: "uppercase",
        fontSize: size,
        fontWeight: 700,
        color: accent,
        textShadow: `0 0 12px ${accent}66`,
      }}
    >
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: 999,
          background: accent,
          boxShadow: `0 0 ${22 * pulse}px ${accent}`,
          transform: `scale(${pulse})`,
        }}
      />
      <span>{text}</span>
    </div>
  );
};

/* ─── NARRATIVE TEXT ─── */

export const NarrativeText: FC<{
  text: string;
  size?: number;
  maxWidth?: number;
  accent?: string;
}> = ({ text, size: requestedSize = 64, maxWidth = 700, accent = "rgba(255,255,255,0.92)" }) => {
  const width = Math.min(maxWidth, useSafeContentWidth());
  const size = fitFontSize({ text, maxWidth: width, size: requestedSize, weight: 700 });
  return (
  <div
    style={{
      maxWidth: width,
      margin: "0 auto",
      fontSize: size,
      lineHeight: 1.12,
      fontWeight: 700,
      textAlign: "center",
      whiteSpace: "pre-line",
      color: accent,
      textShadow: "0 2px 20px rgba(0,0,0,0.95), 0 0 40px rgba(0,0,0,0.7)",
    }}
  >
    {text}
  </div>
  );
};

/* ─── DETAIL TEXT ─── */

export const DetailText: FC<{
  text: string;
  size?: number;
  maxWidth?: number;
}> = ({ text, size: requestedSize = 36, maxWidth = 720 }) => {
  const width = Math.min(maxWidth, useSafeContentWidth());
  const size = fitFontSize({ text, maxWidth: width, size: requestedSize, weight: 500 });
  return (
  <div
    style={{
      maxWidth: width,
      margin: "0 auto",
      fontSize: size,
      lineHeight: 1.22,
      fontWeight: 500,
      textAlign: "center",
      color: "rgba(230,220,220,0.82)",
      textShadow: "0 2px 16px rgba(0,0,0,0.95)",
    }}
  >
    {text}
  </div>
  );
};

/* ─── INDICATOR CARD ─── */

export const IndicatorCard: FC<{
  accent: AccentPair;
  items: readonly string[];
}> = ({ accent, items }) => {
  const frame = useCurrentFrame();
  const sweep = interpolate((frame * 2) % 150, [0, 150], [-250, 1150], clamp);

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        width: "100%",
        maxWidth: 660,
        margin: "0 auto",
        padding: "24px 28px",
        borderRadius: 24,
        border: `1px solid ${accent[0]}30`,
        background: "linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 100%), rgba(10,4,4,0.7)",
        boxShadow: `0 20px 50px rgba(0,0,0,0.4), 0 0 30px ${accent[0]}14`,
        backdropFilter: "blur(16px)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          width: 180,
          background: `linear-gradient(90deg, transparent 0%, ${accent[0]}18 50%, transparent 100%)`,
          transform: `translateX(${sweep}px) skewX(-18deg)`,
          filter: "blur(6px)",
          opacity: 0.6,
        }}
      />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 14 }}>
        {items.map((item, i) => (
          <IndicatorRow key={item} text={item} accent={accent} index={i} />
        ))}
      </div>
    </div>
  );
};

const INDICATOR_TEXT_WIDTH = 660 - 28 * 2 - 10 - 16;

const IndicatorRow: FC<{ text: string; accent: AccentPair; index: number }> = ({ text, accent, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const size = fitFontSize({ text, maxWidth: INDICATOR_TEXT_WIDTH, size: 40, weight: 600 });
  const progress = revealSpring(frame - index * 8, fps, 26);
  const pulse = loop(frame + index * 12, [0.8, 1.25, 0.8], 80);
  const color = index === 0 ? accent[0] : accent[1];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        opacity: interpolate(progress, [0, 1], [0, 1], clamp),
        transform: `translateX(${interpolate(progress, [0, 1], [20, 0], clamp)}px)`,
      }}
    >
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: 999,
          background: color,
          boxShadow: `0 0 ${16 * pulse}px ${color}`,
          transform: `scale(${pulse})`,
          flexShrink: 0,
        }}
      />
      <div
        style={{
          fontSize: size,
          lineHeight: 1.1,
          fontWeight: 600,
          color: "rgba(255,248,248,0.92)",
          textShadow: "0 2px 12px rgba(0,0,0,0.9)",
        }}
      >
        {text}
      </div>
    </div>
  );
};

/* ─── ACTION LIST (for defense scene) ─── */

export const ActionList: FC<{
  items: readonly string[];
  accent: AccentPair;
}> = ({ items, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 740,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      {items.map((item, i) => {
        const delay = i * 14;
        const progress = revealSpring(frame - delay, fps, 28);
        const size = fitFontSize({ text: item, maxWidth: 740 - 24 * 2 - 36 - 20, size: 34, weight: 600 });
        return (
          <div
            key={item}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              padding: "16px 24px",
              borderRadius: 18,
              border: `1px solid ${accent[0]}22`,
              background: "rgba(255,255,255,0.04)",
              opacity: interpolate(progress, [0, 1], [0, 1], clamp),
              transform: `translateX(${interpolate(progress, [0, 1], [-30, 0], clamp)}px)`,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: `${accent[0]}22`,
                border: `1px solid ${accent[0]}44`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
                fontWeight: 800,
                color: accent[0],
                flexShrink: 0,
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </div>
            <div
              style={{
                fontSize: size,
                lineHeight: 1.15,
                fontWeight: 600,
                color: "rgba(255,252,252,0.92)",
                textShadow: "0 2px 12px rgba(0,0,0,0.9)",
              }}
            >
              {item}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ─── ACCENT BAR ─── */

export const AccentBar: FC<{ accent: AccentPair }> = ({ accent }) => {
  const frame = useCurrentFrame();
  const width = interpolate((frame * 1.8) % 100, [0, 50, 100], [160, 260, 160], clamp);

  return (
    <div
      style={{
        width,
        height: 5,
        borderRadius: 999,
        background: `linear-gradient(90deg, ${accent[1]} 0%, ${accent[0]} 100%)`,
        boxShadow: `0 0 20px ${accent[0]}55`,
      }}
    />
  );
};

/* ─── REVEAL ─── */

export const Reveal: FC<{
  children: ReactNode;
  y?: number;
  scaleFrom?: number;
  blurFrom?: number;
  durationInFrames?: number;
}> = ({ children, y = 30, scaleFrom = 0.96, blurFrom = 18, durationInFrames = 32 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = revealSpring(frame, fps, durationInFrames);

  return (
    <div
      style={{
        opacity: interpolate(progress, [0, 1], [0, 1], clamp),
        transform: `translateY(${interpolate(progress, [0, 1], [y, 0], clamp)}px) scale(${interpolate(progress, [0, 1], [scaleFrom, 1], clamp)})`,
        filter: `blur(${interpolate(progress, [0, 1], [blurFrom, 0], clamp)}px)`,
      }}
    >
      {children}
    </div>
  );
};

/* ─── BLOCK SEQUENCE ─── */

export const BlockSequence: FC<{
  from: number;
  durationInFrames: number;
  children: ReactNode;
}> = ({ from, durationInFrames, children }) => (
  // En escenas más cortas que el retardo del bloque la duración sale negativa; el bloque simplemente no llega a verse.
  <Sequence layout="none" from={from} durationInFrames={Math.max(1, durationInFrames)}>
    {children}
  </Sequence>
);

/* ─── LAYOUTS ─── */

const Row: FC<{ children?: ReactNode; gap?: number }> = ({ children, gap = 0 }) =>
  children != null ? (
    <div style={{ width: "100%", display: "flex", justifyContent: "center", alignItems: "center", marginBottom: gap }}>
      {children}
    </div>
  ) : null;

const ColLayout: FC<{ children: ReactNode; gap?: number; justify?: string }> = ({
  children,
  gap = 40,
  justify = "center",
}) => (
  <div
    style={{
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: justify,
      gap,
      padding: "60px 0",
      boxSizing: "border-box",
    }}
  >
    {children}
  </div>
);

export const AlertLayout: FC<{
  tag?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
}> = ({ tag, title, subtitle }) => (
  <ColLayout gap={0} justify="center">
    <Row gap={32}>{tag}</Row>
    <Row gap={60}>{title}</Row>
    <Row>{subtitle}</Row>
  </ColLayout>
);

export const ExplainLayout: FC<{
  tag?: ReactNode;
  terminal?: ReactNode;
  definition?: ReactNode;
  detail?: ReactNode;
}> = ({ tag, terminal, definition, detail }) => (
  <ColLayout gap={48}>
    <Row>{tag}</Row>
    <Row>{terminal}</Row>
    <Row>{definition}</Row>
    {detail && <Row>{detail}</Row>}
  </ColLayout>
);

export const PhaseLayout: FC<{
  phase?: ReactNode;
  timestamp?: ReactNode;
  title?: ReactNode;
  narrative?: ReactNode;
  detail?: ReactNode;
  indicator?: ReactNode;
}> = ({ phase, timestamp, title, narrative, detail, indicator }) => (
  <ColLayout gap={44}>
    {phase && <Row>{phase}</Row>}
    {timestamp && <Row>{timestamp}</Row>}
    {title && <Row>{title}</Row>}
    {narrative && <Row>{narrative}</Row>}
    {detail && <Row>{detail}</Row>}
    {indicator && <Row>{indicator}</Row>}
  </ColLayout>
);

export const DefenseLayout: FC<{
  tag?: ReactNode;
  title?: ReactNode;
  actions?: ReactNode;
}> = ({ tag, title, actions }) => (
  <ColLayout gap={48}>
    <Row>{tag}</Row>
    <Row>{title}</Row>
    <Row>{actions}</Row>
  </ColLayout>
);

export const CloseLayout: FC<{
  tag?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  bar?: ReactNode;
}> = ({ tag, title, subtitle, bar }) => (
  <ColLayout gap={0} justify="center">
    <Row gap={32}>{tag}</Row>
    <Row gap={56}>{title}</Row>
    <Row gap={32}>{subtitle}</Row>
    <Row>{bar}</Row>
  </ColLayout>
);

/* ─── YEAR BADGE (timeline) ─── */

export const YearBadge: FC<{ year: string; accent: AccentPair }> = ({ year, accent }) => {
  const frame = useCurrentFrame();
  const pulse = loop(frame, [1, 1.015, 1], 80);
  const size = fitFontSize({ text: year, maxWidth: useSafeContentWidth(), size: 148, weight: 900, family: monoStack, letterSpacing: -6 });

  return (
    <div style={{ position: "relative", textAlign: "center" }}>
      {/* Glow behind */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          fontFamily: monoStack,
          fontSize: size,
          fontWeight: 900,
          letterSpacing: -6,
          lineHeight: 1,
          color: accent[0],
          filter: "blur(22px)",
          opacity: 0.28,
          transform: `scale(${pulse})`,
        }}
      >
        {year}
      </div>
      {/* Outlined year */}
      <div
        style={{
          position: "relative",
          fontFamily: monoStack,
          fontSize: size,
          fontWeight: 900,
          letterSpacing: -6,
          lineHeight: 1,
          color: "transparent",
          WebkitTextStroke: `3px ${accent[0]}`,
          textShadow: `0 0 40px ${accent[0]}44`,
          transform: `scale(${pulse})`,
        }}
      >
        {year}
      </div>
    </div>
  );
};

/* ─── EVENT LAYOUT (timeline) ─── */

export const EventLayout: FC<{
  tag?: ReactNode;
  year?: ReactNode;
  headline?: ReactNode;
  impact?: ReactNode;
}> = ({ tag, year, headline, impact }) => (
  <ColLayout gap={0} justify="center">
    <Row gap={24}>{tag}</Row>
    <Row gap={28}>{year}</Row>
    <Row gap={36}>{headline}</Row>
    <Row>{impact}</Row>
  </ColLayout>
);
