"use client"

import type { AdState } from "./types"

export function TestimonialAd({ ad, w }: { ad: AdState; w: number; h: number }) {
  const s = w / 240

  return (
    <div
      className="relative flex h-full flex-col items-center justify-center overflow-hidden"
      style={{ backgroundColor: ad.bgColor, color: ad.textColor }}
    >
      {/* Top accent bar */}
      <div
        className="absolute top-0 left-0 right-0"
        style={{ height: s * 3, backgroundColor: ad.accentColor }}
      />

      {/* Decorative quote mark */}
      <div
        className="absolute font-black opacity-5 select-none pointer-events-none"
        style={{
          fontSize: s * 120,
          top: s * -10,
          left: s * 8,
          lineHeight: 1,
          color: ad.accentColor,
        }}
      >
        "
      </div>

      <div
        className="relative flex flex-col items-center text-center"
        style={{ padding: `${s * 24}px ${s * 20}px`, gap: s * 14 }}
      >
        {/* Stars */}
        <div style={{ fontSize: s * 14, color: "#fbbf24", letterSpacing: s * 2 }}>
          {"★".repeat(Math.min(5, Math.max(1, ad.stars)))}
        </div>

        {/* Quote */}
        <p
          className="font-medium leading-relaxed"
          style={{ fontSize: s * 11 }}
        >
          "{ad.quote}"
        </p>

        {/* Author */}
        <div className="flex flex-col items-center" style={{ gap: s * 3 }}>
          {/* Avatar initial */}
          <div
            className="flex items-center justify-center rounded-full font-bold"
            style={{
              width: s * 32,
              height: s * 32,
              backgroundColor: ad.accentColor,
              color: "#fff",
              fontSize: s * 13,
            }}
          >
            {ad.authorName.charAt(0).toUpperCase()}
          </div>
          <p className="font-bold" style={{ fontSize: s * 11 }}>
            {ad.authorName}
          </p>
          {ad.authorRole && (
            <p className="opacity-60" style={{ fontSize: s * 9 }}>
              {ad.authorRole}
            </p>
          )}
        </div>

        {/* CTA */}
        {ad.cta && (
          <div
            className="font-bold text-center"
            style={{
              backgroundColor: ad.accentColor,
              color: "#fff",
              borderRadius: s * 20,
              padding: `${s * 6}px ${s * 18}px`,
              fontSize: s * 10,
            }}
          >
            {ad.cta}
          </div>
        )}
      </div>
    </div>
  )
}
