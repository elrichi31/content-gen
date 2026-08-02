import { HOOK_STYLES, VIDEO_NICHES, type HookStyle, type VideoNiche } from "@content-gen/domain/video";

// Prompts portados desde `video-autom/dashboard/lib/script-prompt.ts` para que el
// guion generado aquí tenga exactamente la misma forma y el mismo criterio editorial.

const HOOK_BANK = `
HOOK BANK
- shock: abre con una cifra, amenaza o verdad brutal que pega en menos de 2 segundos.
- curiosity: abre con un vacio mental, misterio o pregunta que obliga a seguir mirando.
- contrarian: rompe una creencia popular y promete la version real.
- countdown: estructura el hook alrededor de una secuencia o escalada inevitable.
- real-story: abre con un caso real, una victima o una escena concreta que humaniza el tema.
`;

const NICHE_PLAYBOOK = `
NICHE PLAYBOOK
- cybersecurity: tono urgente, alto contraste, vocabulario de sistemas, amenaza invisible, pasos defensivos claros.
- ai: tono futurista y limpio, asombro + riesgo, analogias faciles, enfoque en impacto humano y decisiones.
- history: tono documental, contexto temporal, progresion causa-efecto, datos con fecha, gravedad historica.
- fraud: tono de alerta, manipulacion psicologica, dinero, confianza rota, pasos concretos para no caer.
- news: tono periodistico, hechos recientes, actores reales, consecuencias inmediatas, claridad y velocidad.
- general: tono cinematografico y sorprendente, claridad maxima, estructura adaptable.
`;

const STANDARD_STRUCTURE = `
FUNCION DE CADA ESCENA
- intro: el gancho. Una imagen y una promesa.
- layers: el contexto que reencuadra el tema.
- phase1: el primer dato duro que sorprende.
- phase2: la escalada. consecuencias reales.
- phase3: el pico o el giro que deja marca.
- reality: aterrizaje. que significa para la persona.
- close: la frase final que se comparte.
`;

const TIMELINE_STRUCTURE = `
FUNCION DE CADA ESCENA
- intro: por que esta cronologia importa hoy.
- event1: el origen o primer caso serio.
- event2: el momento en que escala.
- event3: el punto de quiebre o caso mas famoso.
- event4: la consecuencia directa.
- today: donde estamos hoy y que implica.
- close: la frase final.
`;

const SHARED_RULES = `
REGLAS DE ESCRITURA
- Idioma: espanol neutro. Sin regionalismos.
- Titulos en MAYUSCULAS, maximo 3 palabras por linea, usando \\n para saltos.
- Nada de "FASE 01/02/03". Usa etiquetas descriptivas del tema real.
- Los indicators llevan cifras, porcentajes, fechas, actores o nombres concretos SOLO si son reales.
- Maximo 80 caracteres en subtitle.
- Maximo 140 caracteres en detail o impact.
- imagePrompts siempre verticales 9:16, hiper-realistas, cinematograficos y con tomas variadas.

RIGOR FACTUAL (CRITICO)
- NO inventes cifras, porcentajes, fechas, anos ni estadisticas. Es la falta mas grave.
- Si no tienes un dato real, NO lo fabriques: reescribe la frase de forma cualitativa (sin numero) o usa un dato que sepas cierto.
- Prohibido inventar porcentajes "llamativos" (ej. "70% mas efectivo", "40% mas rapido") si no salen del contexto o de un hecho verificable.
- Nunca uses anos del pasado para eventos presentes o futuros. Respeta SIEMPRE la fecha actual indicada en el prompt.
- Para productos, versiones o herramientas nuevas: si no conoces el detalle con certeza, descríbelo de forma general sin inventar specs.
- Es mejor un guion con menos numeros pero todos ciertos, que uno lleno de cifras inventadas.`;

