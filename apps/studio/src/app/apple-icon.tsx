import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Icono de iOS/Android: la misma chispa de `icon.svg`, a sangre (el sistema redondea las esquinas). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#389458" }}>
        <svg width="180" height="180" viewBox="0 0 32 32">
          <path fill="#fff" d="M14.5 6.5Q15.9 16.1 25.5 17.5Q15.9 18.9 14.5 28.5Q13.1 18.9 3.5 17.5Q13.1 16.1 14.5 6.5Z" />
          <path fill="#fff" fillOpacity=".85" d="M24 3.5Q24.5 7 28 7.5Q24.5 8 24 11.5Q23.5 8 20 7.5Q23.5 7 24 3.5Z" />
        </svg>
      </div>
    ),
    size,
  );
}
