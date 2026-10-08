/**
 * Reloj de la preview de Canvas. Mientras una escena habla manda su voz: si el audio tarda en
 * arrancar (descarga, decodificación) la animación lo espera, en vez de adelantar el audio para
 * alcanzarla y saltarse sus primeras palabras. Sin voz, avanza con el reloj de pared.
 */

/** Lo que el reloj necesita de un `<audio>`. */
export type VoiceLike = { paused: boolean; currentTime: number; duration: number };
export type VoiceSlot = { voiceAt: number; audio: VoiceLike };

/** Más que esto esperando a que arranque una voz y se sigue sin ella (audio roto o bloqueado). */
export const VOICE_START_WAIT = 1.5;
/** Desfase a partir del cual el audio se recoloca: solo pasa cuando el usuario mueve la barra. */
export const VOICE_RESYNC = 0.5;

/** La voz que debería sonar en `t`, saltando las que fallaron. */
export function voiceAtTime(slots: readonly VoiceSlot[], t: number, failed: ReadonlySet<VoiceLike> = new Set()): VoiceSlot | null {
  return slots.find((slot) => !failed.has(slot.audio) && t >= slot.voiceAt && (Number.isNaN(slot.audio.duration) || t - slot.voiceAt < slot.audio.duration)) ?? null;
}

/**
 * Siguiente instante a partir de `t` tras `dt` segundos. `waited`: lo que ya se esperó a que la voz
 * arranque. `seek`: dónde recolocar el audio (arranque o salto), o `null` si va bien.
 */
export function nextPreviewTime(t: number, dt: number, slot: VoiceSlot | null, waited: number): { t: number; seek: number | null; wait: boolean; giveUp: boolean } {
  if (!slot) return { t: t + dt, seek: null, wait: false, giveUp: false };
  const local = t - slot.voiceAt;
  if (slot.audio.paused) {
    if (waited >= VOICE_START_WAIT) return { t: t + dt, seek: null, wait: false, giveUp: true };
    return { t, seek: waited === 0 ? local : null, wait: true, giveUp: false };
  }
  const voiced = slot.voiceAt + slot.audio.currentTime;
  if (Math.abs(voiced - t) > VOICE_RESYNC) return { t, seek: local, wait: false, giveUp: false };
  // Nunca hacia atrás: el audio puede reportar un instante algo anterior justo al arrancar.
  return { t: Math.max(t, voiced), seek: null, wait: false, giveUp: false };
}
