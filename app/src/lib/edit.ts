// Edição automática do clipe, feita no PC (sem custo de IA):
// - cortar silêncios longos e vícios de fala ("éé", "ãh", "hum")
// - destacar palavras-chave com cor e emoji
// - zoom dinâmico nos momentos fortes
import type { Highlight, Word } from "./types";

export type EditOpts = { cutSilences: boolean; cutFillers: boolean; emojis: boolean; keywords: boolean; zoom: boolean };
export type Span = [number, number]; // [início, fim] em segundos

// Emojis disponíveis (Twemoji, CC-BY 4.0). A IA só escolhe desta lista.
export const EMOJIS: Record<string, string> = {
  "😂": "1f602", "🤣": "1f923", "😱": "1f631", "🤯": "1f92f", "🔥": "1f525", "💯": "1f4af", "👀": "1f440", "😍": "1f60d",
  "😭": "1f62d", "😡": "1f621", "🤔": "1f914", "🙏": "1f64f", "👏": "1f44f", "💪": "1f4aa", "🚀": "1f680", "💰": "1f4b0",
  "⚠️": "26a0", "❌": "274c", "✅": "2705", "🎯": "1f3af", "🎮": "1f3ae", "🏆": "1f3c6", "💀": "1f480", "😎": "1f60e",
  "🤡": "1f921", "❤️": "2764", "💔": "1f494", "🤝": "1f91d", "📈": "1f4c8", "📉": "1f4c9", "💡": "1f4a1", "⏰": "23f0",
  "🎉": "1f389", "😅": "1f605", "🙄": "1f644", "🤫": "1f92b", "👑": "1f451", "😮": "1f62e", "🥺": "1f97a", "🍀": "1f340",
};

const SILENCE_MIN = 0.7; // pausas maiores que isso são encurtadas
const SILENCE_KEEP = 0.18; // respiro deixado de cada lado da pausa
const MIN_PIECE = 0.25;