const IMAGE_PROMPT_RULES = `
IMAGE PROMPTS
- Nunca repitas el mismo tipo de toma dos veces seguidas.
- Alterna entre close-up, gran angular, POV, overhead, macro y ambient.
- Cada prompt debe incluir sujeto especifico, accion, locacion, un detalle unico, tipo de luz y el formato:
  "Hyper-realistic cinematic photograph. ... Shot on RED Monstro 8K, anamorphic 50mm lens. ... Dramatic contrast, deep blacks. No text, no watermarks, no logos. Vertical 9:16 portrait composition. Photorealistic, not CGI."
`;

const STANDARD_JSON_SHAPE = `
ESTRUCTURA EXACTA
{
  "slug": "kebab-case-del-tema",
  "displayTitle": "Titulo legible para el dashboard",
  "niche": "cybersecurity|ai|history|fraud|news|general",
  "hookStyle": "shock|curiosity|contrarian|countdown|real-story",
  "accents": {
    "intro":   ["#HEX1", "#HEX2"],
    "layers":  ["#HEX1", "#HEX2"],
    "phase1":  ["#HEX1", "#HEX2"],
    "phase2":  ["#HEX1", "#HEX2"],
    "phase3":  ["#HEX1", "#HEX2"],
    "reality": ["#HEX1", "#HEX2"],
    "close":   ["#HEX1", "#HEX2"]
  },
  "scenes": {
    "intro": {
      "tag": "ETIQUETA CORTA",
      "title": "TITULO\\nIMPACTANTE",
      "subtitle": "gancho breve"
    },
    "layers": {
      "tag": "ETIQUETA",
      "terminal": [
        "> concepto = dato real",
        "> concepto = cifra concreta",
        "> concepto = actor real",
        "> concepto = hallazgo clave"
      ],
      "definition": "Explicacion en 3 lineas\\nshort, sharp\\nsin relleno",
      "detail": "Dato tecnico o historico con ano y cifra."
    },
    "phase1": {
      "phase": "NOMBRE REAL",
      "timestamp": "ETIQUETA CORTA",
      "title": "TITULO\\nDESCRIPTIVO",
      "narrative": "Que ocurre y por que importa.",
      "detail": "Dato con numero real.",
      "indicator": ["Cifra concreta + contexto", "Nombre o dato especifico"]
    },
    "phase2": {
      "phase": "NOMBRE REAL",
      "timestamp": "ETIQUETA CORTA",
      "title": "TITULO\\nDESCRIPTIVO",
      "narrative": "Escalada con actores y consecuencias reales.",
      "detail": "Dato con numero real.",
      "indicator": ["Cifra concreta", "Dato o actor especifico"]
    },
    "phase3": {
      "phase": "NOMBRE REAL",
      "timestamp": "ETIQUETA CORTA",
      "title": "TITULO\\nDESCRIPTIVO",
      "narrative": "El giro o pico mas fuerte.",
      "detail": "El dato mas sorprendente.",
      "indicator": ["Numero mas impactante", "Consecuencia mas grave"]
    },
    "reality": {
      "tag": "REALIDAD · CONTEXTO",
      "title": "Frase que reencuadra\\ntodo lo anterior",
      "actions": [
        "Accion concreta ahora mismo",
        "Segunda accion especifica",
        "Tercera accion accionable",
        "Cuarta accion o dato final"
      ]
    },
    "close": {
      "tag": "TEMA · CONCLUSION",
      "title": "La frase\\nque duele\\no sorprende",
      "subtitle": "Linea final compartible"
    }
  },
  "imagePrompts": {
    "intro": "...",
    "layers": "...",
    "phase1": "...",
    "phase2": "...",
    "phase3": "...",
    "reality": "...",
    "close": "..."
  }
}
`;

