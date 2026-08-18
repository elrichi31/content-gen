export const CONTENT_TYPE_LABEL: Record<string, string> = { carousel: "Carrusel", ad: "Anuncio", video: "Video", article: "Artículo" };

/**
 * El título vive dentro del documento y cambia por formato: carrusel y video usan `title`,
 * el anuncio guarda su titular en `headline`. Sin ninguno de los dos queda el tipo de pieza.
 */
export function contentTitle(item: { type: string; document?: { data?: { title?: unknown; headline?: unknown } } }) {
  const data = item.document?.data;
  if (typeof data?.title === "string" && data.title.trim()) return data.title.trim();
  if (typeof data?.headline === "string" && data.headline.trim()) return data.headline.trim();
  return CONTENT_TYPE_LABEL[item.type] ?? item.type;
}
