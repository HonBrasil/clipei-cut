// Gera legendas animadas "palavra por palavra" no formato ASS, que o FFmpeg
// grava direto no vídeo. A palavra falada no momento fica em destaque.
import type { Layout, Word } from "./types";

export type CaptionStyle = {
  font: string;
  highlight: string; // cor hex da palavra em destaque, ex. "#FF3B4A"
  uppercase: boolean;
};

export const DEFAULT_STYLE: CaptionStyle = { font: "Arial Black", highlight: "#FF3B4A", uppercase: true };

/** Converte #RRGGBB para a cor do ASS (&H00BBGGRR&). */
function assColor(hex: string): string {
  const h = hex.replace("#", "");
  return `&H00${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}&`.toUpperCase();
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

export function buildAss(
  words: Word[], // já com tempos relativos ao início do clipe
  clipLen: number,
  layout: Layout,
  hasWebcam: boolean,
  style: CaptionStyle = DEFAULT_STYLE,
): string {
  const vertical = layout !== "wide";
  const playX = vertical ? 1080 : 1920;
  const playY = vertical ? 1920 : 1080;
  const size = vertical ? 82 : 66;
  // Posição: logo abaixo da câmera no "cam em cima"; senão, um pouco abaixo do centro
  const posY = vertical ? (layout === "cam-top" && hasWebcam ? 1010 : 1240) : 900;
  const hl = assColor(style.highlight);

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
    `Style: Clipei,${style.font},${size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,6,3,5,60,60,0,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const lines: string[] = [];
  const groups = groupWords(words.filter((w) => w.end > 0 && w.start < clipLen));
  groups.forEach((g, gi) => {
    const groupEnd = Math.min(clipLen, gi + 1 < groups.length ? Math.min(groups[gi + 1][0].start, g[g.length - 1].end + 0.6) : g[g.length - 1].end + 0.6);
    g.forEach((w, wi) => {
      const start = Math.max(0, w.start);
      const end = wi + 1 < g.length ? g[wi + 1].start : groupEnd;
      if (end <= start) return;
      const text = g
        .map((x, xi) => {
          const t = style.uppercase ? x.word.toUpperCase() : x.word;
          return xi === wi ? `{\\c${hl}\\fscx112\\fscy112}${t}{\\c&H00FFFFFF&\\fscx100\\fscy100}` : t;
        })
        .join(" ");
      // Pequeno "pop" na entrada de cada bloco
      const pop = wi === 0 ? "\\fscx85\\fscy85\\t(0,90,\\fscx100\\fscy100)" : "";
      lines.push(`Dialogue: 0,${ts(start)},${ts(end)},Clipei,,0,0,0,,{\\an5\\pos(${playX / 2},${posY})${pop}}${text}`);
    });
  });

  return [...header, ...lines, ""].join("\n");
}