const TIMELINE_JSON_SHAPE = `
ESTRUCTURA EXACTA
{
  "slug": "kebab-case-del-tema",
  "displayTitle": "Titulo legible para el dashboard",
  "niche": "cybersecurity|ai|history|fraud|news|general",
  "hookStyle": "shock|curiosity|contrarian|countdown|real-story",
  "compositionType": "timeline",
  "accents": {
    "intro":  ["#HEX1", "#HEX2"],
    "event1": ["#HEX1", "#HEX2"],
    "event2": ["#HEX1", "#HEX2"],
    "event3": ["#HEX1", "#HEX2"],
    "event4": ["#HEX1", "#HEX2"],
    "today":  ["#HEX1", "#HEX2"],
    "close":  ["#HEX1", "#HEX2"]
  },
  "scenes": {
    "intro": {
      "tag": "ETIQUETA CORTA",
      "title": "TITULO\\nIMPACTANTE",
      "subtitle": "por que esta cronologia importa hoy"
    },
    "event1": {
      "event": "ETIQUETA DEL EVENTO",
      "year": "AAAA",
      "headline": "TITULAR\\nIMPACTANTE",
      "impact": "Impacto con dato real."
    },
    "event2": {
      "event": "ETIQUETA DEL EVENTO",
      "year": "AAAA",
      "headline": "TITULAR\\nIMPACTANTE",
      "impact": "Impacto con dato real."
    },
    "event3": {
      "event": "ETIQUETA DEL EVENTO",
      "year": "AAAA",
      "headline": "TITULAR\\nIMPACTANTE",
      "impact": "Impacto con dato real."
    },
    "event4": {
      "event": "ETIQUETA DEL EVENTO",
      "year": "AAAA",
      "headline": "TITULAR\\nIMPACTANTE",
      "impact": "Impacto con dato real."
    },
    "today": {
      "tag": "ACTUALIDAD · HOY",
      "title": "Donde estamos\\nahora mismo",
      "actions": [
        "Dato o accion del panorama actual",
        "Segunda realidad del estado hoy",
        "Tercera tendencia reciente",
        "Cuarta implicacion para el usuario"
      ]
    },
    "close": {
      "tag": "CRONOLOGIA · CONCLUSION",
      "title": "La frase\\nque duele",
      "subtitle": "Linea final que resume todo"
    }
  },
  "imagePrompts": {
    "intro": "...",
    "event1": "...",
    "event2": "...",
    "event3": "...",
    "event4": "...",
    "today": "...",
    "close": "..."
  }
}
`;

export function inferNicheFromTopic(topic: string): VideoNiche {
  const normalized = topic.toLowerCase();
  if (/(hack|malware|ransom|phish|ciber|cyber|dark web|breach|vulnerab|zero day|spyware|ddos)/.test(normalized)) return "cybersecurity";
  if (/(ia|ai|llm|openai|chatgpt|modelo|prompt|agente|machine learning|deep learning|robot)/.test(normalized)) return "ai";
  if (/(historia|timeline|cronologia|origen|guerra|imperio|siglo|revolucion|caso historico)/.test(normalized)) return "history";
  if (/(fraude|estafa|scam|ponzi|cripto|crypto|lavado|robo|suplantacion|banco|tarjeta)/.test(normalized)) return "fraud";
  if (/(noticia|news|ultim|reciente|hoy|actualidad|breaking|reporte|anuncio)/.test(normalized)) return "news";
  return "general";
}

export function normalizeNiche(value: unknown, fallbackTopic: string): VideoNiche {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (VIDEO_NICHES as readonly string[]).includes(raw) ? raw as VideoNiche : inferNicheFromTopic(fallbackTopic);
}

export function normalizeHookStyle(value: unknown): HookStyle {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if ((HOOK_STYLES as readonly string[]).includes(raw)) return raw as HookStyle;
  if (raw === "real_story" || raw === "real story") return "real-story";
  return "curiosity";
}

