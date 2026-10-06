/**
 * A dónde vuelve el login. Solo rutas propias: un `from=//otro-sitio` sería una redirección abierta.
 * La autorización OAuth es una ruta de API y necesita navegación completa, no del router de Next.
 */
export function safeLoginReturn(value?: string | null) {
  // Barras invertidas y caracteres de control: algunos navegadores los normalizan a otra URL.
  if (!value || !value.startsWith("/") || value.startsWith("//") || [...value].some((char) => char === "\\" || char.charCodeAt(0) < 32)) return "/";
  const url = new URL(value, "https://local.invalid");
  return url.origin === "https://local.invalid" && !url.hash ? `${url.pathname}${url.search}` : "/";
}
