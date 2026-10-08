/** Marca de Content Gen: dos piezas apiladas con un play. Mismos trazos que `app/icon.svg` y `app/apple-icon.tsx`. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <rect width="32" height="32" rx="8" fill="#389458" />
      <rect x="12" y="6" width="14" height="17" rx="3" fill="#fff" fillOpacity=".45" />
      <rect x="6" y="9" width="14" height="17" rx="3" fill="#fff" />
      <path d="M11 13.5v8l6.5-4z" fill="#389458" />
    </svg>
  );
}