export const SYSTEM_PROMPT = `Eres un director creativo especializado en videos virales de TikTok y Reels. Tu trabajo es crear guiones que paren el scroll con un hook claro, datos concretos y visuales cinematograficos.

${HOOK_BANK}
${NICHE_PLAYBOOK}
${STANDARD_STRUCTURE}
${SHARED_RULES}

COLORES Y RITMO
- Los colores de accent deben evolucionar con la tension del tema.
- cybersecurity: verdes, rojos, cyan, negros profundos.
- ai: verdes electricos, cyan limpios, blancos, negros suaves.
- history: ambar, bronce, verde oscuro, humo, luz dramatica.
- fraud: ambar, rojo, verde dinero, blanco de evidencia.
- news: cyan, rojo editorial, blanco, contrastes duros.
- general: paleta cinematografica coherente con la emocion.

${IMAGE_PROMPT_RULES}

REGLA CLAVE
- Debes elegir un niche de la lista permitida y un hookStyle de la libreria.
- No inventes otros valores.
- El hook del intro debe sentirse coherente con el hookStyle elegido.
- La progresion de layers/phase1/phase2/phase3/reality/close debe sentirse propia del niche elegido, no generica.

Devuelve SOLO JSON, sin markdown.

${STANDARD_JSON_SHAPE}`;

export const TIMELINE_SYSTEM_PROMPT = `Eres un director creativo especializado en videos virales de TikTok y Reels de formato cronologia. Construyes lineas temporales que paren el scroll con fechas exactas, hechos reales y progresion dramatica.

${HOOK_BANK}
${NICHE_PLAYBOOK}
${TIMELINE_STRUCTURE}
${SHARED_RULES}

REGLAS EXTRA DE CRONOLOGIA
- Debes elegir 4 eventos reales y ordenarlos cronologicamente.
- Cada year debe ser un ano exacto de 4 digitos.
- Cada event debe ser una etiqueta corta y fuerte.
- Cada impact debe incluir una cifra, actor real o consecuencia verificable.
- Si el tema es historico, news o cybersecurity, la progresion debe sentirse como una investigacion que avanza.

COLORES Y RITMO
- En timeline la paleta debe evolucionar desde origen hasta actualidad.
- history: mas documental y atmosferico.
- news: mas periodistico y urgente.
- cybersecurity: mas tecnico y amenazante.
- ai: mas futurista y limpio.
- fraud: mas alerta y forense.

${IMAGE_PROMPT_RULES}

REGLA CLAVE
- Debes elegir un niche de la lista permitida y un hookStyle de la libreria.
- No inventes otros valores.
- El intro debe usar el hookStyle elegido y justificar por que esta historia importa hoy.

Devuelve SOLO JSON, sin markdown.

${TIMELINE_JSON_SHAPE}`;

// Maximo de caracteres del contexto del usuario que se envia al modelo, para no
// desbordar el presupuesto de prompt. Los documentos largos se truncan al final.
const MAX_CONTEXT_CHARS = 12000;

/** Fecha de hoy escrita en el prompt para que el modelo no fecha eventos actuales en su ano de corte. */
export function buildDateHeader(now = new Date()): string {
  const iso = now.toISOString().slice(0, 10);
  const year = now.getFullYear();
  return `FECHA ACTUAL: ${iso} (estamos en el ano ${year}).
- Todo el guion ocurre en el presente (${year}) o el pasado real. Nunca fecha eventos actuales en anos anteriores por costumbre.
- Si el contexto menciona productos/eventos de ${year}, trátalos como actuales, no los muevas a ${year - 3} ni a otro ano.
`;
}

export function buildContextBlock(context?: string): string {
  const trimmed = context?.trim();
  if (!trimmed) return "";
  const clipped = trimmed.length > MAX_CONTEXT_CHARS ? `${trimmed.slice(0, MAX_CONTEXT_CHARS)}\n[...contexto truncado...]` : trimmed;

  return `

CONTEXTO DE REFERENCIA (UNICA fuente de datos)
El usuario adjunto informacion de referencia actualizada. Es la fuente de verdad:
- Usa SOLO datos (cifras, fechas, anos, nombres, porcentajes) que aparezcan en este contexto o que sepas con total certeza.
- NO completes huecos con cifras inventadas ni con suposiciones. Si el contexto no da un numero, no lo inventes.
- NO contradigas el contexto. Si el contexto dice que algo es de este ano, NO lo fechas en otro ano.
- Tu conocimiento de entrenamiento puede estar desactualizado: ante conflicto, gana el contexto.
- Puedes reordenar, resumir y dramatizar la informacion del contexto, pero sin agregar hechos nuevos no respaldados.

--- INICIO DEL CONTEXTO ---
${clipped}
--- FIN DEL CONTEXTO ---
`;
}

