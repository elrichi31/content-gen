"use client"

import type { AdState } from "./types"

export function PainSolutionAd({ ad, w, h }: { ad: AdState; w: number; h: number }) {
  const s = w / 240
  const isLandscape = w > h

  if (isLandscape) {
    // Side by side for landscape
    return (
      <div className="flex h-full overflow-hidden" style={{ backgroundColor: ad.bgColor, color: ad.textColor }}>
        {/* Pain — left */}
        <div
          className="flex flex-1 flex-col items-center justify-center text-center"
          style={{ backgroundColor: "rgba(239,68,68,0.12)", padding: `${s * 12}px`, gap: s * 6 }}
        >
          <span style={{ fontSize: s * 26 }}>{ad.painEmoji}</span>
          <p className="font-bold leading-tight" style={{ fontSize: s * 10, color: "#ef4444" }}>
            {ad.painHeadline}
          </p>
          <p className="opacity-70 leading-snug" style={{ fontSize: s * 8 }}>
            {ad.painDesc}
          </p>
        </div>

        {/* Arrow divider */}
        <div
          className="flex items-center justify-center font-bold"
          style={{ width: s * 24, backgroundColor: ad.accentColor, color: "#fff", fontSize: s * 14 }}
        >
          →
        </div>

        {/* Solution — right */}
        <div
          className="flex flex-1 flex-col items-center justify-center text-center"
          style={{ backgroundColor: "rgba(34,197,94,0.10)", padding: `${s * 12}px`, gap: s * 6 }}
        >
          <span style={{ fontSize: s * 26 }}>{ad.solutionEmoji}</span>
          <p className="font-bold leading-tight" style={{ fontSize: s * 10, color: "#22c55e" }}>
            {ad.solutionHeadline}
          </p>
          <p className="opacity-70 leading-snug" style={{ fontSize: s * 8 }}>
            {ad.solutionDesc}
          </p>
        </div>
      </div>
    )
  }

  // Stacked for story / square
  return (
    <div className="flex h-full flex-col overflow-hidden" style={{ backgroundColor: ad.bgColor, color: ad.textColor }}>
      {/* Pain — top half */}
      <div
        className="flex flex-1 flex-col items-center justify-center text-center"
        style={{ backgroundColor: "rgba(239,68,68,0.12)", padding: `${s * 14}px ${s * 16}px`, gap: s * 6 }}
      >
        <span style={{ fontSize: s * 30 }}>{ad.painEmoji}</span>
        <p className="font-bold leading-tight" style={{ fontSize: s * 13, color: "#ef4444" }}>
          {ad.painHeadline}
        </p>
        <p className="opacity-70 leading-snug" style={{ fontSize: s * 10 }}>
          {ad.painDesc}
        </p>
      </div>

      {/* Arrow divider */}
      <div
        className="flex items-center justify-center font-black"
        style={{ height: s * 28, backgroundColor: ad.accentColor, color: "#fff", fontSize: s * 16 }}
      >
        ↓
      </div>

      {/* Solution — bottom half */}
      <div
        className="flex flex-1 flex-col items-center justify-center text-center"
        style={{ backgroundColor: "rgba(34,197,94,0.10)", padding: `${s * 14}px ${s * 16}px`, gap: s * 6 }}
      >
        <span style={{ fontSize: s * 30 }}>{ad.solutionEmoji}</span>
        <p className="font-bold leading-tight" style={{ fontSize: s * 13, color: "#22c55e" }}>
          {ad.solutionHeadline}
        </p>
        <p className="opacity-70 leading-snug" style={{ fontSize: s * 10 }}>
          {ad.solutionDesc}
        </p>
      </div>

      {/* CTA bar */}
      {ad.cta && (
        <div
          className="flex items-center justify-center font-bold"
          style={{
            height: s * 30,
            backgroundColor: ad.accentColor,
            color: "#fff",
            fontSize: s * 10,
          }}
        >
          {ad.cta}
        </div>
      )}
    </div>
  )
}
