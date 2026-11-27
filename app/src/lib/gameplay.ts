// Detecção de jogadas: o PC acha os momentos candidatos (picos de áudio e mudanças bruscas de
// imagem, sem custo) e só esses momentos vão para a IA de visão, que diz se houve jogada.
import { convertFileSrc } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { run, workDir } from "./ffmpeg";
import { authHeaders, fnUrl, parse } from "./ai";
import type { GameCategory, GameEvent, VideoInfo } from "./types";

export const GAME_CATS: Array<{ id: GameCategory; label: string; icon: string; hint: string }> = [
  { id: "fps", label: "FPS", icon: "🎯", hint: "Valorant, CS2, CoD, Overwatch" },
  { id: "br", label: "Battle Royale", icon: "🪂", hint: "Fortnite, Free Fire, Warzone, PUBG" },
  { id: "moba", label: "MOBA", icon: "🛡️", hint: "LoL, Dota 2, Wild Rift, Mobile Legends" },
  { id: "esportes", label: "Esportes", icon: "⚽", hint: "EA FC, NBA 2K, Rocket League, corrida" },
  { id: "luta", label: "Luta", icon: "🥊", hint: "Street Fighter, Tekken, Mortal Kombat" },
  { id: "terror", label: "Terror", icon: "👻", hint: "Jogos de susto e suspense" },
  { id: "outros", label: "Outros jogos", icon: "🎮", hint: "Minecraft, GTA, aventura, qualquer jogo" },
  { id: "conversa", label: "Conversa / IRL", icon: "🎙️", hint: "Podcast, react, bate-papo (só a fala)" },
];

export const isGame = (c: GameCategory | undefined) => !!c && c !== "conversa";

// ---------- 1. Energia do áudio (1 valor por segundo, em dB) ----------
export async function audioEnergy(video: VideoInfo): Promise<number[]> {
  if (!video.hasAudio) return [];
  const r = await run("ffmpeg", [
    "-hide_banner", "-nostats", "-i", video.path, "-vn", "-ac", "1",
    "-af", "aresample=8000,asetnsamples=n=8000,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-",
    "-f", "null", "-",
  ]);
  const out: number[] = [];
  let t = 0;
  for (const line of r.stdout.split(/\r?\n/)) {
    const pt = /pts_time:([\d.]+)/.exec(line);
    if (pt) t = Math.round(Number(pt[1]));
    const db = /RMS_level=(-?[\d.]+|-inf)/.exec(line);
    if (db) out[t] = db[1] === "-inf" ? -90 : Math.max(-90, Number(db[1]));
  }
  for (let i = 0; i < out.length; i++) if (out[i] === undefined) out[i] = -90;
  return out;
}

// ---------- 2. Mudanças bruscas de imagem (só quadros-chave: rápido) ----------
export async function sceneChanges(video: VideoInfo): Promise<Array<{ t: number; s: number }>> {
  const r = await run("ffmpeg", [
    "-hide_banner", "-nostats", "-skip_frame", "nokey", "-i", video.path, "-an",
    "-vf", "scale=160:-2,select='gt(scene,0.1)',metadata=print:file=-",
    "-f", "null", "-",
  ]);
  const out: Array<{ t: number; s: number }> = [];
  let t = -1;
  for (const line of r.stdout.split(/\r?\n/)) {
    const pt = /pts_time:([\d.]+)/.exec(line);
    if (pt) t = Number(pt[1]);
    const sc = /scene_score=([\d.]+)/.exec(line);
    if (sc && t >= 0) out.push({ t, s: Number(sc[1]) });
  }
  return out;
}

// ---------- 3. Momentos candidatos ----------
const WEIGHTS: Record<GameCategory, { audio: number; scene: number }> = {
  fps: { audio: 1, scene: 0.8 },
  br: { audio: 1, scene: 0.8 },
  moba: { audio: 0.8, scene: 1 },
  esportes: { audio: 1.2, scene: 0.6 },
  luta: { audio: 0.8, scene: 1 },
  terror: { audio: 1.4, scene: 0.7 },
  outros: { audio: 1, scene: 0.8 },
  conversa: { audio: 1, scene: 0 },
};