export function norm(w: string): string {
  return w
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Hesitações puras. "tipo" e "né" ficam: às vezes fazem parte da frase. */
export function isFiller(word: string): boolean {
  const n = norm(word);
  if (!n) return false;
  return /^(e{2,}|a{2,}h*|ah+n*|an+h+|h+u+m+|hm+|u+m+|u+h+|e+h+|er+|eh|ahm|uhum|hum)$/.test(n);
}

/** Trechos do clipe que ficam (tempos relativos ao clipe). Sem cortes → [[0, len]]. */
export function keepSpans(words: Word[], len: number, o: Pick<EditOpts, "cutSilences" | "cutFillers">): Span[] {
  if (!o.cutSilences && !o.cutFillers) return [[0, len]];
  const ws = words.filter((w) => w.end > 0 && w.start < len).sort((a, b) => a.start - b.start);
  const cuts: Span[] = [];
  if (o.cutFillers) {
    ws.forEach((w, i) => {
      if (!isFiller(w.word)) return;
      const prevEnd = i > 0 ? ws[i - 1].end : 0;
      const nextStart = i + 1 < ws.length ? ws[i + 1].start : len;
      // corta a hesitação inteira, sem encostar nas palavras vizinhas
      cuts.push([Math.max(prevEnd + 0.04, w.start - 0.05), Math.min(nextStart - 0.04, w.end + 0.05)]);
    });
  }
  if (o.cutSilences) {
    const speech = ws.filter((w) => !(o.cutFillers && isFiller(w.word)));
    let prev = 0;
    for (const w of speech) {
      if (w.start - prev > SILENCE_MIN) cuts.push([prev + SILENCE_KEEP, w.start - SILENCE_KEEP]);
      prev = Math.max(prev, w.end);
    }
    if (len - prev > SILENCE_MIN && speech.length) cuts.push([prev + SILENCE_KEEP + 0.1, len]);
  }
  const merged = cuts
    .map(([a, b]) => [Math.max(0, a), Math.min(len, b)] as Span)
    .filter(([a, b]) => b - a > 0.08)
    .sort((x, y) => x[0] - y[0])
    .reduce<Span[]>((acc, c) => {
      const last = acc[acc.length - 1];
      if (last && c[0] <= last[1] + 0.02) last[1] = Math.max(last[1], c[1]);
      else acc.push([...c]);
      return acc;
    }, []);
  const keeps: Span[] = [];
  let pos = 0;
  for (const [a, b] of merged) {
    if (a - pos >= MIN_PIECE) keeps.push([pos, a]);
    pos = b;
  }
  if (len - pos >= MIN_PIECE) keeps.push([pos, len]);
  return keeps.length ? keeps : [[0, len]];
}

export function keptLength(keeps: Span[]): number {
  return keeps.reduce((n, [a, b]) => n + (b - a), 0);
}

/** Tempo original (do clipe) → tempo no vídeo final. null se o instante foi cortado. */
export function toOut(t: number, keeps: Span[]): number | null {
  let acc = 0;
  for (const [a, b] of keeps) {
    if (t < a) return null;
    if (t <= b) return acc + (t - a);
    acc += b - a;
  }
  return null;
}

/** Leva um intervalo para a linha do tempo final (encaixando no trecho mantido mais próximo). */
function spanOut(s: number, e: number, keeps: Span[]): Span | null {
  let acc = 0;
  let os: number | null = null;
  let oe: number | null = null;
  for (const [a, b] of keeps) {
    const ia = Math.max(a, s);
    const ib = Math.min(b, e);
    if (ib > ia) {
      if (os === null) os = acc + (ia - a);
      oe = acc + (ib - a);
    }
    acc += b - a;
  }
  return os !== null && oe !== null && oe > os ? [os, oe] : null;
}

/** Palavras na linha do tempo final (as cortadas somem). */
export function remapWords(words: Word[], keeps: Span[], dropFillers: boolean): Word[] {
  const out: Word[] = [];
  for (const w of words) {
    if (dropFillers && isFiller(w.word)) continue;
    const r = spanOut(w.start, w.end, keeps);
    if (r) out.push({ ...w, start: r[0], end: r[1] });
  }
  return out;
}

export function remapSpans(spans: Span[], keeps: Span[]): Span[] {
  return spans.map(([a, b]) => spanOut(a, b, keeps)).filter((x): x is Span => !!x);
}

/** Expressão do FFmpeg que mantém só os trechos escolhidos. */
export function selectExpr(keeps: Span[]): string {
  return keeps.map(([a, b]) => `between(t\\,${a.toFixed(3)}\\,${b.toFixed(3)})`).join("+");
}

// ---------- Destaques (palavras-chave + emoji) ----------
export type Mark = { keyword: boolean; emoji: string | null };

/** Liga os destaques da IA às palavras do clipe (cada destaque marca a primeira ocorrência). */
export function markWords(words: Word[], highlights: Highlight[] | undefined): Map<number, Mark> {
  const marks = new Map<number, Mark>();
  if (!highlights?.length) return marks;
  const used = new Set<number>();
  for (const h of highlights) {
    const target = norm(h.word);
    if (target.length < 2) continue;
    const idx = words.findIndex((w, i) => !used.has(i) && norm(w.word) === target);
    if (idx < 0) continue;
    used.add(idx);
    marks.set(idx, { keyword: true, emoji: h.emoji && EMOJIS[h.emoji] ? h.emoji : null });
  }
  return marks;
}

/** Emojis na linha do tempo final: aparecem com a palavra e ficam ~1,4 s (sem sobrepor). */
export function emojiTimeline(words: Word[], marks: Map<number, Mark>, len: number): Array<{ emoji: string; start: number; end: number }> {
  const list: Array<{ emoji: string; start: number; end: number }> = [];
  [...marks.entries()]
    .filter(([, m]) => m.emoji)
    .sort((a, b) => words[a[0]].start - words[b[0]].start)
    .forEach(([i, m]) => {
      const start = words[i].start;
      const prev = list[list.length - 1];
      if (prev && start < prev.end + 0.3) return; // um emoji por vez
      list.push({ emoji: m.emoji!, start, end: Math.min(len, start + 1.4) });
    });
  return list;
}

/** Momentos de zoom: nas palavras-chave, no máximo um a cada 5 s, ~1,6 s cada. */
export function zoomMoments(words: Word[], marks: Map<number, Mark>, len: number): Span[] {
  const out: Span[] = [];
  const idx = [...marks.keys()].sort((a, b) => words[a].start - words[b].start);
  for (const i of idx) {
    const s = Math.max(0, words[i].start - 0.15);
    if (out.length && s < out[out.length - 1][1] + 3.4) continue;
    if (s > len - 0.8) continue;
    out.push([s, Math.min(len, s + 1.6)]);
  }
  return out;
}

export const ZOOM_AMOUNT = 0.12; // aproxima 12%
export const ZOOM_RAMP = 0.22; // segundos para entrar/sair

/** Fator de zoom num instante (mesma curva da exportação). */
export function zoomAt(t: number, moments: Span[]): number {
  let z = 0;
  for (const [a, b] of moments) {
    const up = Math.min(1, Math.max(0, (t - a) / ZOOM_RAMP));
    const down = Math.min(1, Math.max(0, (b - t) / ZOOM_RAMP));
    z = Math.max(z, Math.min(up, down));
  }
  return 1 + ZOOM_AMOUNT * z;
}

/** A mesma curva como expressão do FFmpeg (variável de tempo: it). */
export function zoomExpr(moments: Span[], v = "it"): string {
  if (!moments.length) return "1";
  const one = ([a, b]: Span) =>
    `min(min(1\\,max(0\\,(${v}-${a.toFixed(2)})/${ZOOM_RAMP}))\\,min(1\\,max(0\\,(${b.toFixed(2)}-${v})/${ZOOM_RAMP})))`;
  const sum = moments.map(one).join("+"); // momentos nunca se sobrepõem
  return `1+${ZOOM_AMOUNT}*(${sum})`;
}

/** Tempo no vídeo final → tempo original (do clipe). */
export function fromOut(t: number, keeps: Span[]): number {
  let acc = 0;
  for (const [a, b] of keeps) {
    if (t <= acc + (b - a)) return a + Math.max(0, t - acc);
    acc += b - a;
  }
  const last = keeps[keeps.length - 1];
  return last ? last[1] : t;
}

export type ClipPlan = {
  keeps: Span[]; // trechos mantidos (tempo do clipe)
  cut: boolean; // houve algum corte
  outLen: number; // duração final
  words: Word[]; // palavras na linha do tempo final
  keywords: Set<number>; // índices em words
  emojis: Array<{ emoji: string; start: number; end: number }>;
  zoom: Span[];
};

/** Tudo o que a exportação e a prévia precisam para um clipe, a partir das opções. */
export function planClip(relWords: Word[], len: number, highlights: Highlight[] | undefined, o: EditOpts): ClipPlan {
  const keeps = keepSpans(relWords, len, o);
  const cut = !(keeps.length === 1 && keeps[0][0] === 0 && keeps[0][1] === len);
  const outLen = keptLength(keeps);
  const words = cut ? remapWords(relWords, keeps, o.cutFillers) : relWords;
  const marks = markWords(words, highlights);
  return {
    keeps,
    cut,
    outLen,
    words,
    keywords: o.keywords ? new Set([...marks.entries()].filter(([, m]) => m.keyword).map(([i]) => i)) : new Set(),
    emojis: o.emojis ? emojiTimeline(words, marks, outLen) : [],
    zoom: o.zoom ? zoomMoments(words, marks, outLen) : [],
  };
}
