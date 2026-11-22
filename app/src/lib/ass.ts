// Gera legendas animadas no formato ASS, que o FFmpeg grava direto no vídeo.
// O visual vem do modelo de legenda escolhido pelo usuário.
import { captionBase, layoutSize, type Layout, type Word } from "./types";
import { ctaY, type Cta } from "./brand";
import { FONTS, type CaptionModel, type CaptionPos } from "./settings";

/** Cor das palavras-chave: contrasta com a cor de destaque do modelo. */
export function keywordColor(model: CaptionModel): string {
  const h = model.highlight.replace("#", "").toLowerCase();
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const yellowish = r > 180 && g > 170 && b < 120;
  return yellowish ? "#4ADE80" : "#FFD43B";
}

/** Converte #RRGGBB para a cor do ASS (&H00BBGGRR&). */
export function assColor(hex: string, alpha = "00"): string {
  const h = hex.replace("#", "").padEnd(6, "F");
  return `&H${alpha}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}&`.toUpperCase();
}

function ts(sec: number): string {
  const t = Math.max(0, sec);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const cs = Math.floor((t - Math.floor(t)) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function clean(word: string): string {
  return word.replace(/[{}\\]/g, "").trim();
}

// ---------- Palavrões ----------
const BAD = ["porra", "caralh", "merda", "puta", "putaria", "fod", "fud", "fdp", "buceta", "arromba", "cacete", "bosta", "piroca", "cuzao", "cuzão", "viad", "desgraç", "desgrac"];

function norm(w: string): string {
  return w
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");
}

export function isBadWord(w: string): boolean {
  const n = norm(w);
  if (n.length < 3) return n === "cu";
  return BAD.some((b) => n.startsWith(norm(b)));
}

/** "porra" -> "p***a" */
export function maskWord(w: string): string {
  const t = clean(w);
  if (t.length <= 2) return "*".repeat(t.length);
  return t[0] + "*".repeat(t.length - 2) + t[t.length - 1];
}

/** Intervalos (relativos ao clipe) que devem receber o bip. */
export function censorIntervals(words: Word[]): Array<[number, number]> {
  return words.filter((w) => isBadWord(w.word)).map((w) => [Math.max(0, w.start - 0.05), w.end + 0.05]);
}

// ---------- Agrupamento ----------
/** Agrupa palavras em blocos curtos (até 3 palavras / ~18 letras). */
export function groupWords(words: Word[], maxWords = 3, maxChars = 18, maxGap = 0.6): Word[][] {
  const groups: Word[][] = [];
  let cur: Word[] = [];
  for (const w of words) {
    const text = clean(w.word);
    if (!text) continue;
    const curChars = cur.reduce((n, x) => n + clean(x.word).length + 1, 0);
    const gap = cur.length ? w.start - cur[cur.length - 1].end : 0;
    const endsSentence = cur.length ? /[.!?…]$/.test(cur[cur.length - 1].word.trim()) : false;
    if (cur.length && (cur.length >= maxWords || curChars + text.length > maxChars || gap > maxGap || endsSentence)) {
      groups.push(cur);
      cur = [];
    }
    cur.push({ ...w, word: text });
  }
  if (cur.length) groups.push(cur);
  return groups;
}

export function captionY(layout: Layout, hasWebcam: boolean, pos: CaptionPos): number {
  if (layout === "wide") return { topo: 150, meio: 560, baixo: 930 }[pos];
  if (layout === "square") return { topo: 150, meio: 560, baixo: 910 }[pos];
  if (layout === "podcast") return { topo: 300, meio: 960, baixo: 1650 }[pos];
  if (layout === "cam-top" && hasWebcam) return { topo: 830, meio: 1010, baixo: 1560 }[pos];
  return { topo: 420, meio: 1240, baixo: 1560 }[pos];
}

export function buildAss(
  words: Word[], // tempos relativos ao início do clipe
  clipLen: number,
  layout: Layout,
  hasWebcam: boolean,
  model: CaptionModel,
  censor = false,
  watermark = false,
  keywords: Set<number> = new Set(), // índices (em words) das palavras-chave
  cta: Cta | null = null, // chamada final do kit da marca
): string {
  const { w: playX, h: playY } = layoutSize(layout);
  const vertical = playY > playX;
  const size = Math.round(captionBase(layout) * (model.size / 100));
  const posY = captionY(layout, hasWebcam, model.position);
  const base = assColor(model.base);
  const hl = assColor(model.highlight);
  const kw = assColor(keywordColor(model));
  const font = FONTS[model.font]?.family ?? "Arial";
  const borderStyle = model.box ? 3 : 1;
  const outline = model.box ? 14 : model.outline ? 6 : 0;
  const shadow = model.box ? 0 : model.outline ? 3 : 2;
  const outlineColour = model.box ? "&H50000000&" : "&H00000000&";

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${playX}`,
    `PlayResY: ${playY}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Clipei,${font},${size},${base},${base},${outlineColour},&H80000000&,0,0,0,0,100,100,1,0,${borderStyle},${outline},${shadow},5,60,60,0,1`,
    `Style: Selo,Poppins ExtraBold,${vertical ? 40 : 30},&H40FFFFFF&,&H40FFFFFF&,&H80000000&,&H80000000&,0,0,0,0,100,100,1,0,1,3,0,2,40,40,40,1`,
    `Style: CTA,Poppins ExtraBold,${Math.round(size * 0.78)},${assColor(cta?.textColor ?? "#FFFFFF")},${assColor(cta?.textColor ?? "#FFFFFF")},${assColor(cta?.color ?? "#E3121F")},${assColor(cta?.color ?? "#E3121F")},0,0,0,0,100,100,1,0,3,${Math.round(size * 0.32)},0,5,60,60,0,1`,
    `Style: Marca,${font},${Math.round(size * 0.45)},&H30FFFFFF&,&H30FFFFFF&,&H00000000&,&H80000000&,0,0,0,0,100,100,0,0,1,3,0,9,40,40,40,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const fmt = (w: string) => {
    const t = censor && isBadWord(w) ? maskWord(w) : w;
    return model.uppercase ? t.toUpperCase() : t;
  };
  const pos = `\\an5\\pos(${playX / 2},${posY})`;
  const reset = `{\\c${base}\\fscx100\\fscy100}`;

  const lines: string[] = [];
  const tagged = words.map((w, i) => ({ ...w, kw: keywords.has(i) }));
  const groups = groupWords(tagged.filter((w) => w.end > 0 && w.start < clipLen)) as Array<Array<Word & { kw?: boolean }>>;
  const color = (x: Word & { kw?: boolean }, t: string) => (x.kw ? `{\\c${kw}}${t}{\\c${base}}` : t);
  groups.forEach((g, gi) => {
    const groupEnd = Math.min(
      clipLen,
      gi + 1 < groups.length ? Math.min(groups[gi + 1][0].start, g[g.length - 1].end + 0.6) : g[g.length - 1].end + 0.6,
    );
    const enter = "\\fscx85\\fscy85\\t(0,90,\\fscx100\\fscy100)";

    if (model.anim === "frase") {
      const text = g.map((x) => color(x, fmt(x.word))).join(" ");
      lines.push(`Dialogue: 0,${ts(Math.max(0, g[0].start))},${ts(groupEnd)},Clipei,,0,0,0,,{${pos}${enter}}${text}`);
      return;
    }

    g.forEach((w, wi) => {
      const start = Math.max(0, w.start);
      const end = wi + 1 < g.length ? g[wi + 1].start : groupEnd;
      if (end <= start) return;
      const visible = model.anim === "digitacao" ? g.slice(0, wi + 1) : g;
      const text = visible
        .map((x, xi) => {
          const t = fmt(x.word);
          if (xi !== wi) return color(x, t);
          const pop = model.anim === "pop" ? `\\fscx128\\fscy128\\t(0,120,\\fscx112\\fscy112)` : `\\fscx112\\fscy112`;
          return `{\\c${hl}${pop}}${t}${reset}`;
        })
        .join(" ");
      const groupEnter = wi === 0 && model.anim !== "pop" ? enter : "";
      lines.push(`Dialogue: 0,${ts(start)},${ts(end)},Clipei,,0,0,0,,{${pos}${groupEnter}}${text}`);
    });
  });

  if (cta) {
    const from = Math.max(0, clipLen - cta.seconds);
    const y = Math.round(playY * ctaY(model.position));
    const pop = "\\fscx55\\fscy55\\t(0,160,\\fscx108\\fscy108)\\t(160,260,\\fscx100\\fscy100)";
    lines.push(`Dialogue: 3,${ts(from)},${ts(clipLen)},CTA,,0,0,0,,{\\an5\\pos(${playX / 2},${y})${pop}}${clean(cta.text)}`);
  }

  if (model.brand.trim()) {
    const b = clean(model.brand).slice(0, 40);
    lines.push(`Dialogue: 1,${ts(0)},${ts(clipLen)},Marca,,0,0,0,,{\\an9\\pos(${playX - 40},40)}${b}`);
  }

  if (watermark) {
    lines.push(`Dialogue: 2,${ts(0)},${ts(clipLen)},Selo,,0,0,0,,{\\an2\\pos(${playX / 2},${playY - (vertical ? 70 : 30)})}Feito com Clipei Cut`);
  }

  return [...header, ...lines, ""].join("\n");
}
