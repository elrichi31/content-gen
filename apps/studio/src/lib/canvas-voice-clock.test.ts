import assert from "node:assert/strict";
import { nextPreviewTime, VOICE_START_WAIT, voiceAtTime, type VoiceSlot } from "./canvas-voice-clock.ts";

const slot = (voiceAt: number, audio: Partial<VoiceSlot["audio"]> = {}): VoiceSlot => ({ voiceAt, audio: { paused: true, currentTime: 0, duration: 4, ...audio } });

// Sin voz, reloj de pared.
assert.deepEqual(nextPreviewTime(1, 0.016, null, 0), { t: 1.016, seek: null, wait: false, giveUp: false });

// La voz aún no arranca: la animación espera en su sitio y el audio se coloca una sola vez desde el principio.
const starting = slot(2);
assert.deepEqual(nextPreviewTime(2, 0.016, starting, 0), { t: 2, seek: 0, wait: true, giveUp: false });
assert.deepEqual(nextPreviewTime(2, 0.016, starting, 0.2), { t: 2, seek: null, wait: true, giveUp: false }, "no se recoloca en cada frame");
assert.equal(nextPreviewTime(2, 0.016, starting, VOICE_START_WAIT).giveUp, true, "una voz que no arranca no congela la preview");

// Sonando: manda el audio, aunque vaya algo por detrás del reloj (eso era lo que se comía el inicio).
const playing = slot(2, { paused: false, currentTime: 0.1 });
assert.equal(nextPreviewTime(2.3, 0.016, playing, 0).t, 2.3, "nunca retrocede");
assert.equal(nextPreviewTime(2.05, 0.016, playing, 0).t, 2.1);
assert.deepEqual(nextPreviewTime(3.5, 0.016, playing, 0), { t: 3.5, seek: 1.5, wait: false, giveUp: false }, "tras mover la barra el audio salta a su sitio");

// play() deja paused=false al instante: si el audio se queda cargando/atascado, también se le espera con límite.
const stalled = slot(2, { paused: false, currentTime: 0 });
assert.deepEqual(nextPreviewTime(2, 0.016, stalled, 0.5), { t: 2, seek: null, wait: true, giveUp: false });
assert.equal(nextPreviewTime(2, 0.016, stalled, VOICE_START_WAIT).giveUp, true, "un audio atascado no congela la preview");

// Al terminar, el redondeo deja el reloj justo antes del final: sigue en vez de rearrancar la voz en bucle.
assert.deepEqual(nextPreviewTime(5.99, 0.016, slot(2, { currentTime: 4 }), 0), { t: 6.006, seek: null, wait: false, giveUp: false });

// Qué voz toca en cada instante.
const slots = [slot(0.3), slot(5, { duration: Number.NaN })];
assert.equal(voiceAtTime(slots, 0.1), null, "antes de la primera voz");
assert.equal(voiceAtTime(slots, 1), slots[0]);
assert.equal(voiceAtTime(slots, 4.5), null, "entre voces");
assert.equal(voiceAtTime(slots, 9), slots[1], "duración aún desconocida");
assert.equal(voiceAtTime(slots, 1, new Set([slots[0].audio])), null, "una voz que falló se salta");

console.log("canvas voice clock ok");
