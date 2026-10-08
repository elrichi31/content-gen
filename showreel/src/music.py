"""
Banda sonora del showreel, sintetizada desde cero con numpy (sin samples).

128 BPM -> 32 negras = 15.000 s exactos. Fa menor, progresión Fm - Db - Ab - Eb.
Estructura (compases de 4/4, 1.875 s cada uno):
  0-1  intro: pad que se abre, arpegio filtrado, riser
  2-5  drop: kick, clap, hats, bajo, supersaw con sidechain, arpegio
  6    build: redoble que acelera, riser, corte de medio tiempo
  7    impacto + acorde final con cola de reverb y campanas FM

Uso: python3 music.py salida.wav
"""
import sys
import wave

import numpy as np

SR = 48000
BPM = 128
BEAT = 60 / BPM
BAR = BEAT * 4
DUR = 15.0
N = int(SR * DUR)
rng = np.random.default_rng(7)


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def at(t):
    return int(round(t * SR))


def place(buf, sig, t, gain=1.0, pan=0.0):
    """Suma `sig` (mono o estéreo) en `buf` a partir del segundo `t`."""
    i = at(t)
    if i >= N:
        return
    if sig.ndim == 1:
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        sig = np.stack([sig * l * 1.414, sig * r * 1.414], axis=1)
    n = min(len(sig), N - i)
    buf[i:i + n] += sig[:n] * gain


def env_t(n):
    return np.arange(n) / SR


def saw(freq, n, phase0=None):
    """Sierra con PolyBLEP (sin aliasing audible). `freq` escalar o array."""
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    dt = f / SR
    ph = (np.cumsum(dt) + (rng.random() if phase0 is None else phase0)) % 1.0
    s = 2 * ph - 1
    m = ph < dt
    x = ph[m] / dt[m]
    s[m] -= x + x - x * x - 1
    m = ph > 1 - dt
    x = (ph[m] - 1) / dt[m]
    s[m] -= x * x + x + x + 1
    return s


def fft_filter(x, lo=None, hi=None):
    """Filtro estático en frecuencia (pasa altos `lo`, pasa bajos `hi`) con pendiente suave."""
    X = np.fft.rfft(x, axis=0)
    f = np.fft.rfftfreq(x.shape[0], 1 / SR)
    g = np.ones_like(f)
    if lo:
        g *= 1 / (1 + (lo / np.maximum(f, 1)) ** 4)
    if hi:
        g *= 1 / (1 + (f / hi) ** 4)
    if x.ndim == 2:
        g = g[:, None]
    return np.fft.irfft(X * g, n=x.shape[0], axis=0)


def svf(x, cutoff, q=0.7, mode="lp"):
    """State-variable filter (TPT) con corte variable en el tiempo. x estéreo (n, 2)."""
    n = x.shape[0]
    cutoff = np.broadcast_to(np.asarray(cutoff, dtype=float), (n,))
    g = np.tan(np.pi * np.clip(cutoff, 20, SR * 0.45) / SR)
    k = 1 / q
    a1 = 1 / (1 + g * (g + k))
    out = np.empty_like(x)
    ic1 = np.zeros(2)
    ic2 = np.zeros(2)
    for i in range(n):
        v3 = x[i] - ic2
        v1 = a1[i] * ic1 + g[i] * a1[i] * v3
        v2 = ic2 + g[i] * v1
        ic1 = 2 * v1 - ic1
        ic2 = 2 * v2 - ic2
        out[i] = v2 if mode == "lp" else (v1 if mode == "bp" else x[i] - k * v1 - v2)
    return out


def reverb(x, seconds=2.4, predelay=0.02, damp=5000, seed=3):
    """Convolución con una respuesta al impulso sintética (ruido decreciente, decorrelado L/R)."""
    r = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = env_t(n)
    ir = r.standard_normal((n, 2)) * np.exp(-t / (seconds / 6.9))[:, None]
    ir = fft_filter(ir, lo=200, hi=damp)
    # La cola se oscurece con el tiempo: mezcla con una versión más filtrada.
    dark = fft_filter(ir, hi=damp / 3)
    w = np.clip(t / seconds * 2, 0, 1)[:, None]
    ir = ir * (1 - w) + dark * w
    ir = np.concatenate([np.zeros((int(predelay * SR), 2)), ir])
    ir /= np.sqrt((ir ** 2).sum(axis=0))
    size = 1 << int(np.ceil(np.log2(x.shape[0] + ir.shape[0])))
    y = np.fft.irfft(np.fft.rfft(x, size, axis=0) * np.fft.rfft(ir, size, axis=0), size, axis=0)
    return y[: x.shape[0]]


