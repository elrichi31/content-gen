"use client";

import { useSyncExternalStore } from "react";

// Preferencia por navegador: ver solo las imágenes, sin el mockup de Instagram o TikTok.
const KEY = "preview-clean";
const EVENT = "preview-clean-change";

function read() {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => { window.removeEventListener(EVENT, onChange); window.removeEventListener("storage", onChange); };
}

export function useCleanPreview() {
  const clean = useSyncExternalStore(subscribe, read, () => false);
  const setClean = (next: boolean) => {
    try { localStorage.setItem(KEY, next ? "1" : "0"); } catch { /* sin almacenamiento: no se recuerda */ }
    window.dispatchEvent(new Event(EVENT));
  };
  return [clean, setClean] as const;
}