export function pickCandidates(energy: number[], scenes: Array<{ t: number; s: number }>, duration: number, cat: GameCategory): number[] {
  const w = WEIGHTS[cat];
  const score = new Map<number, number>();
  const add = (t: number, v: number) => {
    const k = Math.max(0, Math.min(Math.floor(duration), Math.round(t)));
    score.set(k, (score.get(k) ?? 0) + v);
  };
  // Picos de áudio: bem acima do volume normal daquele trecho (mediana de ±30 s)
  for (let i = 0; i < energy.length; i++) {
    const win = energy.slice(Math.max(0, i - 30), i + 31).filter((x) => x > -80).sort((a, b) => a - b);
    if (!win.length) continue;
    const med = win[Math.floor(win.length / 2)];
    const jump = energy[i] - med;
    if (jump > 7 && energy[i] > -38) add(i, jump * w.audio);
  }
  for (const s of scenes) add(s.t, s.s * 25 * w.scene);

  // Junta o que está a menos de 6 s e escolhe os melhores, espaçados
  const perHour = 45;
  const max = Math.min(140, Math.max(10, Math.ceil((duration / 3600) * perHour)));
  const ranked = [...score.entries()]
    .map(([t, v]) => ({ t, v: v + [...score.entries()].filter(([u]) => u !== t && Math.abs(u - t) <= 6).reduce((n, [, x]) => n + x * 0.5, 0) }))
    .sort((a, b) => b.v - a.v);
  const chosen: number[] = [];
  for (const c of ranked) {
    if (chosen.length >= max) break;
    if (chosen.some((t) => Math.abs(t - c.t) < 12)) continue;
    chosen.push(c.t);
  }
  return chosen.sort((a, b) => a - b);
}

// ---------- 4. Quadros para a IA (3 imagens pequenas lado a lado: antes, no momento, depois) ----------
async function sheet(video: VideoInfo, t: number, dir: string, i: number): Promise<string | null> {
  const file = `cand_${i}.jpg`;
  const from = Math.max(0, t - 1.5);
  const r = await run(
    "ffmpeg",
    ["-y", "-hide_banner", "-loglevel", "error", "-ss", from.toFixed(2), "-t", "4.6", "-i", video.path, "-an", "-vf", "fps=1/1.5,scale=320:-2,tile=3x1", "-frames:v", "1", "-q:v", "6", file],
    dir,
  );
  if (r.code !== 0) return null;
  return join(dir, file);
}

async function toBase64(path: string): Promise<string> {
  const blob = await (await fetch(convertFileSrc(path))).blob();
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

// ---------- Tudo junto ----------
export async function detectPlays(video: VideoInfo, cat: GameCategory, onProgress?: (p: number) => void): Promise<GameEvent[]> {
  if (!isGame(cat)) return [];
  onProgress?.(0.02);
  const [energy, scenes] = await Promise.all([audioEnergy(video).catch(() => []), sceneChanges(video).catch(() => [])]);
  onProgress?.(0.25);
  const cands = pickCandidates(energy, scenes, video.duration, cat);
  if (!cands.length) return [];

  const dir = await workDir("gameplay");
  const events: GameEvent[] = [];
  const BATCH = 8;
  for (let b = 0; b < cands.length; b += BATCH) {
    const group = cands.slice(b, b + BATCH);
    const frames: Array<{ t: number; img: string }> = [];
    for (let k = 0; k < group.length; k++) {
      const p = await sheet(video, group[k], dir, b + k);
      if (p) frames.push({ t: group[k], img: await toBase64(p) });
    }
    if (frames.length) {
      try {
        const res = await fetch(fnUrl("vision"), {
          method: "POST",
          headers: { ...(await authHeaders()), "Content-Type": "application/json" },
          body: JSON.stringify({ category: cat, frames }),
        });
        const data = (await parse(res)) as { events: GameEvent[] };
        events.push(...(data.events ?? []));
      } catch (e) {
        // limite diário ou falha: segue só com a fala
        console.warn("visão", e);
        if (String(e).includes("limite")) break;
      }
    }
    onProgress?.(0.25 + 0.75 * Math.min(1, (b + BATCH) / cands.length));
  }
  return events.filter((e) => e.score >= 40).sort((a, b) => a.t - b.t);
}
