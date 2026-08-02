"use client"

import type { AdState } from "./types"

export function ComparisonAd({ ad, w }: { ad: AdState; w: number; h: number }) {
  const s = w / 240 // scale factor relative to square reference

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden"
      style={{ backgroundColor: ad.bgColor, color: ad.textColor }}
    >
      {/* Top accent bar */}
      <div style={{ height: Math.max(2, s * 3), backgroundColor: ad.accentColor }} />

      {/* Headline */}
      <div style={{ padding: `${s * 10}px ${s * 14}px ${s * 6}px` }}>
        <p
          className="font-bold text-center leading-tight"
          style={{ fontSize: s * 13 }}
        >
          {ad.compHeadline}
        </p>
      </div>

      {/* Table */}
      <div
        className="flex flex-1 overflow-hidden"
        style={{ margin: `0 ${s * 10}px`, borderRadius: s * 8, fontSize: s * 10 }}
      >
        {/* Left — Competitor */}
        <div className="flex flex-1 flex-col" style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
          <div
            className="text-center font-semibold"
            style={{
              backgroundColor: "rgba(255,255,255,0.1)",
              padding: `${s * 5}px ${s * 4}px`,
              fontSize: s * 9,
            }}
          >
            {ad.leftLabel}
          </div>
          <div className="flex flex-1 flex-col justify-evenly" style={{ padding: `${s * 6}px ${s * 8}px` }}>
            {ad.leftItems.map((item, i) => (
              <div key={i} className="flex items-start gap-1">
                <span style={{ color: "#ef4444", fontSize: s * 11 }}>✗</span>
                <span className="opacity-75 leading-tight">{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: 1, backgroundColor: "rgba(255,255,255,0.1)" }} />

        {/* Right — Us */}
        <div className="flex flex-1 flex-col">
          <div
            className="text-center font-bold"
            style={{
              backgroundColor: ad.accentColor,
              padding: `${s * 5}px ${s * 4}px`,
              fontSize: s * 9,
            }}
          >
            {ad.rightLabel}
          </div>
          <div className="flex flex-1 flex-col justify-evenly" style={{ padding: `${s * 6}px ${s * 8}px` }}>
            {ad.rightItems.map((item, i) => (
              <div key={i} className="flex items-start gap-1">
                <span style={{ color: "#22c55e", fontSize: s * 11 }}>✓</span>
                <span className="font-semibold leading-tight">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      {ad.cta && (
        <div style={{ padding: `${s * 10}px ${s * 14}px` }} className="flex justify-center">
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
        </div>
      )}
    </div>
  )
}