def pingpong(x, delay, fb=0.45, taps=6):
    y = np.zeros_like(x)
    d = at(delay)
    for k in range(1, taps + 1):
        src = x[:, 0] + x[:, 1]
        sh = np.zeros(x.shape[0])
        sh[d * k:] = src[: x.shape[0] - d * k] * 0.5 * fb ** k
        y[:, k % 2] += sh
    return y


# ---------------------------------------------------------------- instrumentos

def kick():
    n = at(0.45)
    t = env_t(n)
    f = 44 + 120 * np.exp(-t / 0.028) + 40 * np.exp(-t / 0.006)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.22)
    click = fft_filter(rng.standard_normal(n) * np.exp(-t / 0.002), lo=1500) * 0.5
    return np.tanh((body + click) * 1.8) * 0.9


def clap():
    n = at(0.35)
    t = env_t(n)
    e = np.exp(-t / 0.12)
    for k, off in enumerate([0.0, 0.009, 0.018]):
        e = np.maximum(e, (t >= off) * np.exp(-(t - off) / 0.006) * (1.0 - k * 0.1))
    nz = fft_filter(rng.standard_normal(n), lo=900, hi=4500)
    body = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05) * 0.25
    return (nz * e * 0.6 + body)


def hat(decay=0.035):
    n = at(decay * 6)
    t = env_t(n)
    nz = fft_filter(rng.standard_normal(n), lo=7500)
    # Metal: seis cuadradas inarmónicas como en las cajas de ritmos clásicas.
    metal = sum(np.sign(np.sin(2 * np.pi * f * t)) for f in [205.3, 304.4, 369.6, 522.7, 540.0, 800.0])
    metal = fft_filter(metal, lo=7000)
    return (nz * 0.7 + metal * 0.12) * np.exp(-t / decay)


def pluck(m, dur=0.22, bright=1.0):
    n = at(dur)
    t = env_t(n)
    f = mtof(m)
    s = saw(f, n) * 0.6 + np.sign(np.sin(2 * np.pi * f * 2.0 * t + 0.3)) * 0.15
    # Filtro que se cierra rápido: equivalente barato con mezcla de armónicos decrecientes.
    s = s * np.exp(-t / (0.05 * bright)) + np.sin(2 * np.pi * f * t) * np.exp(-t / 0.12)
    return s * np.minimum(1, t / 0.002)


def bell(m, dur=2.5):
    n = at(dur)
    t = env_t(n)
    f = mtof(m)
    mod = np.sin(2 * np.pi * f * 3.5 * t) * 2.2 * np.exp(-t / 0.4)
    return np.sin(2 * np.pi * f * t + mod) * np.exp(-t / 0.9) * np.minimum(1, t / 0.001)


def supersaw(notes, n, voices=5, spread=0.18, width=0.8):
    out = np.zeros((n, 2))
    for m in notes:
        for v in range(voices):
            d = (v / (voices - 1) - 0.5) * 2 * spread if voices > 1 else 0
            pan = (v / (voices - 1) - 0.5) * 2 * width if voices > 1 else 0
            s = saw(mtof(m + d), n) / voices
            out[:, 0] += s * np.cos((pan + 1) * np.pi / 4)
            out[:, 1] += s * np.sin((pan + 1) * np.pi / 4)
    return out / max(1, len(notes)) * 1.6


# ---------------------------------------------------------------- arreglo

F, Db, Ab, Eb = 53, 49, 56, 51  # raíces (F3 = 53)
CHORDS = [
    [F, F + 3, F + 7],      # Fm
    [Db, Db + 4, Db + 7],   # Db
    [Ab, Ab + 4, Ab + 7],   # Ab
    [Eb, Eb + 4, Eb + 7],   # Eb
]


def chord_at(bar):
    return CHORDS[bar % 4]


