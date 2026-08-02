"use client"

import type { AdState } from "./types"

export function PromoAd({ ad, w }: { ad: AdState; w: number; h: number }) {
  const s = w / 240

  return (
    <div
      className="relative flex h-full flex-col items-center justify-between overflow-hidden"
      style={{ backgroundColor: ad.bgColor, color: ad.textColor }}
    >
      {/* Top noise overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(ellipse at 50% -20%, ${ad.accentColor}55 0%, transparent 60%)`,
        }}
      />

      {/* Offer badge */}
      <div style={{ paddingTop: s * 20, position: "relative" }}>
        <div
          className="font-black tracking-wide text-center"
          style={{
            backgroundColor: ad.accentColor,
            color: "#fff",
            borderRadius: s * 6,
            padding: `${s * 4}px ${s * 14}px`,
            fontSize: s * 16,
            letterSpacing: "0.05em",
          }}
        >
          {ad.offerBadge}
        </div>
      </div>

      {/* Main content */}
      <div
        className="relative flex flex-col items-center text-center"
        style={{ padding: `${s * 6}px ${s * 16}px`, gap: s * 6 }}
      >
        <p className="font-bold leading-tight" style={{ fontSize: s * 14 }}>
          {ad.headline}
        </p>
        {ad.body && (
          <p className="opacity-70 leading-snug" style={{ fontSize: s * 10 }}>
            {ad.body}
          </p>
        )}
      </div>

      {/* Price */}
      <div className="relative flex flex-col items-center" style={{ gap: s * 4 }}>
        {ad.originalPrice && (
          <p
            className="line-through opacity-50"
            style={{ fontSize: s * 11 }}
          >
            {ad.originalPrice}
          </p>
        )}
        {ad.newPrice && (
          <p className="font-black" style={{ fontSize: s * 26, color: ad.accentColor }}>
            {ad.newPrice}
          </p>
        )}
        {ad.urgency && (
          <p
            className="font-semibold opacity-80"
            style={{
              fontSize: s * 9,
              backgroundColor: "rgba(255,255,255,0.08)",
              padding: `${s * 3}px ${s * 10}px`,
              borderRadius: s * 20,
            }}
          >
            ⏰ {ad.urgency}
          </p>
        )}
      </div>

      {/* CTA */}
      {ad.cta && (
        <div style={{ paddingBottom: s * 18, position: "relative" }}>
          <div
            className="font-bold text-center"
            style={{
              backgroundColor: ad.accentColor,
              color: "#fff",
              borderRadius: s * 20,
              padding: `${s * 7}px ${s * 22}px`,
              fontSize: s * 11,
            }}
          >
            {ad.cta}
          </div>
        </div>
      )}
    </div>
  )
}
