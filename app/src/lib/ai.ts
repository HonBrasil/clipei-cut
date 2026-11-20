// Conversa com o servidor do Clipei Cut (Supabase Edge Functions).
// As chaves das IAs ficam só no servidor, nunca dentro do app.
import { readFile } from "@tauri-apps/plugin-fs";
import { supabase } from "./supabase";
import type { AudioChunk } from "./ffmpeg";
import type { Clip, Prefs, Segment, Transcript, Word } from "./types";

export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError("nao_autenticado", "Faça login novamente.");
  return {
    Authorization: `Bearer ${token}`,
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  };
}

function fnUrl(name: string): string {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`;
}

async function parse(res: Response): Promise<any> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = body?.error?.code ?? `http_${res.status}`;
    const msg = body?.error?.message ?? "Falha ao falar com o servidor.";
    throw new ApiError(code, msg);
  }
  return body;
}

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (e instanceof ApiError && ["sem_creditos", "nao_autenticado", "muito_grande"].includes(e.code)) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw last;
}

export async function transcribe(
  chunks: AudioChunk[],
  language: string,
  onProgress?: (p: number) => void,
  onCredits?: (remaining: number) => void,
): Promise<Transcript> {
  const segments: Segment[] = [];
  const words: Word[] = [];
  let duration = 0;

  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const bytes = await readFile(c.path);
    const data = await withRetry(async () => {
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: "audio/ogg" }), `parte_${i}.ogg`);
      form.append("duration", String(Math.max(1, c.end - c.start)));
      form.append("language", language);
      const res = await fetch(fnUrl("transcribe"), { method: "POST", headers: await authHeaders(), body: form });
      return parse(res);
    });
    for (const s of data.segments as Segment[]) segments.push({ ...s, start: s.start + c.start, end: s.end + c.start });
    for (const w of data.words as Word[]) words.push({ ...w, start: w.start + c.start, end: w.end + c.start });
    duration = Math.max(duration, c.end);
    onCredits?.(data.remaining);
    onProgress?.((i + 1) / chunks.length);
  }

  return { segments, words, duration };
}

/** Pede à IA os melhores momentos, em janelas de ~40 min para vídeos longos. */
export async function findClips(t: Transcript, prefs: Prefs, onProgress?: (p: number) => void, perHour = 8): Promise<Clip[]> {
  const WINDOW = 40 * 60;
  const windows: Segment[][] = [];
  let cur: Segment[] = [];
  let winStart = t.segments[0]?.start ?? 0;
  for (const s of t.segments) {
    if (s.start - winStart > WINDOW && cur.length) {
      windows.push(cur);
      // pequena sobreposição para não perder momentos na divisa
      cur = cur.filter((x) => x.start > s.start - 60);
      winStart = cur[0]?.start ?? s.start;
    }
    cur.push(s);
  }
  if (cur.length) windows.push(cur);

  const all: Clip[] = [];
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i];
    const span = w[w.length - 1].end - w[0].start;
    const maxClips = Math.min(20, Math.max(3, Math.round((span / 3600) * perHour)));
    const data = await withRetry(async () => {
      const res = await fetch(fnUrl("analyze"), {
        method: "POST",
        headers: { ...(await authHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: w.map((s) => ({ s: s.start, e: s.end, t: s.text })),
          minSec: prefs.minSec,
          maxSec: prefs.maxSec,
          maxClips,
        }),
      });
      return parse(res);
    });
    for (const c of data.clips as Omit<Clip, "id">[]) {
      if (all.some((o) => c.start < o.end && c.end > o.start)) continue;
      all.push({ ...snapToWords(c, t.words), id: `${Math.round(c.start * 10)}` });
    }
    onProgress?.((i + 1) / windows.length);
  }
  return all.sort((a, b) => b.score - a.score);
}

/** Ajusta início/fim para não cortar palavras no meio. */
function snapToWords<T extends { start: number; end: number }>(c: T, words: Word[]): T {
  const first = words.find((w) => w.end > c.start - 0.3);
  let last: Word | undefined;
  for (const w of words) {
    if (w.start < c.end + 0.3) last = w;
    else break;
  }
  const start = first ? Math.max(0, first.start - 0.15) : c.start;
  const end = last && last.end > start ? last.end + 0.25 : c.end;
  return { ...c, start, end };
}

/** Palavras do clipe com tempos relativos ao início dele (para a legenda). */
export function wordsForClip(words: Word[], clip: { start: number; end: number }): Word[] {
  return words
    .filter((w) => w.end > clip.start && w.start < clip.end)
    .map((w) => ({ word: w.word, start: w.start - clip.start, end: w.end - clip.start }));
}