def main(path):
    mix = np.zeros((N, 2))
    t_all = np.arange(N) / SR

    kicks = [b * BEAT for b in range(8, 24)]          # compases 2-5
    # Sidechain: cada kick hunde lo que no es percusión.
    duck = np.ones(N)
    for k in kicks:
        i = at(k)
        tt = np.arange(at(BEAT)) / SR
        seg = 1 - 0.85 * np.exp(-tt / 0.11)
        duck[i:i + len(seg)] = np.minimum(duck[i:i + len(seg)], seg)
    duck2 = duck[:, None]

    # ---- pad (todo el tema salvo el corte), se abre en la intro
    pad = np.zeros((N, 2))
    for bar in range(7):
        n = at(BAR) + at(0.3)
        tt = env_t(n)
        notes = chord_at(bar) + [chord_at(bar)[0] - 12]
        s = supersaw(notes, n, voices=4, spread=0.12) * np.minimum(1, tt / 0.25)[:, None]
        s *= np.clip((BAR + 0.3 - tt) / 0.3, 0, 1)[:, None]
        place(pad, s, bar * BAR)
    cut = np.interp(t_all, [0, 3.6, 3.75, 11.25, 12.9, 13.125], [250, 2600, 1800, 1800, 6000, 6000])
    pad = svf(pad, cut, q=0.9)
    pad[at(13.125 - BEAT / 2):] = 0
    mix += pad * 0.5 * np.where(t_all[:, None] < 3.75, 1, duck2)

    # ---- arpegio en semicorcheas
    arp = np.zeros((N, 2))
    pattern = [0, 1, 2, 3, 2, 1, 2, 3, 0, 2, 1, 3, 2, 1, 3, 2]
    for step in range(16 * 7):
        tt = step * BEAT / 4
        if 13.125 - BEAT / 2 <= tt:
            break
        bar = int(tt // BAR)
        c = chord_at(bar)
        tones = [c[0] + 12, c[1] + 12, c[2] + 12, c[0] + 24]
        m = tones[pattern[step % 16]]
        vel = 0.55 + 0.45 * (step % 4 == 0)
        bright = 0.35 + 0.65 * min(1, tt / 3.75)
        place(arp, pluck(m, bright=bright), tt, gain=vel, pan=0.35 * np.sin(step * 0.7))
    arp_wet = pingpong(arp, BEAT * 0.75, fb=0.4)
    mix += (arp * 0.32 + arp_wet * 0.22) * duck2

    # ---- supersaw: acordes en el drop con stabs rítmicos
    lead = np.zeros((N, 2))
    stab = [0, 0.75, 1.5, 2.5, 3.0, 3.5]  # en negras
    for bar in range(2, 6):
        for s0 in stab:
            n = at(BEAT * 0.55)
            tt = env_t(n)
            notes = [m + 12 for m in chord_at(bar)] + [chord_at(bar)[0]]
            s = supersaw(notes, n, voices=7, spread=0.2)
            s *= (np.minimum(1, tt / 0.004) * np.exp(-tt / 0.16))[:, None]
            place(lead, s, bar * BAR + s0 * BEAT)
    lead = svf(lead, np.interp(t_all, [3.75, 7.5, 11.25], [2200, 5200, 7000]), q=1.1)
    mix += lead * 0.8 * duck2

    # ---- bajo: corcheas a contratiempo + sub
    bass = np.zeros((N, 2))
    for bar in range(2, 6):
        root = chord_at(bar)[0] - 24
        for k in range(8):
            tt = bar * BAR + k * BEAT / 2
            n = at(BEAT / 2)
            e = env_t(n)
            m = root + (12 if k % 4 == 3 else 0)
            s = saw(mtof(m), n) * 0.7 + np.sin(2 * np.pi * mtof(m - 12) * e) * 0.45
            s *= np.minimum(1, e / 0.003) * np.clip((BEAT / 2 - e) / 0.01, 0, 1)
            place(bass, s, tt, gain=0.9 if k % 2 else 0.6)
    bass = svf(bass, np.interp(t_all % (BEAT / 2), [0, BEAT / 2], [1400, 250]), q=1.2)
    mix += bass * 0.42 * duck2

    # ---- batería
    drums = np.zeros((N, 2))
    for k in kicks:
        place(drums, kick(), k, gain=0.72)
    for b in range(8, 24):
        if b % 2 == 1:
            place(drums, clap(), b * BEAT, gain=0.7)
        place(drums, hat(0.09), b * BEAT + BEAT / 2, gain=0.45, pan=0.25)
        for s16 in (1, 3):
            place(drums, hat(0.02), b * BEAT + s16 * BEAT / 4, gain=0.18, pan=-0.3)
    # Hats tenues en la intro para dar pulso
    for b in range(4, 8):
        place(drums, hat(0.03), b * BEAT + BEAT / 2, gain=0.15, pan=0.2)
    # Redoble del build: corcheas -> semicorcheas -> fusas, sube volumen y tono
    roll_t = []
    t0 = 6 * BAR
    roll_t += [t0 + i * BEAT / 2 for i in range(4)]
    roll_t += [t0 + 2 * BEAT + i * BEAT / 4 for i in range(4)]
    roll_t += [t0 + 3 * BEAT + i * BEAT / 8 for i in range(4)]  # termina medio tiempo antes del impacto
    for i, tt in enumerate(roll_t):
        c = clap()
        place(drums, c, tt, gain=0.25 + 0.5 * i / len(roll_t))
    mix += drums

    # ---- risers (ruido con bandpass que sube) antes del drop y en el build
    def riser(t_start, t_end, peak=0.5):
        n = at(t_end - t_start)
        tt = env_t(n)
        x = rng.standard_normal((n, 2))
        cf = 300 * (40 ** (tt / tt[-1]))
        y = svf(x, cf, q=2.5, mode="bp")
        tone = saw(220 * 2 ** (tt / tt[-1] * 2), n) * 0.15
        y = y + tone[:, None]
        return y * ((tt / tt[-1]) ** 2 * peak)[:, None]

    fx = np.zeros((N, 2))
    place(fx, riser(BAR * 1, BAR * 2 - 0.02, 0.22), BAR * 1)
    place(fx, riser(BAR * 6, BAR * 7 - BEAT / 2, 0.3), BAR * 6)
    # downlifter tras el drop
    n = at(1.2)
    tt = env_t(n)
    down = svf(rng.standard_normal((n, 2)), 8000 * np.exp(-tt / 0.25) + 200, q=1.5, mode="bp")
    place(fx, down * np.exp(-tt / 0.4)[:, None], BAR * 2, gain=0.6)

    # ---- impacto final
    T = 7 * BAR
    n = at(DUR - T)
    tt = env_t(n)
    boom = np.sin(2 * np.pi * np.cumsum(32 + 60 * np.exp(-tt / 0.08)) / SR) * np.exp(-tt / 0.9)
    crack = fft_filter(rng.standard_normal(n), hi=3000) * np.exp(-tt / 0.15) * 0.7
    place(fx, np.tanh((boom * 1.4 + crack) * 1.3), T, gain=1.0)
    final = supersaw([F - 12, F - 5, F, F + 3, F + 7, F + 10, F + 14], n, voices=7, spread=0.22)
    final *= (np.minimum(1, tt / 0.01) * np.exp(-tt / 1.6))[:, None]
    final = svf(final, 7000 * np.exp(-tt / 0.9) + 600, q=0.8)
    place(fx, final, T, gain=0.65)
    for i, m in enumerate([F + 24, F + 27, F + 31, F + 34, F + 38, F + 36]):
        place(fx, bell(m), T + 0.12 + i * BEAT / 4, gain=0.22, pan=(i % 2) * 0.8 - 0.4)
    mix += fx

    # ---- bus de reverb compartido
    send = pad * 0.25 + arp * 0.35 + lead * 0.15 + fx * 0.35 + drums * 0.06
    mix += reverb(send, seconds=2.6) * 0.55

    # ---- master: limpia DC, soft clip, normaliza, fade de 40 ms al final
    mix = fft_filter(mix, lo=25)
    mix = np.tanh(mix * 0.8) / np.tanh(0.8)
    mix *= 0.89 / np.max(np.abs(mix))
    fade = np.clip((DUR - t_all) / 0.04, 0, 1)
    mix *= fade[:, None]

    pcm = (mix * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f"ok {path} {N / SR:.3f}s")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "music.wav")
