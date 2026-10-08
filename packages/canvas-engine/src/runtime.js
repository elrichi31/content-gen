/**
 * Runtime del motor Canvas. Corre dentro de la página (Chrome headless en el render, iframe en el
 * Studio) y pinta una `CanvasSpec` (packages/domain/src/canvas.ts) con Canvas 2D.
 *
 * Igual que el showreel (showreel/src/scene.html): cada frame es una función pura del tiempo.
 * No hay estado entre frames, así que el render se reparte por tramos entre varios navegadores y
 * cualquier frame se puede pintar suelto para revisarlo. Nada de partículas simuladas: todo lo que
 * se mueve sale de una fórmula cerrada de `t`.
 *
 * `buildCanvasHtml` inserta esta función en la página con `Function.prototype.toString`, así que
 * tiene que ser autocontenida: no puede usar nada de fuera de su propio cuerpo.
 */
export function canvasRuntime(spec, options) {
  const doc = options.canvas.ownerDocument;
  const W = spec.width, H = spec.height;
  const FPS = options.fps || 60;
  const SUB = Math.max(1, Math.round(options.subframes || 1));
  const SCALE = options.scale || 1;
  const SHUTTER = 0.5 / FPS; // obturador de 180°: la estela dura medio frame
  const [ACC, ACC2] = spec.palette;
  const C = { ink: "#07080d", ink2: "#10121a", white: "#ffffff", dim: "#3a3f4b" };
  const FD = '"Inter Display", Inter, "Segoe UI", Arial, sans-serif';
  const X0 = 90, X1 = W - 90, CX = W / 2;
  // Zonas de la pantalla vertical: arriba el título, al medio la animación y debajo los subtítulos.
  // Por debajo de ~1560 px va la interfaz de TikTok/Reels: ahí no se pinta nada importante.
  const STAGE_TOP = 560, STAGE_BOTTOM = 1300, CAPTION_Y = 1450;
  const TRANSITION = 0.5;

  /* ------------------------------------------------------------- utilidades */
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, u) => a + (b - a) * u;
  const P = (t, a, b) => clamp((t - a) / (b - a));
  const E = {
    outExpo: (u) => (u >= 1 ? 1 : 1 - Math.pow(2, -10 * u)),
    inOutExpo: (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u < 0.5 ? Math.pow(2, 20 * u - 10) / 2 : (2 - Math.pow(2, -20 * u + 10)) / 2),
    outCubic: (u) => 1 - Math.pow(1 - u, 3),
    inOutCubic: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
    outBack: (u, s = 1.70158) => 1 + (s + 1) * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2),
  };
  // Muelle amortiguado 0 → 1 con rebote; x en segundos desde el disparo.
  const spring = (x, w = 20, d = 9) => (x <= 0 ? 0 : 1 - Math.exp(-d * x) * Math.cos(w * x));
  function rng(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Valor pseudoaleatorio fijo para (a, b): la misma entrada da siempre el mismo número.
  const hash = (a, b = 0) => rng(Math.imul(a + 1, 73856093) ^ Math.imul(b + 1, 19349663))();
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const alpha = (hex, a) => `rgba(${rgb(hex).join(",")},${a})`;
  const mix = (a, b, u) => { const A = rgb(a), B = rgb(b); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], clamp(u)))).join(",")})`; };

  /** Número con separador de miles y coma decimal, como se lee en español. */
  function formatNumber(value, decimals) {
    const [int, dec] = Math.abs(value).toFixed(decimals).split(".");
    return (value < 0 ? "−" : "") + int.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (dec ? "," + dec : "");
  }

  /** Cifra corta para etiquetas: 950 mil, 1,2 M. `reference` decide la escala para que no cambie al contar. */
  function compactNumber(value, reference) {
    const decimals = (v) => (v < 10 && !Number.isInteger(v) ? 1 : 0);
    if (reference >= 1e9) return formatNumber(value / 1e9, 1).replace(/,0$/, "") + " mil M";
    if (reference >= 1e6) return formatNumber(value / 1e6, 1).replace(/,0$/, "") + " M";
    if (reference >= 1e4) return formatNumber(value / 1e3, 0) + " mil";
    return formatNumber(value, decimals(reference));
  }

  /* ------------------------------------------------------------- texto */
  const font = (weight, size) => `${weight} ${Math.round(size * 10) / 10}px ${FD}`;
  const widths = new Map();
  function measure(ctx, text, weight, size) {
    const key = weight + "|" + text;
    let base = widths.get(key);
    if (base === undefined) { ctx.font = font(weight, 100); base = ctx.measureText(text).width / 100; widths.set(key, base); }
    return base * size;
  }
  /** Parte `text` en líneas de ancho `max`; una palabra más ancha que la línea se queda sola. */
  function wrap(ctx, text, weight, size, max) {
    const lines = [];
    let line = "";
    for (const word of String(text).split(/\s+/).filter(Boolean)) {
      const next = line ? line + " " + word : word;
      if (line && measure(ctx, next, weight, size) > max) { lines.push(line); line = word; } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }
  /** Tamaño más grande (entre `min` y `max`) con el que el texto cabe en `maxLines` líneas de ancho `width`. */
  const fits = new Map();
  function fit(ctx, text, weight, width, maxLines, max, min) {
    const key = [text, weight, width, maxLines, max, min].join("|");
    const cached = fits.get(key);
    if (cached) return cached;
    let size = max, lines = wrap(ctx, text, weight, size, width);
    while (size > min && (lines.length > maxLines || lines.some((line) => measure(ctx, line, weight, size) > width))) {
      size = Math.max(min, size - 4);
      lines = wrap(ctx, text, weight, size, width);
    }
    const result = { size, lines };
    fits.set(key, result);
    return result;
  }
  function text(ctx, value, x, y, weight, size, color, align = "left", baseline = "alphabetic") {
    ctx.font = font(weight, size);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillText(value, x, y);
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  }
  /** Línea que entra desde abajo tras una máscara: el revelado tipográfico de todo el motor. */
  function maskedLine(ctx, value, x, y, weight, size, color, align, progress) {
    if (progress <= 0) return;
    const width = measure(ctx, value, weight, size);
    const left = align === "center" ? x - width / 2 : x;
    ctx.save();
    ctx.beginPath();
    ctx.rect(left - 20, y - size * 1.02, width + 40, size * 1.32);
    ctx.clip();
    text(ctx, value, x, y + (1 - E.outExpo(progress)) * size * 1.15, weight, size, color, align);
    ctx.restore();
  }

  /* ------------------------------------------------------------- fondo */
  // El fondo cambia tan despacio que dentro de un frame es fijo: se pinta una vez por frame y los
  // subframes del motion blur lo copian. Los degradados a pantalla completa son lo más caro del frame.
  let backdrop = null, backdropFrame = -1;
  function background(ctx, t) {
    const frame = Math.round(t * FPS);
    if (!backdrop) { backdrop = doc.createElement("canvas"); backdrop.width = Math.round(W * SCALE); backdrop.height = Math.round(H * SCALE); }
    if (frame !== backdropFrame) {
      const bctx = backdrop.getContext("2d");
      bctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
      paintBackground(bctx, frame / FPS);
      backdropFrame = frame;
    }
    ctx.drawImage(backdrop, 0, 0, W, H);
  }
  function paintBackground(ctx, t) {
    ctx.fillStyle = C.ink;
    ctx.fillRect(0, 0, W, H);
    // Dos manchas de luz del color de la paleta que derivan muy despacio: dan profundidad sin distraer.
    const blobs = [[0.18, 0.22, 0.95, ACC, 0.16], [0.86, 0.78, 0.8, ACC2, 0.08]];
    blobs.forEach(([bx, by, r, color, a], i) => {
      const x = W * (bx + 0.05 * Math.sin(t * 0.21 + i * 2.1)), y = H * (by + 0.03 * Math.cos(t * 0.17 + i));
      const g = ctx.createRadialGradient(x, y, 0, x, y, W * r);
      g.addColorStop(0, alpha(color, a));
      g.addColorStop(1, alpha(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    });
    // Retícula de puntos muy tenue, fija: ancla el espacio cuando la cámara tiembla.
    ctx.fillStyle = "rgba(255,255,255,0.045)";
    for (let y = 80; y < H; y += 80) for (let x = 60; x < W; x += 80) ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  }

  /* ------------------------------------------------------------- cabecera de escena */
  function header(ctx, scene, index, t) {
    const appear = scene.start + (index === 0 ? 0.1 : 0.12);
    const counter = String(index + 1).padStart(2, "0") + " / " + String(spec.scenes.length).padStart(2, "0");
    ctx.save();
    ctx.globalAlpha = E.outCubic(P(t, appear, appear + 0.4));
    ctx.letterSpacing = "6px";
    text(ctx, counter, X0, 236, 700, 30, ACC);
    ctx.letterSpacing = "0px";
    ctx.restore();
    if (!scene.title) return;
    const { size, lines } = fit(ctx, scene.title, 900, X1 - X0, 3, 88, 54);
    lines.forEach((line, i) => maskedLine(ctx, line, X0, 330 + i * size * 1.04, 900, size, C.white, "left", P(t, appear + 0.06 * i, appear + 0.06 * i + 0.7)));
    const bar = E.outExpo(P(t, appear + 0.25, appear + 1.0));
    ctx.fillStyle = ACC;
    ctx.fillRect(X0, 330 + (lines.length - 1) * size * 1.04 + 36, 120 * bar, 8);
  }

  /* ------------------------------------------------------------- plantillas */
  const T = {};

  // Gancho: palabras gigantes que golpean al decirse.
  T.hook = (ctx, plan, scene, t) => {
    const items = plan.words.map((word) => ({ ...word, ...fit(ctx, word.text.toUpperCase(), 900, X1 - X0, 1, 250, 90) }));
    const lineHeight = (item) => item.size * 0.98;
    let total = items.reduce((sum, item) => sum + lineHeight(item), 0) + 24 * (items.length - 1);
    const shrink = Math.min(1, 980 / total);
    total *= shrink;
    let y = 940 - total / 2;
    items.forEach((item, i) => {
      const size = item.size * shrink, h = lineHeight(item) * shrink;
      y += h;
      const k = t - item.at;
      const last = i === items.length - 1;
      if (k >= -0.02) {
        const s = 1 + 0.55 * (1 - E.outExpo(clamp(k / 0.32)));
        const label = item.text.toUpperCase();
        ctx.save();
        ctx.translate(CX, y - size * 0.36);
        ctx.scale(s, s);
        ctx.globalAlpha = clamp((k + 0.02) / 0.08);
        // La última palabra lleva una barra de color que barre por detrás: es la que remata.
        if (last) {
          const width = measure(ctx, label, 900, size) + 56;
          const sweep = E.outExpo(P(k, 0.08, 0.5));
          ctx.fillStyle = ACC;
          ctx.fillRect(-width / 2, -size * 0.5, width * sweep, size * 0.98);
        }
        text(ctx, label, 0, size * 0.36, 900, size, last ? C.ink : C.white, "center");
        ctx.restore();
        // Onda de choque al golpear.
        const ring = P(k, 0, 0.45);
        if (ring > 0 && ring < 1) {
          ctx.strokeStyle = alpha(ACC2, 0.5 * (1 - ring));
          ctx.lineWidth = 10 * (1 - ring) + 1;
          ctx.beginPath();
          ctx.arc(CX, y - size * 0.36, 120 + 520 * E.outCubic(ring), 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      y += 24 * shrink;
    });
  };

  // Flujo: emisores → (escudo) → destino, con paquetes viajando.
  T.flow = (ctx, plan, scene, t) => {
    const n = plan.sources.length;
    const slot = (X1 - X0) / n;
    const targetY = 1170, shieldY = 1000, sourceY = 700;
    const targetW = 400, targetH = 180;
    const rates = { calm: 2, busy: 5, flood: 13 };
    const travel = plan.rate === "flood" ? 0.95 : 1.25;
    const shieldOn = plan.shield ? E.outExpo(P(t, plan.shieldAt, plan.shieldAt + 0.55)) : 0;
    const down = plan.outcome === "overload" && t >= plan.outcomeAt;

    // Emisores: un grupo de nodos por fuente, que aparecen escalonados.
    const clusters = plan.sources.map((source, j) => {
      const cx = X0 + slot * (j + 0.5);
      const cols = Math.min(10, Math.ceil(Math.sqrt(source.count * 1.8)));
      const rows = Math.ceil(source.count / cols);
      const gap = Math.min(40, (slot - 50) / cols);
      const nodes = Array.from({ length: source.count }, (_, k) => ({
        x: cx + (k % cols - (cols - 1) / 2) * gap,
        y: sourceY + (Math.floor(k / cols) - (rows - 1) / 2) * gap,
      }));
      return { cx, nodes, gap, top: sourceY - rows * gap / 2, source };
    });
    const labelY = Math.min(...clusters.map((cluster) => cluster.top)) - 34;
    clusters.forEach((cluster, j) => {
      cluster.nodes.forEach((node, k) => {
        const s = spring(t - scene.start - 0.2 - j * 0.12 - k * 0.012);
        if (s <= 0) return;
        ctx.fillStyle = k % 7 === 3 ? ACC2 : C.white;
        ctx.beginPath();
        ctx.arc(node.x, node.y, Math.max(0, Math.min(10, cluster.gap * 0.32) * s), 0, Math.PI * 2);
        ctx.fill();
      });
      // La etiqueta va encima del grupo: debajo pasan los paquetes.
      const { size, lines } = fit(ctx, cluster.source.label, 700, slot - 30, 1, 46, 28);
      ctx.save();
      ctx.globalAlpha = E.outCubic(P(t, scene.start + 0.35 + j * 0.12, scene.start + 0.75 + j * 0.12));
      text(ctx, lines[0], cluster.cx, labelY, 700, size, "rgba(255,255,255,0.8)", "center");
      ctx.restore();
    });

    // Paquetes: el instante de salida de cada uno es una fórmula de su índice, así que el frame
    // `t` sabe qué paquetes están en vuelo sin simular nada. Antes del «surge» van tranquilos.
    const base = scene.start + 0.6;
    const r0 = plan.rate === "calm" ? 1.2 : 1.8;
    const r1 = rates[plan.rate] * (plan.sources.length > 1 ? 0.8 : 1);
    const blockShare = plan.outcome === "blocked" ? 0.85 : 0.5;
    const end = scene.start + scene.duration;
    let load = 0;
    const packets = [];
    clusters.forEach((cluster, j) => {
      const rate0 = r0 * Math.min(2, 0.6 + cluster.source.count / 8), rate1 = r1 * Math.min(2.4, 0.5 + cluster.source.count / 10);
      const phases = [[base, Math.max(base, plan.surgeAt), rate0, 0], [Math.max(base, plan.surgeAt), end, rate1, 100000]];
      for (const [from, to, rate, offset] of phases) {
        const kMin = Math.max(0, Math.floor((t - travel - 0.4 - from) * rate) - 1);
        const kMax = Math.floor((Math.min(t, to) - from) * rate) + 1;
        for (let k = kMin; k <= kMax; k++) {
          const at = from + (k + hash(j, k + offset) * 0.8) / rate;
          if (at < from || at >= to || at > t) continue;
          const seed = j * 7919 + k + offset;
          const node = cluster.nodes[Math.floor(hash(seed, 1) * cluster.nodes.length)];
          const dx = (hash(seed, 2) - 0.5) * (targetW - 60);
          // Tramo hasta el escudo y, si pasa, hasta el destino: velocidad constante en todo el recorrido.
          const x0 = node.x, y0 = node.y, x1 = CX + dx, y1 = targetY - targetH / 2;
          const u = (t - at) / travel;
          const atShield = at + travel * clamp((shieldY - y0) / (y1 - y0));
          const blocked = plan.shield && atShield >= plan.shieldAt + 0.25 && hash(seed, 3) < blockShare;
          if (blocked && t >= atShield) {
            const b = (t - atShield) / 0.35;
            if (b < 1) packets.push({ burst: b, x: lerp(x0, x1, clamp((shieldY - y0) / (y1 - y0))), y: shieldY });
            continue;
          }
          if (u >= 1) {
            if (u < 1 + 1 / travel) load += 1;
            if (down && u < 1.3) packets.push({ burst: (u - 1) / 0.3, x: x1, y: y1 });
            continue;
          }
          const e = E.inOutCubic(u);
          packets.push({ x: lerp(x0, x1, e) + Math.sin(u * Math.PI) * (x1 - x0) * -0.25, y: lerp(y0, y1, u), u, warm: at >= plan.surgeAt });
        }
      }
    });
    for (const p of packets) {
      if (p.burst !== undefined) {
        ctx.strokeStyle = alpha(ACC2, 0.9 * (1 - p.burst));
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8 + 34 * E.outCubic(p.burst), 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      ctx.fillStyle = p.warm ? ACC : C.white;
      ctx.globalAlpha = clamp(p.u * 8);
      roundRect(ctx, p.x - 10, p.y - 10, 20, 20, 5);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Escudo: una barra que se despliega desde el centro.
    if (plan.shield && shieldOn > 0) {
      const half = (X1 - X0 - 80) / 2 * shieldOn;
      const pulse = 0.5 + 0.5 * Math.cos((t - plan.shieldAt) * 9);
      ctx.fillStyle = ACC;
      roundRect(ctx, CX - half, shieldY - 10, half * 2, 20, 10);
      ctx.fill();
      ctx.strokeStyle = alpha(ACC, 0.25 + 0.2 * pulse);
      ctx.lineWidth = 3;
      roundRect(ctx, CX - half - 10, shieldY - 22, half * 2 + 20, 44, 22);
      ctx.stroke();
      ctx.save();
      ctx.globalAlpha = E.outCubic(P(t, plan.shieldAt + 0.2, plan.shieldAt + 0.6));
      ctx.letterSpacing = "4px";
      text(ctx, plan.shield.toUpperCase(), CX, shieldY - 42, 900, 38, ACC, "center");
      ctx.restore();
    }

    // Destino: un servidor que se calienta con la carga y, si cae, tiembla y se apaga.
    const appear = spring(t - scene.start - 0.3, 16, 8);
    const heat = clamp(load / (r1 * 1.4));
    const shake = down ? Math.sin(t * 61) * 9 * Math.exp(-(t - plan.outcomeAt) * 1.2) + Math.sin(t * 37) * 3 : 0;
    ctx.save();
    ctx.translate(CX + shake, targetY);
    ctx.scale(appear, appear);
    ctx.fillStyle = down ? C.ink2 : mix(C.ink2, ACC, heat * 0.35);
    roundRect(ctx, -targetW / 2, -targetH / 2, targetW, targetH, 24);
    ctx.fill();
    ctx.strokeStyle = down ? C.dim : mix("#ffffff", ACC, heat);
    ctx.lineWidth = 6;
    ctx.stroke();
    for (let r = 0; r < 3; r++) {
      const ry = -targetH / 2 + 34 + r * 41;
      ctx.fillStyle = down ? C.dim : "rgba(255,255,255,0.22)";
      roundRect(ctx, -targetW / 2 + 30, ry - 8, targetW - 110, 16, 8);
      ctx.fill();
      const blink = down ? 0 : hash(Math.floor(t * (6 + heat * 18)), r) > 0.4 ? 1 : 0.25;
      ctx.fillStyle = down ? C.dim : alpha(ACC, blink);
      ctx.beginPath();
      ctx.arc(targetW / 2 - 46, ry, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    const label = fit(ctx, plan.target, 700, 600, 1, 44, 30);
    ctx.save();
    ctx.globalAlpha = E.outCubic(P(t, scene.start + 0.5, scene.start + 0.9));
    text(ctx, label.lines[0], CX, targetY + targetH / 2 + 62, 700, label.size, "rgba(255,255,255,0.85)", "center");
    ctx.restore();

    // Desenlace.
    const k = t - plan.outcomeAt;
    if (k >= 0) {
      const s = spring(k, 18, 7);
      ctx.save();
      ctx.translate(CX + targetW / 2 + 20, targetY - targetH / 2 - 10);
      ctx.scale(s, s);
      if (down) {
        ctx.fillStyle = ACC;
        ctx.beginPath();
        ctx.moveTo(0, -52); ctx.lineTo(50, 36); ctx.lineTo(-50, 36); ctx.closePath();
        ctx.fill();
        text(ctx, "!", 0, 28, 900, 64, C.ink, "center");
      } else {
        ctx.fillStyle = ACC;
        ctx.beginPath();
        ctx.arc(0, 0, 44, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 9;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        checkPath(ctx, 0, 0, 44, P(k, 0.05, 0.4));
      }
      ctx.restore();
    }
  };

  /** Trazo de un check dentro de un círculo de radio r, dibujado hasta `progress`. */
  function checkPath(ctx, x, y, r, progress) {
    if (progress <= 0) return;
    const pts = [[-0.42, 0.02], [-0.12, 0.32], [0.45, -0.3]].map(([a, b]) => [x + a * r, y + b * r]);
    const l1 = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]), l2 = Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]);
    const d = progress * (l1 + l2);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    if (d <= l1) ctx.lineTo(lerp(pts[0][0], pts[1][0], d / l1), lerp(pts[0][1], pts[1][1], d / l1));
    else { ctx.lineTo(pts[1][0], pts[1][1]); ctx.lineTo(lerp(pts[1][0], pts[2][0], (d - l1) / l2), lerp(pts[1][1], pts[2][1], (d - l1) / l2)); }
    ctx.stroke();
  }
  function crossPath(ctx, x, y, r, progress) {
    const a = clamp(progress * 2), b = clamp(progress * 2 - 1), k = r * 0.36;
    ctx.beginPath();
    if (a > 0) { ctx.moveTo(x - k, y - k); ctx.lineTo(x - k + 2 * k * a, y - k + 2 * k * a); }
    if (b > 0) { ctx.moveTo(x + k, y - k); ctx.lineTo(x + k - 2 * k * b, y - k + 2 * k * b); }
    ctx.stroke();
  }

  // Pasos: una línea de tiempo vertical que se enciende al nombrar cada paso.
  T.steps = (ctx, plan, scene, t) => {
    const n = plan.items.length;
    const gap = Math.min(220, (STAGE_BOTTOM - STAGE_TOP - 60) / (n - 1 || 1));
    const top = (STAGE_TOP + STAGE_BOTTOM) / 2 - gap * (n - 1) / 2;
    const cx = X0 + 56, r = 46;
    // Riel de fondo y riel de progreso que avanza de paso en paso.
    ctx.lineCap = "round";
    ctx.strokeStyle = C.dim;
    ctx.lineWidth = 6;
    const rail = E.outCubic(P(t, scene.start + 0.15, scene.start + 0.75));
    ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx, top + gap * (n - 1) * rail); ctx.stroke();
    let reach = 0;
    plan.items.forEach((item, i) => { if (i > 0) reach += E.inOutCubic(P(t, plan.items[i - 1].at + 0.1, item.at + 0.05)); });
    ctx.strokeStyle = ACC;
    ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx, top + gap * reach); ctx.stroke();
    const current = plan.items.reduce((found, item, i) => (t >= item.at ? i : found), -1);
    plan.items.forEach((item, i) => {
      const y = top + gap * i;
      const k = t - item.at;
      const on = k >= 0;
      const intro = E.outCubic(P(t, scene.start + 0.2 + i * 0.08, scene.start + 0.6 + i * 0.08));
      const s = on ? 1 + 0.25 * (1 - spring(k, 22, 8)) * Math.exp(-k * 3) : intro;
      ctx.save();
      ctx.translate(cx, y);
      ctx.scale(s, s);
      ctx.fillStyle = on ? ACC : C.ink;
      ctx.strokeStyle = on ? ACC : C.dim;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      text(ctx, String(i + 1), 0, 2, 900, 44, on ? C.ink : "rgba(255,255,255,0.45)", "center", "middle");
      ctx.restore();
      if (on && k < 0.6) {
        const ring = k / 0.6;
        ctx.strokeStyle = alpha(ACC, 0.6 * (1 - ring));
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(cx, y, r + 50 * E.outCubic(ring), 0, Math.PI * 2); ctx.stroke();
      }
      const { size, lines } = fit(ctx, item.label, 700, X1 - cx - r - 44, 2, 58, 38);
      const slide = on ? E.outExpo(clamp(k / 0.5)) : 0;
      const color = i === current ? C.white : on ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.26)";
      ctx.save();
      ctx.globalAlpha = intro;
      const lx = cx + r + 44 + (1 - slide) * (on ? 30 : 0);
      const first = y + size * 0.36 - (lines.length - 1) * size * 0.55;
      lines.forEach((line, li) => text(ctx, line, lx, first + li * size * 1.1, 700, size, color));
      ctx.restore();
    });
  };

  // Comparación: dos barras que crecen hasta su valor.
  T.compare = (ctx, plan, scene, t) => {
    const baseY = 1230, maxH = 560, barW = 230;
    const max = Math.max(plan.left.value, plan.right.value) || 1;
    const sides = [[plan.left, CX - 210, plan.at], [plan.right, CX + 210, plan.at + 0.35]];
    const bigger = plan.right.value >= plan.left.value ? 1 : 0;
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 4;
    const axis = E.outExpo(P(t, scene.start + 0.15, scene.start + 0.8));
    ctx.beginPath(); ctx.moveTo(CX - 460 * axis, baseY); ctx.lineTo(CX + 460 * axis, baseY); ctx.stroke();
    sides.forEach(([side, x, at], i) => {
      const grow = E.outExpo(P(t, at, at + 1.2));
      const h = Math.max(6, maxH * (side.value / max)) * grow;
      ctx.fillStyle = i === bigger ? ACC : "rgba(255,255,255,0.85)";
      roundRect(ctx, x - barW / 2, baseY - h, barW, h, 18);
      ctx.fill();
      const value = compactNumber(side.value * grow, side.value) + (side.unit ? " " + side.unit : "");
      const label = fit(ctx, value, 900, barW + 160, 1, 74, 36);
      ctx.save();
      ctx.globalAlpha = clamp((t - at) / 0.2);
      text(ctx, label.lines[0], x, baseY - h - 30, 900, label.size, i === bigger ? ACC : C.white, "center");
      ctx.restore();
      const name = fit(ctx, side.label, 700, barW + 150, 2, 44, 30);
      ctx.save();
      ctx.globalAlpha = E.outCubic(P(t, scene.start + 0.3 + i * 0.1, scene.start + 0.7 + i * 0.1));
      name.lines.forEach((line, li) => text(ctx, line, x, baseY + 64 + li * name.size * 1.1, 700, name.size, "rgba(255,255,255,0.8)", "center"));
      ctx.restore();
    });
    // Si la diferencia es grande, se remata con el «×N».
    const low = Math.min(plan.left.value, plan.right.value);
    const ratio = low > 0 ? max / low : 0;
    const k = t - (plan.at + 1.5);
    if (ratio >= 1.5 && k >= 0) {
      const s = spring(k, 18, 7);
      const label = "×" + formatNumber(ratio, ratio < 10 ? 1 : 0).replace(/,0$/, "");
      // Encima de la barra pequeña, que es donde sobra sitio.
      const [small, sx] = bigger ? [plan.left, CX - 210] : [plan.right, CX + 210];
      ctx.save();
      ctx.translate(sx, baseY - Math.max(6, maxH * (small.value / max)) - 230);
      ctx.scale(s, s);
      const w = measure(ctx, label, 900, 64) + 60;
      ctx.fillStyle = ACC;
      roundRect(ctx, -w / 2, -48, w, 96, 48);
      ctx.fill();
      text(ctx, label, 0, 4, 900, 64, C.ink, "center", "middle");
      ctx.restore();
    }
  };

  // Cifra que cuenta hasta su valor.
  T.stat = (ctx, plan, scene, t) => {
    const k = t - plan.at;
    const count = E.outExpo(clamp(k / 1.5));
    const final = formatNumber(plan.value, plan.decimals);
    const unitSize = (size) => size * 0.42;
    // El tamaño se fija con la cifra final para que no salte mientras cuenta.
    const probe = fit(ctx, final + (plan.unit ? " " + plan.unit : ""), 900, X1 - X0, 1, 300, 110);
    const size = probe.size;
    const number = formatNumber(plan.value * count, plan.decimals);
    const numberW = measure(ctx, final, 900, size);
    const unitW = plan.unit ? measure(ctx, plan.unit, 900, unitSize(size)) + 20 : 0;
    const left = CX - (numberW + unitW) / 2;
    const y = 930;
    ctx.save();
    ctx.globalAlpha = clamp((k + 0.25) / 0.25);
    text(ctx, number, left + numberW, y, 900, size, C.white, "right");
    if (plan.unit) text(ctx, plan.unit, left + numberW + 20, y, 900, unitSize(size), ACC, "left");
    ctx.restore();
    // Regla de marcas bajo la cifra: se llena al ritmo del conteo.
    const ticks = 36, tw = (X1 - X0) / ticks;
    for (let i = 0; i < ticks; i++) {
      const on = i / ticks < count;
      ctx.fillStyle = on ? ACC : C.dim;
      const h = i % 6 === 0 ? 46 : 26;
      ctx.globalAlpha = E.outCubic(P(t, scene.start + 0.1 + i * 0.01, scene.start + 0.4 + i * 0.01));
      ctx.fillRect(X0 + i * tw + tw / 2 - 3, y + 70, 6, h);
    }
    ctx.globalAlpha = 1;
    const label = fit(ctx, plan.label, 700, X1 - X0, 2, 56, 36);
    label.lines.forEach((line, i) => maskedLine(ctx, line, CX, y + 210 + i * label.size * 1.12, 700, label.size, "rgba(255,255,255,0.85)", "center", P(t, plan.at + 0.3 + i * 0.08, plan.at + 1 + i * 0.08)));
  };

  // Lista con marcas que aparecen al nombrar cada punto.
  T.list = (ctx, plan, scene, t) => {
    const n = plan.items.length;
    const gap = Math.min(190, (STAGE_BOTTOM - STAGE_TOP) / n);
    const top = (STAGE_TOP + STAGE_BOTTOM) / 2 - gap * (n - 1) / 2;
    const cx = X0 + 44, r = 40;
    plan.items.forEach((item, i) => {
      const y = top + gap * i;
      const k = t - item.at;
      if (k < -0.05) return;
      const s = spring(k + 0.05, 20, 8);
      ctx.save();
      ctx.translate(cx, y);
      ctx.scale(s, s);
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      if (plan.icon === "check") {
        ctx.fillStyle = ACC; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = C.ink; ctx.lineWidth = 9; checkPath(ctx, 0, 0, r, P(k, 0.1, 0.45));
      } else if (plan.icon === "cross") {
        ctx.strokeStyle = ACC; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 9; crossPath(ctx, 0, 0, r, P(k, 0.1, 0.45));
      } else {
        ctx.fillStyle = ACC; ctx.beginPath(); ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      const { size, lines } = fit(ctx, item.text, 700, X1 - cx - r - 40, 2, 56, 36);
      const slide = E.outExpo(clamp((k + 0.05) / 0.55));
      ctx.save();
      ctx.globalAlpha = slide;
      const first = y + size * 0.36 - (lines.length - 1) * size * 0.55;
      lines.forEach((line, li) => text(ctx, line, cx + r + 40 - (1 - slide) * 40, first + li * size * 1.1, 700, size, C.white));
      ctx.restore();
    });
  };

  // Línea de tiempo horizontal: la cámara avanza de hito en hito al nombrarlos.
  T.timeline = (ctx, plan, scene, t) => {
    const n = plan.events.length;
    const gap = 470, lineY = 930, anchor = CX - 110;
    // `focus` es el hito centrado (fraccionario mientras la cámara viaja al siguiente).
    let focus = 0;
    plan.events.forEach((event, i) => { if (i > 0) focus += E.inOutCubic(P(t, event.at - 0.4, event.at + 0.2)); });
    const xOf = (i) => anchor + (i - focus) * gap;
    const intro = E.outExpo(P(t, scene.start + 0.1, scene.start + 0.9));
    const from = xOf(0) - 260, to = xOf(n - 1) + 900;
    ctx.lineCap = "round";
    ctx.strokeStyle = C.dim;
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(from, lineY); ctx.lineTo(lerp(from, to, intro), lineY); ctx.stroke();
    // Riel encendido hasta el último hito dicho, que avanza con la cámara.
    let reach = -1;
    plan.events.forEach((event, i) => { reach = Math.max(reach, i - 1 + E.outCubic(P(t, event.at - 0.25, event.at + 0.15))); });
    if (reach > -1) {
      ctx.strokeStyle = ACC;
      ctx.beginPath(); ctx.moveTo(from, lineY); ctx.lineTo(xOf(Math.max(0, reach)), lineY); ctx.stroke();
    }
    // Marcas menores entre hitos: dan sensación de recorrido cuando la cámara se mueve.
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    for (let i = -1; i < n + 2; i++) for (let m = 1; m < 5; m++) {
      const x = xOf(i) + (m / 5) * gap;
      if (x > from && x < lerp(from, to, intro)) ctx.fillRect(x - 2, lineY - 12, 4, 24);
    }
    plan.events.forEach((event, i) => {
      const x = xOf(i);
      if (x < -400 || x > W + 400) return;
      const k = t - event.at;
      const on = k >= 0;
      const near = clamp(1 - Math.abs(i - focus) * 0.55, 0.35, 1);
      const appear = E.outCubic(P(t, scene.start + 0.3 + i * 0.1, scene.start + 0.8 + i * 0.1));
      // Punto del hito: anillo apagado que se llena al decirlo, con onda.
      const s = on ? 1 + 0.4 * Math.exp(-k * 5) * Math.cos(k * 18) : appear;
      ctx.save();
      ctx.translate(x, lineY);
      ctx.scale(s, s);
      ctx.fillStyle = on ? ACC : C.ink;
      ctx.strokeStyle = on ? ACC : C.dim;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
      if (on && k < 0.7) {
        const ring = k / 0.7;
        ctx.strokeStyle = alpha(ACC, 0.6 * (1 - ring));
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(x, lineY, 24 + 70 * E.outCubic(ring), 0, Math.PI * 2); ctx.stroke();
      }
      // Fecha encima (se ve tenue antes de decirse: anticipa lo que viene) y texto debajo.
      const date = fit(ctx, event.date, 900, 420, 1, 120, 60);
      const pop = on ? E.outBack(clamp(k / 0.35), 2) : 0;
      ctx.save();
      ctx.globalAlpha = appear * (on ? near : 0.22);
      ctx.translate(x, lineY - 70);
      ctx.scale(lerp(0.85, 1, on ? pop : 1), lerp(0.85, 1, on ? pop : 1));
      text(ctx, date.lines[0], 0, 0, 900, date.size, on ? ACC : C.white, "center");
      ctx.restore();
      ctx.fillStyle = on ? alpha(ACC, near) : C.dim;
      ctx.fillRect(x - 3, lineY - 56, 6, 26 * appear);
      const label = fit(ctx, event.label, 700, 400, 3, 52, 34);
      ctx.save();
      ctx.globalAlpha = near;
      label.lines.forEach((line, li) => maskedLine(ctx, line, x, lineY + 100 + li * label.size * 1.12, 700, label.size, C.white, "center", on ? P(k, li * 0.07, li * 0.07 + 0.6) : 0));
      ctx.restore();
    });
  };

  // Antes / después: pantalla partida; el «después» entra al decir el cue y el «antes» se apaga.
  T.split = (ctx, plan, scene, t) => {
    const gapX = 28;
    const colW = (X1 - X0 - gapX) / 2;
    // Alto de la tarjeta según su contenido (la más alta manda) y centrada en el escenario.
    const heights = [plan.before, plan.after].map((side) => {
      const head = fit(ctx, side.label.toUpperCase(), 900, colW - 50, 2, 46, 28);
      return 150 + (head.lines.length - 1) * head.size * 1.08 + side.items.reduce((sum, item) => { const body = fit(ctx, item, 700, colW - 130, 3, 44, 30); return sum + body.lines.length * body.size * 1.12 + 44; }, 0) + 30;
    });
    const cardH = Math.max(420, ...heights);
    const top = Math.max(STAGE_TOP + 20, (STAGE_TOP + STAGE_BOTTOM) / 2 - cardH / 2), bottom = top + cardH;
    const sides = [[plan.before, X0, scene.start + 0.25, false], [plan.after, X0 + colW + gapX, plan.at, true]];
    const dimBefore = 1 - 0.5 * E.outCubic(P(t, plan.at + 0.2, plan.at + 0.8));
    sides.forEach(([side, x, at, good]) => {
      const k = t - at;
      if (k < 0) return;
      const open = E.outExpo(clamp(k / 0.7));
      ctx.save();
      ctx.globalAlpha = good ? 1 : dimBefore;
      // La tarjeta se despliega desde arriba.
      ctx.beginPath(); ctx.rect(x - 10, top - 10, colW + 20, (bottom - top + 20) * open); ctx.clip();
      ctx.fillStyle = good ? alpha(ACC, 0.14) : "rgba(255,255,255,0.05)";
      ctx.strokeStyle = good ? ACC : C.dim;
      ctx.lineWidth = good ? 5 : 3;
      roundRect(ctx, x, top, colW, bottom - top, 28);
      ctx.fill(); ctx.stroke();
      const head = fit(ctx, side.label.toUpperCase(), 900, colW - 50, 2, 46, 28);
      head.lines.forEach((line, li) => text(ctx, line, x + colW / 2, top + 76 + li * head.size * 1.08, 900, head.size, good ? ACC : "rgba(255,255,255,0.7)", "center"));
      const headBottom = top + 76 + (head.lines.length - 1) * head.size * 1.08 + 34;
      ctx.fillStyle = good ? ACC : C.dim;
      ctx.fillRect(x + 40, headBottom, colW - 80, 3);
      let y = headBottom + 70;
      side.items.forEach((item, i) => {
        const ki = k - 0.35 - i * 0.18;
        const body = fit(ctx, item, 700, colW - 130, 3, 44, 30);
        const s = spring(ki, 20, 8);
        if (ki > 0) {
          ctx.save();
          ctx.translate(x + 50, y - body.size * 0.36);
          ctx.scale(s, s);
          ctx.lineCap = "round"; ctx.lineJoin = "round";
          if (good) {
            ctx.fillStyle = ACC; ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = C.ink; ctx.lineWidth = 6; checkPath(ctx, 0, 0, 24, P(ki, 0.1, 0.4));
          } else {
            ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.stroke();
            ctx.lineWidth = 6; crossPath(ctx, 0, 0, 24, P(ki, 0.1, 0.4));
          }
          ctx.restore();
          const slide = E.outExpo(clamp(ki / 0.5));
          ctx.save();
          ctx.globalAlpha *= slide;
          body.lines.forEach((line, li) => text(ctx, line, x + 92 - (1 - slide) * 24, y + li * body.size * 1.12, 700, body.size, good ? C.white : "rgba(255,255,255,0.75)"));
          ctx.restore();
        }
        y += body.lines.length * body.size * 1.12 + 44;
      });
      ctx.restore();
    });
    // Flecha entre las dos mitades al entrar el «después».
    const k = t - plan.at;
    if (k > 0) {
      const s = spring(k - 0.15, 18, 7);
      ctx.save();
      ctx.translate(CX, (top + bottom) / 2);
      ctx.scale(s, s);
      ctx.fillStyle = ACC;
      ctx.beginPath(); ctx.arc(0, 0, 42, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.ink; ctx.lineWidth = 8; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(16, 0); ctx.moveTo(4, -13); ctx.lineTo(17, 0); ctx.lineTo(4, 13); ctx.stroke();
      ctx.restore();
    }
  };

  // Gráfica: una línea que se traza o barras que crecen, con el valor encima y el máximo resaltado.
  T.chart = (ctx, plan, scene, t) => {
    const left = X0 + 10, right = X1 - 10, top = 700, base = 1230;
    const n = plan.points.length;
    const values = plan.points.map((point) => point.value);
    const max = Math.max(...values) || 1;
    const peak = values.indexOf(max);
    const slot = (right - left) / n;
    const xOf = (i) => left + slot * (i + 0.5);
    const yOf = (value) => base - (value / (max * 1.08)) * (base - top);
    // Rejilla: tres líneas tenues que se dibujan al entrar.
    const grid = E.outExpo(P(t, scene.start + 0.15, scene.start + 0.9));
    for (let g = 1; g <= 3; g++) {
      const y = base - (base - top) * g / 3;
      ctx.fillStyle = "rgba(255,255,255,0.09)";
      for (let x = left; x < lerp(left, right, grid); x += 28) ctx.fillRect(x, y - 1.5, 14, 3);
    }
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(left, base - 2, (right - left) * grid, 4);
    if (plan.unit) {
      ctx.save();
      ctx.globalAlpha = grid;
      ctx.letterSpacing = "4px";
      text(ctx, plan.unit.toUpperCase(), left, top - 50, 700, 32, ACC);
      ctx.restore();
    }
    // El trazo (o las barras) acompaña a la narración: llega al último valor poco antes de que acabe la voz.
    const drawEnd = clamp(scene.voiceEnd - 0.4, plan.at + 0.5 + 0.35 * n, plan.at + 6);
    const reachAt = (i) => plan.at + (drawEnd - plan.at) * i / (n - 1);
    const valueLabel = (i, value, final, x, y, highlight) => {
      const label = fit(ctx, compactNumber(value, final), 900, slot + 30, 1, highlight ? 56 : 40, 24);
      text(ctx, label.lines[0], x, y, 900, label.size, highlight ? ACC : "rgba(255,255,255,0.85)", "center");
    };
    if (plan.kind === "bar") {
      const barW = Math.min(150, slot * 0.62);
      plan.points.forEach((point, i) => {
        const at = reachAt(i);
        const grow = E.outExpo(P(t, at, at + 1));
        const h = Math.max(4, base - yOf(point.value)) * grow;
        ctx.fillStyle = i === peak ? ACC : "rgba(255,255,255,0.82)";
        roundRect(ctx, xOf(i) - barW / 2, base - h, barW, h, 14);
        ctx.fill();
        if (t >= at) {
          ctx.save();
          ctx.globalAlpha = clamp((t - at) / 0.2);
          valueLabel(i, point.value * grow, point.value, xOf(i), base - h - 22, i === peak);
          ctx.restore();
        }
      });
    } else {
      // Avance del trazo en «puntos recorridos» (0 a n-1): cada tramo con su easing, así se posa en cada valor.
      const u = (n - 1) * P(t, plan.at, drawEnd);
      const head = Math.min(n - 1, Math.floor(u) + E.inOutCubic(u - Math.floor(u)));
      const pts = plan.points.map((point, i) => [xOf(i), yOf(point.value)]);
      const along = (u) => { const i = Math.min(n - 2, Math.floor(u)), f = u - i; return [lerp(pts[i][0], pts[i + 1][0], f), lerp(pts[i][1], pts[i + 1][1], f)]; };
      if (t >= plan.at) {
        const [hx, hy] = along(head);
        const path = () => { ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i <= Math.floor(head); i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.lineTo(hx, hy); };
        // Área bajo la línea.
        const area = ctx.createLinearGradient(0, top, 0, base);
        area.addColorStop(0, alpha(ACC, 0.32));
        area.addColorStop(1, alpha(ACC, 0));
        ctx.fillStyle = area;
        ctx.beginPath(); path(); ctx.lineTo(hx, base); ctx.lineTo(pts[0][0], base); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = ACC;
        ctx.lineWidth = 9;
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.beginPath(); path(); ctx.stroke();
        plan.points.forEach((point, i) => {
          const k = (t - reachAt(i)) / 0.25;
          if (k < 0) return;
          const s = spring(k * 0.25, 20, 8);
          ctx.fillStyle = i === peak ? ACC : C.white;
          ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], 13 * s, 0, Math.PI * 2); ctx.fill();
          ctx.save();
          ctx.globalAlpha = clamp(k);
          valueLabel(i, point.value, point.value, pts[i][0], pts[i][1] - 36, i === peak);
          ctx.restore();
        });
        // Cabeza del trazo con halo mientras dibuja.
        if (head < n - 1) {
          const glow = ctx.createRadialGradient(hx, hy, 0, hx, hy, 60);
          glow.addColorStop(0, alpha(ACC2, 0.7));
          glow.addColorStop(1, alpha(ACC2, 0));
          ctx.fillStyle = glow;
          ctx.beginPath(); ctx.arc(hx, hy, 60, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    plan.points.forEach((point, i) => {
      const label = fit(ctx, point.label, 700, slot - 8, 1, 36, 22);
      ctx.save();
      ctx.globalAlpha = E.outCubic(P(t, scene.start + 0.3 + i * 0.05, scene.start + 0.7 + i * 0.05));
      text(ctx, label.lines[0], xOf(i), base + 56, 700, label.size, i === peak ? ACC : "rgba(255,255,255,0.7)", "center");
      ctx.restore();
    });
  };

  // Red de nodos: se encienden y se conectan al nombrarlos, desde un centro o en cadena.
  T.network = (ctx, plan, scene, t) => {
    const n = plan.nodes.length;
    const cy = 950, rx = 320, ry = 280;
    const hub = plan.shape === "hub";
    // Con número par se gira medio paso para que ningún nodo quede pegado al título o a los subtítulos.
    const turn = n % 2 ? 0 : Math.PI / n;
    const pos = plan.nodes.map((_, i) => {
      const a = -Math.PI / 2 + turn + (i / n) * Math.PI * 2;
      return [CX + Math.cos(a) * rx, cy + Math.sin(a) * ry];
    });
    const intro = E.outCubic(P(t, scene.start + 0.1, scene.start + 0.8));
    // Malla de fondo: puntos tenues que derivan despacio, solo textura.
    ctx.save();
    ctx.globalAlpha = intro * 0.5;
    const mesh = Array.from({ length: 22 }, (_, i) => [X0 + hash(i, 11) * (X1 - X0) + Math.sin(t * 0.4 + i) * 14, 600 + hash(i, 12) * 700 + Math.cos(t * 0.33 + i * 1.3) * 14]);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 2;
    mesh.forEach(([x, y], i) => mesh.forEach(([x2, y2], j) => { if (j > i && Math.hypot(x2 - x, y2 - y) < 230) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke(); } }));
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    mesh.forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); });
    ctx.restore();
    // Cada conexión va de su origen (el centro o el nodo anterior) al nodo, y se traza justo antes del cue.
    const origin = (i) => (hub ? [CX, cy] : i > 0 ? pos[i - 1] : null);
    const draw = (i) => E.inOutCubic(P(t, plan.nodes[i].at - 0.35, plan.nodes[i].at));
    ctx.lineCap = "round";
    plan.nodes.forEach((node, i) => {
      const o = origin(i);
      const d = draw(i);
      if (!o || d <= 0) return;
      const [x, y] = pos[i];
      ctx.strokeStyle = alpha(ACC, 0.75);
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(lerp(o[0], x, d), lerp(o[1], y, d)); ctx.stroke();
      // Pulsos que viajan por la conexión ya hecha: posición = fórmula de t, sin simular.
      if (d >= 1) for (let p = 0; p < 2; p++) {
        const u = ((t - node.at) * 0.7 + p * 0.5 + hash(i, 5)) % 1;
        ctx.fillStyle = ACC2;
        ctx.beginPath(); ctx.arc(lerp(o[0], x, u), lerp(o[1], y, u), 7, 0, Math.PI * 2); ctx.fill();
      }
    });
    if (hub) {
      const s = spring(t - scene.start - 0.2, 16, 8);
      const label = plan.center ? fit(ctx, plan.center.toUpperCase(), 900, 300, 1, 44, 26) : null;
      const w = label ? measure(ctx, label.lines[0], 900, label.size) + 70 : 120;
      const pulse = 0.5 + 0.5 * Math.sin(t * 3);
      ctx.save();
      ctx.translate(CX, cy);
      ctx.scale(s, s);
      ctx.strokeStyle = alpha(ACC, 0.2 + 0.2 * pulse);
      ctx.lineWidth = 4;
      roundRect(ctx, -w / 2 - 14, -60 - 14, w + 28, 120 + 28, 74);
      ctx.stroke();
      ctx.fillStyle = ACC;
      roundRect(ctx, -w / 2, -60, w, 120, 60);
      ctx.fill();
      if (label) text(ctx, label.lines[0], 0, 3, 900, label.size, C.ink, "center", "middle");
      ctx.restore();
    }
    plan.nodes.forEach((node, i) => {
      const k = t - node.at;
      const [x, y] = pos[i];
      // Antes de nombrarse el nodo es un anillo tenue: se intuye la red que va a formarse.
      if (k < 0) {
        ctx.strokeStyle = alpha("#ffffff", 0.18 * intro);
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI * 2); ctx.stroke();
        return;
      }
      const s = spring(k, 20, 8);
      if (k < 0.6) {
        const ring = k / 0.6;
        ctx.strokeStyle = alpha(ACC, 0.6 * (1 - ring));
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(x, y, 34 + 70 * E.outCubic(ring), 0, Math.PI * 2); ctx.stroke();
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.fillStyle = C.ink;
      ctx.strokeStyle = ACC;
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = ACC;
      ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      const label = fit(ctx, node.label, 700, 300, 2, 44, 28);
      const above = y < cy - 20;
      const first = above ? y - 62 - (label.lines.length - 1) * label.size * 1.08 : y + 34 + 28 + label.size * 0.8;
      ctx.save();
      ctx.globalAlpha = E.outCubic(clamp(k / 0.4));
      label.lines.forEach((line, li) => text(ctx, line, x, first + li * label.size * 1.08, 700, label.size, C.white, "center"));
      ctx.restore();
    });
  };

  // Cierre: la frase final palabra a palabra y una llamada a la acción.
  T.outro = (ctx, plan, scene, t) => {
    const { size, lines } = fit(ctx, plan.line, 900, X1 - X0, 4, 124, 64);
    const top = 900 - (lines.length - 1) * size * 0.55;
    lines.forEach((line, i) => maskedLine(ctx, line, CX, top + i * size * 1.06, 900, size, C.white, "center", P(t, plan.at + i * 0.12, plan.at + i * 0.12 + 0.75)));
    const bar = E.outExpo(P(t, plan.at + 0.4, plan.at + 1.1));
    ctx.fillStyle = ACC;
    ctx.fillRect(CX - 70 * bar, top - size - 30, 140 * bar, 10);
    if (plan.cta) {
      const k = t - plan.at - 0.9;
      if (k > 0) {
        const s = spring(k, 18, 7);
        const pill = fit(ctx, plan.cta, 700, 760, 1, 46, 30);
        const w = measure(ctx, pill.lines[0], 700, pill.size) + 80;
        ctx.save();
        ctx.translate(CX, top + (lines.length - 1) * size * 1.06 + 150);
        ctx.scale(s, s);
        ctx.fillStyle = ACC;
        roundRect(ctx, -w / 2, -48, w, 96, 48);
        ctx.fill();
        text(ctx, pill.lines[0], 0, 3, 700, pill.size, C.ink, "center", "middle");
        ctx.restore();
      }
    }
  };

  // Respaldo: el título de la escena en grande.
  T.title = (ctx, plan, scene, t) => {
    const value = scene.title || spec.title;
    const { size, lines } = fit(ctx, value, 900, X1 - X0, 4, 140, 70);
    const top = 930 - (lines.length - 1) * size * 0.55;
    lines.forEach((line, i) => maskedLine(ctx, line, CX, top + i * size * 1.04, 900, size, C.white, "center", P(t, plan.at + i * 0.1, plan.at + i * 0.1 + 0.75)));
    const bar = E.outExpo(P(t, plan.at + 0.3, plan.at + 1.1));
    ctx.fillStyle = ACC;
    ctx.fillRect(CX - 80 * bar, top + (lines.length - 1) * size * 1.04 + 60, 160 * bar, 10);
  };

  const FULLSCREEN = new Set(["hook", "outro", "title"]);
  /* ------------------------------------------------------------- imagen de la escena */
  // Fotos de las escenas (videos con imágenes): llegan ya decodificadas con `setImage(id, imagen)`.
  const images = new Map();
  // Igual que el fondo: dentro de un frame el zoom apenas cambia, así que la foto escalada y su velo se
  // pintan una vez por frame (con margen para el temblor) y los subframes la copian 1:1.
  const MARGIN = 60;
  const photoCache = new Map();
  function sceneImage(ctx, scene, t) {
    const image = scene.image ? images.get(scene.image) : null;
    if (!image || !image.width || !image.height) return;
    const frame = Math.round(t * FPS);
    let cached = photoCache.get(scene.id);
    if (!cached) {
      const c = doc.createElement("canvas");
      c.width = Math.round((W + 2 * MARGIN) * SCALE);
      c.height = Math.round((H + 2 * MARGIN) * SCALE);
      cached = { canvas: c, frame: -1 };
      photoCache.set(scene.id, cached);
    }
    if (cached.frame !== frame) {
      const pctx = cached.canvas.getContext("2d");
      pctx.setTransform(SCALE, 0, 0, SCALE, MARGIN * SCALE, MARGIN * SCALE);
      paintPhoto(pctx, image, scene, frame / FPS);
      cached.frame = frame;
    }
    ctx.drawImage(cached.canvas, -MARGIN, -MARGIN, W + 2 * MARGIN, H + 2 * MARGIN);
  }
  function paintPhoto(ctx, image, scene, t) {
    const iw = image.width, ih = image.height;
    // Cover a pantalla completa (con el margen) y un zoom lento (Ken Burns) a lo largo de la escena.
    const zoom = lerp(1.04, 1.14, E.inOutCubic(P(t, scene.start - TRANSITION, scene.start + scene.duration)));
    const cover = Math.max((W + 2 * MARGIN) / iw, (H + 2 * MARGIN) / ih) * zoom;
    const dw = iw * cover, dh = ih * cover;
    ctx.drawImage(image, CX - dw / 2, H / 2 - dh / 2, dw, dh);
    // Velo oscuro: arriba para el título, más fuerte abajo para los subtítulos. El texto siempre se lee.
    const shade = ctx.createLinearGradient(0, 0, 0, H);
    shade.addColorStop(0, "rgba(7,8,13,0.72)");
    shade.addColorStop(0.3, "rgba(7,8,13,0.5)");
    shade.addColorStop(0.6, "rgba(7,8,13,0.62)");
    shade.addColorStop(1, "rgba(7,8,13,0.9)");
    ctx.fillStyle = shade;
    ctx.fillRect(-MARGIN, -MARGIN, W + 2 * MARGIN, H + 2 * MARGIN);
  }

  function sceneContent(ctx, index, t, offset = 0) {
    const scene = spec.scenes[index];
    sceneImage(ctx, scene, t);
    if (offset) ctx.translate(0, offset);
    if (!FULLSCREEN.has(scene.plan.template)) header(ctx, scene, index, t);
    (T[scene.plan.template] || T.title)(ctx, scene.plan, scene, t);
  }

  /* ------------------------------------------------------------- transición entre escenas */
  // Una cortina inclinada sube y deja ver la escena nueva, con dos franjas de la paleta en el borde.
  function wipeEdge(p) { return lerp(H + 260, -260, E.inOutExpo(p)); }
  function clipBelow(ctx, y, below) {
    const tilt = Math.tan(-7 * Math.PI / 180) * W / 2;
    ctx.beginPath();
    ctx.moveTo(-100, y - tilt);
    ctx.lineTo(W + 100, y + tilt);
    if (below) { ctx.lineTo(W + 100, H + 400); ctx.lineTo(-100, H + 400); } else { ctx.lineTo(W + 100, -400); ctx.lineTo(-100, -400); }
    ctx.closePath();
  }

  /** Temblor de cámara determinista: lo disparan los golpes del gancho. */
  function cameraShake(t) {
    let x = 0, y = 0;
    for (const scene of spec.scenes) {
      if (scene.plan.template !== "hook") continue;
      scene.plan.words.forEach((word, i) => {
        const k = t - word.at;
        if (k < 0 || k > 0.4) return;
        const amp = 16 * Math.exp(-k / 0.07);
        x += amp * Math.sin(k * 90 + i * 1.7);
        y += amp * Math.cos(k * 77 + i * 2.3);
      });
    }
    return [x, y];
  }

  function sceneIndexAt(t) {
    let index = 0;
    spec.scenes.forEach((scene, i) => { if (t >= scene.start) index = i; });
    return index;
  }

  /* ------------------------------------------------------------- subtítulos */
  const chunks = spec.scenes.flatMap((scene) => scene.captions);
  function captions(ctx, t) {
    const chunk = chunks.find((item) => t >= item.s && t < item.e);
    if (!chunk) return;
    const words = chunk.words.map((word) => ({ ...word, label: word.w.toUpperCase() }));
    const sentence = words.map((word) => word.label).join(" ");
    const size = fit(ctx, sentence, 900, X1 - X0 - 40, 1, 78, 46).size;
    const space = measure(ctx, " ", 900, size) * 1.1;
    const boxes = [];
    let x = 0;
    for (const word of words) { const w = measure(ctx, word.label, 900, size); boxes.push({ x, w }); x += w + space; }
    const total = x - space;
    const k = t - chunk.s;
    const pop = E.outBack(clamp(k / 0.2), 2.2);
    let current = 0;
    words.forEach((word, i) => { if (t >= word.s) current = i; });
    ctx.save();
    ctx.translate(CX, CAPTION_Y);
    ctx.scale(lerp(0.82, 1, pop), lerp(0.82, 1, pop));
    ctx.globalAlpha = clamp(k / 0.08);
    // La pastilla de la palabra actual se desliza desde la anterior en vez de saltar.
    const slide = E.outCubic(clamp((t - words[current].s) / 0.1));
    const from = boxes[Math.max(0, current - 1)], to = boxes[current];
    const px = lerp(current ? from.x : to.x, to.x, slide), pw = lerp(current ? from.w : to.w, to.w, slide);
    ctx.fillStyle = ACC;
    roundRect(ctx, -total / 2 + px - 18, -size * 0.62, pw + 36, size * 1.24, 18);
    ctx.fill();
    ctx.font = font(900, size);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    words.forEach((word, i) => {
      const bx = -total / 2 + boxes[i].x;
      if (i !== current) {
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.lineWidth = 12;
        ctx.strokeText(word.label, bx, size * 0.04);
      }
      ctx.fillStyle = i === current ? C.ink : t >= word.s ? C.white : "rgba(255,255,255,0.6)";
      ctx.fillText(word.label, bx, size * 0.04);
    });
    ctx.restore();
  }

  /* ------------------------------------------------------------- frame completo */
  function drawFrame(ctx, t) {
    background(ctx, t);
    const [sx, sy] = cameraShake(t);
    ctx.save();
    ctx.translate(sx, sy);
    const index = sceneIndexAt(t);
    // La transición se centra en el corte: empieza en el silencio final de la escena anterior.
    const next = spec.scenes[index + 1];
    const into = index > 0 ? t - (spec.scenes[index].start - TRANSITION * 0.6) : Infinity;
    const out = next ? t - (next.start - TRANSITION * 0.6) : -Infinity;
    const pair = into < TRANSITION ? [index - 1, index, into / TRANSITION] : out >= 0 ? [index, index + 1, out / TRANSITION] : null;
    if (pair) {
      const [a, b, p] = pair;
      const y = wipeEdge(p);
      ctx.save(); clipBelow(ctx, y, false); ctx.clip(); sceneContent(ctx, a, t); ctx.restore();
      ctx.save(); clipBelow(ctx, y, true); ctx.clip();
      background(ctx, t);
      sceneContent(ctx, b, t, (1 - E.outExpo(p)) * 140);
      ctx.restore();
      const tilt = Math.tan(-7 * Math.PI / 180) * W / 2;
      [[ACC, 0, 34], [ACC2, 34, 12]].forEach(([color, offset, thickness]) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(-100, y - tilt + offset); ctx.lineTo(W + 100, y + tilt + offset);
        ctx.lineTo(W + 100, y + tilt + offset + thickness); ctx.lineTo(-100, y - tilt + offset + thickness);
        ctx.closePath();
        ctx.fill();
      });
    } else sceneContent(ctx, index, t);
    ctx.restore();
    captions(ctx, t);
  }

  /* ------------------------------------------------------------- salida y post */
  const canvas = options.canvas;
  canvas.width = Math.round(W * SCALE);
  canvas.height = Math.round(H * SCALE);
  const out = canvas.getContext("2d");
  const make = () => { const c = doc.createElement("canvas"); c.width = canvas.width; c.height = canvas.height; return c; };
  const scratch = SUB > 1 ? make() : null;
  const sctx = scratch ? scratch.getContext("2d") : null;
  const vignette = (() => {
    const c = make(), x = c.getContext("2d");
    x.scale(SCALE, SCALE);
    const g = x.createRadialGradient(CX, H / 2, H * 0.3, CX, H / 2, H * 0.72);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.55)");
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    return c;
  })();
  const GRAIN = [0, 1, 2, 3].map((s) => {
    const c = doc.createElement("canvas");
    c.width = c.height = 256;
    const x = c.getContext("2d"), img = x.createImageData(256, 256), R = rng(1000 + s);
    for (let i = 0; i < img.data.length; i += 4) { const v = (R() * 255) | 0; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    x.putImageData(img, 0, 0);
    return c;
  });

  function draw(t, frame) {
    t = clamp(t, 0, spec.duration);
    if (!sctx) {
      out.setTransform(SCALE, 0, 0, SCALE, 0, 0);
      out.globalAlpha = 1;
      out.globalCompositeOperation = "source-over";
      drawFrame(out, t);
    } else {
      // Motion blur: media de `SUB` instantes dentro del obturador (alpha 1/(k+1) = media exacta).
      for (let k = 0; k < SUB; k++) {
        const ts = clamp(t + ((k + 0.5) / SUB - 0.5) * SHUTTER, 0, spec.duration);
        sctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
        sctx.globalAlpha = 1;
        sctx.globalCompositeOperation = "source-over";
        drawFrame(sctx, ts);
        out.setTransform(1, 0, 0, 1, 0, 0);
        out.globalCompositeOperation = "source-over";
        out.globalAlpha = 1 / (k + 1);
        out.drawImage(scratch, 0, 0);
      }
    }
    out.setTransform(1, 0, 0, 1, 0, 0);
    out.globalAlpha = 1;
    out.globalCompositeOperation = "source-over";
    out.drawImage(vignette, 0, 0);
    // Grano de película: 4 tiles sembrados y desplazados por frame, en `overlay` muy suave.
    const f = frame === undefined ? Math.round(t * FPS) : frame;
    const R = rng(f + 1), tile = GRAIN[f % 4], ox = -Math.floor(R() * 256), oy = -Math.floor(R() * 256);
    out.globalCompositeOperation = "overlay";
    out.globalAlpha = 0.06;
    for (let y = oy; y < canvas.height; y += 256) for (let x = ox; x < canvas.width; x += 256) out.drawImage(tile, x, y);
    out.globalAlpha = 1;
    out.globalCompositeOperation = "source-over";
  }

  const weights = [500, 700, 900];
  return {
    duration: spec.duration,
    frames: Math.round(spec.duration * FPS),
    ready: Promise.all(weights.map((w) => doc.fonts.load(font(w, 40), "Áa1"))).then(() => true),
    draw,
    setImage(id, image) { images.set(id, image); photoCache.clear(); },
    renderFrame(frame, type = "image/png", quality) { draw(frame / FPS, frame); return canvas.toDataURL(type, quality); },
  };
}
