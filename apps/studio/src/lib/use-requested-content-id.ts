"use client";

import { useEffect, useState } from "react";

// Enlace profundo desde la biblioteca: /carousel|/ads|/video?id=<contentItemId>.
// Se lee de `window` en un efecto para no exigir un límite de Suspense alrededor de cada editor.
export function useRequestedContentId() {
  const [requestedId, setRequestedId] = useState("");
  useEffect(() => { setRequestedId(new URLSearchParams(window.location.search).get("id") ?? ""); }, []);
  return requestedId;
}