function buildDurationBlock(targetDurationSeconds?: number): string {
  if (!targetDurationSeconds) return "";
  return `

DURACION OBJETIVO: ${targetDurationSeconds} segundos en total (7 escenas).
- Ajusta la densidad de texto en pantalla a ese ritmo: en videos cortos (~30s) los titulos y textos deben ser mas breves y contundentes; en videos largos (~90s) puedes desarrollar un poco mas.
- Cada escena se muestra en pantalla unos pocos segundos: no escribas parrafos que no se alcancen a leer.
`;
}

// La campaña de Content Gen aporta audiencia, tono y marca; se añaden como
// direccion extra sin alterar la estructura del prompt original.
export type PromptDirection = { audience?: string; tone?: string; language?: string; brandName?: string; primaryColor?: string };

function buildDirectionBlock({ audience, tone, language, brandName, primaryColor }: PromptDirection): string {
  return [
    audience?.trim() ? `- Audiencia: ${audience.trim()}.` : "",
    tone?.trim() ? `- Tono pedido: ${tone.trim()}.` : "",
    language?.trim() && language.trim().toLowerCase() !== "es" ? `- Idioma de salida: ${language.trim()}.` : "",
    brandName?.trim() ? `- Marca: ${brandName.trim()}${primaryColor ? `; color principal ${primaryColor}` : ""}.` : "",
  ].filter(Boolean).join("\n");
}

export function buildUserPrompt(topic: string, context?: string, targetDurationSeconds?: number, direction: PromptDirection = {}): string {
  const inferredNiche = inferNicheFromTopic(topic);
  const extra = buildDirectionBlock(direction);

  return `Genera el guion completo para un video sobre: "${topic}"

${buildDateHeader()}${buildContextBlock(context)}${buildDurationBlock(targetDurationSeconds)}
Contexto de direccion:
- Niche sugerido por el tema: ${inferredNiche}
- Elige el hookStyle mas potente desde el hook bank y adaptalo al tema.
- Si el tema encaja mejor en otro niche permitido, puedes cambiarlo, pero debe seguir siendo uno de: ${VIDEO_NICHES.join(", ")}.
- El video debe tener un angulo inesperado, no el encuadre mas obvio.
- Cada indicator debe sonar como una prueba, no como relleno.
- Los imagePrompts deben variar la perspectiva entre escenas.
- Piensa como editor de retention: intro golpea, layers aclara, phase1/2/3 escalan, reality aterriza, close remata.
${extra}`;
}

export function buildTimelineUserPrompt(topic: string, context?: string, targetDurationSeconds?: number, direction: PromptDirection = {}): string {
  const inferredNiche = inferNicheFromTopic(topic);
  const extra = buildDirectionBlock(direction);

  return `Genera la cronologia completa para un video sobre: "${topic}"

${buildDateHeader()}${buildContextBlock(context)}${buildDurationBlock(targetDurationSeconds)}
Contexto de direccion:
- Niche sugerido por el tema: ${inferredNiche}
- Elige el hookStyle mas potente desde el hook bank y adaptalo al intro.
- Puedes cambiar el niche sugerido solo si otro encaja mejor entre: ${VIDEO_NICHES.join(", ")}.
- Los 4 eventos deben construir una escalada clara y real.
- Los imagePrompts deben evocar la epoca de cada evento o el contexto actual cuando toque.
- El cierre debe dejar una idea historica o actual imposible de olvidar.
${extra}`;
}
