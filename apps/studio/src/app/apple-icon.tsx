import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Icono de iOS/Android: la misma marca de `icon.svg`, a sangre (el sistema redondea las esquinas). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#389458" }}>
        <svg width="180" height="180" viewBox="0 0 32 32">
          <rect x="12" y="6" width="14" height="17" rx="3" fill="#fff" fillOpacity=".45" />
          <rect x="6" y="9" width="14" height="17" rx="3" fill="#fff" />
          <path d="M11 13.5v8l6.5-4z" fill="#389458" />
        </svg>
      </div>
    ),
    size,
  );
}
