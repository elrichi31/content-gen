export const CONTENT_TYPE_LABEL: Record<string, string> = { carousel: "Carrusel", ad: "Anuncio", video: "Video", article: "Artículo" };

/**
 * El título vive dentro del documento y cambia por formato: video y artículo usan `title`, el
 * anuncio guarda su titular en `headline` y el carrusel su tema en `topic`. Sin ninguno queda el tipo de pieza.
 */
export function contentTitle(item: { type: string; document?: { data?: { title?: unknown; headline?: unknown; topic?: unknown } } }) {
  const data = item.document?.data;
  if (typeof data?.title === "string" && data.title.trim()) return data.title.trim();
  if (typeof data?.headline === "string" && data.headline.trim()) return data.headline.trim();
  if (typeof data?.topic === "string" && data.topic.trim()) return data.topic.trim();
  return CONTENT_TYPE_LABEL[item.type] ?? item.type;
}
