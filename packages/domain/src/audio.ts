// Duración exacta de un MP3 recorriendo sus frames, sin ffprobe. Estimarla por tamaño
// (bytes * 8 / bitrate) falla con bitrate variable o cabeceras grandes, y una escena más
// corta que su narración corta la voz al final.

const BITRATES = {
  // MPEG-1 Layer III y MPEG-2/2.5 Layer III, en kbps.
  v1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  v2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const SAMPLE_RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] } as Record<number, number[]>;

/** Segundos de audio del MP3 o `null` si no se reconoce ningún frame (no es MP3 Layer III). */
export function mp3DurationSeconds(bytes: Uint8Array): number | null {
  let offset = 0;
  // ID3v2 al principio: 10 bytes de cabecera + tamaño «syncsafe».
  if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    offset = 10 + ((bytes[6] & 0x7f) << 21 | (bytes[7] & 0x7f) << 14 | (bytes[8] & 0x7f) << 7 | (bytes[9] & 0x7f)) + (bytes[5] & 0x10 ? 10 : 0);
  }
  let seconds = 0;
  let frames = 0;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) { offset += 1; continue; }
    const version = (bytes[offset + 1] >> 3) & 0x03; // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
    const layer = (bytes[offset + 1] >> 1) & 0x03; // 1 = Layer III
    const bitrateIndex = bytes[offset + 2] >> 4;
    const rateIndex = (bytes[offset + 2] >> 2) & 0x03;
    const padding = (bytes[offset + 2] >> 1) & 0x01;
    if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) { offset += 1; continue; }
    const sampleRate = SAMPLE_RATES[version][rateIndex];
    const bitrate = (version === 3 ? BITRATES.v1 : BITRATES.v2)[bitrateIndex] * 1000;
    const samples = version === 3 ? 1152 : 576;
    const length = Math.floor(samples / 8 * bitrate / sampleRate) + padding;
    if (length < 4) { offset += 1; continue; }
    seconds += samples / sampleRate;
    frames += 1;
    offset += length;
  }
  return frames ? seconds : null;
}
