"use client"

import type { AdState } from "./types"

export function FeatureAd({ ad, w }: { ad: AdState; w: number; h: number }) {
  const s = w / 240

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden"
      style={{ backgroundColor: ad.bgColor, color: ad.textColor }}
    >
      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(ellipse at 80% 100%, ${ad.accentColor}40 0%, transparent 55%)`,
        }}
      />

      {/* Header */}
      <div
        className="relative flex flex-col"
        style={{ padding: `${s * 18}px ${s * 16}px ${s * 10}px`, gap: s * 5 }}
      >
        <p className="font-black leading-tight" style={{ fontSize: s * 15, color: ad.accentColor }}>
          {ad.featHeadline}
        </p>
        {ad.featBody && (
          <p className="opacity-70 leading-snug" style={{ fontSize: s * 10 }}>
            {ad.featBody}
          </p>
        )}
      </div>

      {/* Feature grid */}
      <div
        className="relative grid grid-cols-2 flex-1"
        style={{ margin: `0 ${s * 12}px`, gap: s * 8 }}
      >
        {ad.features.map((f, i) => (
          <div
            key={i}
            className="flex flex-col items-center justify-center rounded-lg text-center"
            style={{
              backgroundColor: "rgba(255,255,255,0.06)",
              border: `${Math.max(1, s * 0.8)}px solid rgba(255,255,255,0.1)`,
              padding: `${s * 8}px ${s * 6}px`,
              gap: s * 4,
            }}
          >
            <span style={{ fontSize: s * 18 }}>{f.emoji}</span>
            <span className="font-semibold leading-tight" style={{ fontSize: s * 9 }}>
              {f.label}
            </span>
          </div>
        ))}
      </div>

      {/* CTA */}
      {ad.cta && (
        <div
          className="relative flex justify-center"
          style={{ padding: `${s * 12}px ${s * 16}px` }}
        >
          <div
            className="font-bold text-center"
            style={{
              backgroundColor: ad.accentColor,
              color: "#fff",
              borderRadius: s * 20,
              padding: `${s * 6}px ${s * 20}px`,
              fontSize: s * 10,
            }}
          >
            {ad.cta}
          </div>
        </div>
      )}
    </div>
  )
}
