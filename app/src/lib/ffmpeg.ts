// Tudo que mexe em vídeo roda localmente com o FFmpeg empacotado no app.
import { Command } from "@tauri-apps/plugin-shell";
import { readTextFile, mkdir, remove, exists } from "@tauri-apps/plugin-fs";
import { appCacheDir, join } from "@tauri-apps/api/path";
import type { Clip, Layout, Rect, VideoInfo } from "./types";
import type { Quality } from "./settings";

type RunResult = { code: number | null; stdout: string; stderr: string };

async function run(bin: "ffmpeg" | "ffprobe", args: string[], cwd?: string): Promise<RunResult> {
  const out = await Command.sidecar(`binaries/${bin}`, args, cwd ? { cwd } : undefined).execute();
  return { code: out.code, stdout: out.stdout, stderr: out.stderr };
}

/** Roda o FFmpeg reportando o progresso (0 a 1) com base na duração esperada. */
async function runWithProgress(
  args: string[],
  expectedSec: number,
  onProgress?: (p: number) => void,
  cwd?: string,
): Promise<void> {
  const cmd = Command.sidecar("binaries/ffmpeg", ["-hide_banner", "-nostats", "-progress", "pipe:1", ...args], cwd ? { cwd } : undefined);
  let errTail = "";
  await new Promise<void>((resolve, reject) => {
    cmd.stdout.on("data", (line: string) => {
      const m = /^out_time_us=(\d+)/.exec(line.trim()) ?? /^out_time_ms=(\d+)/.exec(line.trim());
      if (m && onProgress && expectedSec > 0) onProgress(Math.min(1, Number(m[1]) / 1e6 / expectedSec));
    });
    cmd.stderr.on("data", (line: string) => {
      errTail = (errTail + "\n" + line).slice(-4000);
    });
    cmd.on("close", ({ code }) => {
      if (code === 0) {
        onProgress?.(1);
        resolve();
      } else {
        console.error(errTail);
        reject(new Error(`O FFmpeg falhou (código ${code}). ${lastLine(errTail)}`));
      }
    });
    cmd.on("error", (e) => reject(new Error(String(e))));
    cmd.spawn().catch(reject);
  });
}

function lastLine(s: string): string {
  return s.trim().split("\n").filter(Boolean).slice(-1)[0] ?? "";
}

export async function workDir(name: string): Promise<string> {
  const base = await appCacheDir();
  const dir = await join(base, name);
  if (await exists(dir)) await remove(dir, { recursive: true });
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function probe(path: string): Promise<VideoInfo> {
  const r = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", path]);
  if (r.code !== 0) throw new Error("Não consegui ler esse vídeo. O arquivo pode estar corrompido ou em um formato não suportado.");
  const data = JSON.parse(r.stdout);
  const streams = (data.streams ?? []) as Array<Record<string, unknown>>;
  const v = streams.find((s) => s.codec_type === "video");
  const a = streams.find((s) => s.codec_type === "audio");
  if (!v) throw new Error("Esse arquivo não tem imagem de vídeo.");
  const [num, den] = String(v.avg_frame_rate ?? "30/1").split("/").map(Number);
  const name = path.split(/[\\/]/).pop() ?? "video";
  return {
    path,
    name,
    duration: Number(data.format?.duration ?? v.duration ?? 0),
    width: Number(v.width),
    height: Number(v.height),
    fps: den ? num / den : 30,
    hasAudio: Boolean(a),
  };
}

export type AudioChunk = { path: string; start: number; end: number };

/**
 * Extrai só o áudio (mono, 16 kHz, Opus 24 kbps) em pedaços de 10 minutos.
 * Uma live de 3 h vira ~30 MB no total — é isso que vai para a IA, nunca o vídeo.
 */
export async function extractAudioChunks(
  video: VideoInfo,
  onProgress?: (p: number) => void,
  chunkSec = 600,
): Promise<AudioChunk[]> {
  const dir = await workDir("audio");
  await runWithProgress(
    [
      "-y", "-i", video.path, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libopus", "-b:a", "24k",
      "-f", "segment", "-segment_time", String(chunkSec), "-reset_timestamps", "1",
      "-segment_list", "list.csv", "-segment_list_type", "csv",
      "chunk_%03d.ogg",
    ],
    video.duration,
    onProgress,
    dir,
  );
  const csv = await readTextFile(await join(dir, "list.csv"));
  const chunks: AudioChunk[] = [];
  for (const line of csv.split(/\r?\n/)) {
    const [file, s, e] = line.split(",");
    if (!file || !e) continue;
    chunks.push({ path: await join(dir, file), start: Number(s), end: Number(e) });
  }
  return chunks;
}

/** Tira alguns quadros espalhados pelo vídeo para detectar a webcam. */
export async function extractFrames(video: VideoInfo, count = 8): Promise<string[]> {
  const dir = await workDir("frames");
  const paths: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = (video.duration * (i + 1)) / (count + 1);
    const file = `frame_${i}.jpg`;
    const r = await run(
      "ffmpeg",
      ["-y", "-hide_banner", "-loglevel", "error", "-ss", t.toFixed(2), "-i", video.path, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "3", file],
      dir,
    );
    if (r.code === 0) paths.push(await join(dir, file));
  }
  if (paths.length === 0) throw new Error("Não consegui tirar imagens do vídeo.");
  return paths;
}

// ---------- Exportação ----------

export type Encoder = "h264_nvenc" | "h264_qsv" | "h264_amf" | "libx264";

const ENCODER_KEY = "clipei-encoder";

/** Descobre a placa de vídeo uma vez e guarda o resultado. */
export async function detectEncoder(useGpu = true, force = false): Promise<Encoder> {
  if (!useGpu) return "libx264";
  if (force) localStorage.removeItem(ENCODER_KEY);
  const cached = localStorage.getItem(ENCODER_KEY) as Encoder | null;
  if (cached) return cached;
  for (const enc of ["h264_nvenc", "h264_qsv", "h264_amf"] as Encoder[]) {
    const r = await run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=640x360:d=0.2",
      "-c:v", enc, "-f", "null", "-",
    ]);
    if (r.code === 0) {
      localStorage.setItem(ENCODER_KEY, enc);
      return enc;
    }
  }
  localStorage.setItem(ENCODER_KEY, "libx264");
  return "libx264";
}

export function encoderLabel(e: Encoder): string {
  return { h264_nvenc: "Placa NVIDIA", h264_qsv: "Intel Quick Sync", h264_amf: "Placa AMD", libx264: "Processador (CPU)" }[e];
}

function encoderArgs(e: Encoder): string[] {
  switch (e) {
    case "h264_nvenc":
      return ["-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", "21", "-b:v", "0", "-pix_fmt", "yuv420p"];
    case "h264_qsv":
      return ["-c:v", "h264_qsv", "-global_quality", "22"];
    case "h264_amf":
      return ["-c:v", "h264_amf", "-quality", "balanced", "-rc", "cqp", "-qp_i", "20", "-qp_p", "22"];
    default:
      return ["-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p"];
  }
}

const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);

export type EmojiOverlay = { file: string; start: number; end: number; x: number; y: number; size: number };
export type Effects = {
  keeps?: Array<[number, number]>; // trechos mantidos (cortes de silêncio/vícios), relativos ao clipe
  zoom?: Array<[number, number]>; // momentos de zoom (linha do tempo final)
  zoomExpr?: string; // curva de zoom pronta (expressão do FFmpeg)
  emojis?: EmojiOverlay[]; // emojis por cima do vídeo (linha do tempo final)
};

/** Monta o filtro de imagem para cada layout. Saída 1080x1920 (vertical) ou 1920x1080. */
export function buildFilter(
  video: VideoInfo,
  layout: Layout,
  webcam: Rect | null | undefined,
  assFile: string | null,
  quality: Quality = "1080p60",
  fx: Effects = {},
): string {
  const W = video.width;
  const H = video.height;
  const fps = quality === "1080p60" ? (video.fps > 60.5 ? ",fps=60" : "") : video.fps > 30.5 ? ",fps=30" : "";
  const down = quality === "720p30" ? (layout === "wide" ? ",scale=1280:720" : ",scale=720:1280") : "";

  // Cortes: mantém só os trechos escolhidos e junta tudo sem buracos
  const cut = fx.keeps && fx.keeps.length > 0;
  const src = cut ? `[0:v]select=${selectFrom(fx.keeps!)},setpts=N/(FRAME_RATE*TB),` : "[0:v]";
  // Zoom dinâmico (aproxima o centro da imagem nos momentos fortes)
  const zr = (fx.zoom?.length ?? 0) > 0 && fx.zoomExpr ? (fx.zoomExpr as string) : null;
  const zoom = (w: number, h: number) =>
    zr ? `,zoompan=z=${zr}:x=iw/2-(iw/zoom/2):y=ih/2-(ih/zoom/2):d=1:s=${w}x${h}:fps=${video.fps.toFixed(3)}` : "";

  let base: string;
  if (layout === "wide") {
    base = `${src}scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1${zoom(1920, 1080)}[base]`;
  } else if (layout === "cam-top" && webcam) {
    const cw = even(Math.min(webcam.w, W));
    const ch = even(Math.min(webcam.h, H));
    const cx = even(Math.max(0, Math.min(W - cw, webcam.x)));
    const cy = even(Math.max(0, Math.min(H - ch, webcam.y)));
    const gh = H;
    const gw = even(Math.min(W, gh * (1080 / 1200)));
    const gx = even((W - gw) / 2);
    // No layout com webcam, o zoom vai no rosto (reação), não no jogo
    base =
      `${src}split=2[c][g];` +
      `[c]crop=${cw}:${ch}:${cx}:${cy},scale=1080:720:force_original_aspect_ratio=increase,crop=1080:720,setsar=1${zoom(1080, 720)}[cam];` +
      `[g]crop=${gw}:${gh}:${gx}:0,scale=1080:1200:force_original_aspect_ratio=increase,crop=1080:1200,setsar=1${zr ? `,fps=${video.fps.toFixed(3)}` : ""}[game];` +
      `[cam][game]vstack=inputs=2[base]`;
  } else {
    // Só gameplay (ou cam-top sem webcam detectada): recorte central 9:16
    const gw = even(Math.min(W, H * (9 / 16)));
    const gx = even((W - gw) / 2);
    base = `${src}crop=${gw}:${H}:${gx}:0,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1${zoom(1080, 1920)}[base]`;
  }

  // Legenda (fontes copiadas para a pasta "fonts" ao lado do .ass)
  let chain = base;
  let cur = "[base]";
  if (assFile) {
    chain += `;${cur}subtitles=${assFile}:fontsdir=fonts[sb]`;
    cur = "[sb]";
  }
  // Emojis por cima da legenda (entradas 1, 2, 3… depois do vídeo)
  (fx.emojis ?? []).forEach((e, i) => {
    chain +=
      `;[${i + 1}:v]scale=${e.size}:${e.size}[em${i}]` +
      `;${cur}[em${i}]overlay=x=${Math.round(e.x)}:y=${Math.round(e.y)}:enable=between(t\\,${e.start.toFixed(2)}\\,${e.end.toFixed(2)})[o${i}]`;
    cur = `[o${i}]`;
  });
  chain += `;${cur}null${down}${fps}[v]`;
  return chain;
}

function selectFrom(keeps: Array<[number, number]>): string {
  return keeps.map(([a, b]) => `between(t\\,${a.toFixed(3)}\\,${b.toFixed(3)})`).join("+");
}

export async function exportClip(opts: {
  video: VideoInfo;
  clip: Clip;
  layout: Layout;
  webcam: Rect | null | undefined;
  workDir: string; // onde está o arquivo .ass (relativo)
  assFile: string | null;
  outPath: string;
  encoder: Encoder;
  quality?: Quality;
  beeps?: Array<[number, number]>; // trechos para bipar (linha do tempo final)
  fx?: Effects;
  onProgress?: (p: number) => void;
}): Promise<void> {
  const { video, clip, layout, webcam, assFile, outPath, encoder, onProgress } = opts;
  const len = clip.end - clip.start;
  const fx = opts.fx ?? {};
  const cut = fx.keeps && fx.keeps.length > 0;
  const outLen = cut ? fx.keeps!.reduce((n, [a, b]) => n + (b - a), 0) : len;
  let filter = buildFilter(video, layout, webcam, assFile, opts.quality, fx);
  let audioMap = ["-map", "0:a:0?"];
  if (video.hasAudio) {
    let aIn = "[0:a:0]";
    if (cut) {
      filter += `;[0:a:0]aselect=${selectFrom(fx.keeps!)},asetpts=N/SR/TB[ak]`;
      aIn = "[ak]";
      audioMap = ["-map", "[ak]"];
    }
    if (opts.beeps?.length) {
      filter += ";" + beepFilter(opts.beeps, outLen, aIn);
      audioMap = ["-map", "[a]"];
    }
  }
  const emojiInputs = (fx.emojis ?? []).flatMap((e) => ["-i", e.file]);
  const args = [
    "-y",
    "-ss", clip.start.toFixed(3), "-t", len.toFixed(3), "-i", video.path,
    ...emojiInputs,
    "-filter_complex", filter, "-map", "[v]",
    ...(video.hasAudio ? [...audioMap, "-c:a", "aac", "-b:a", "160k"] : []),
    ...encoderArgs(encoder),
    "-movflags", "+faststart",
    outPath,
  ];
  try {
    await runWithProgress(args, outLen, onProgress, opts.workDir);
  } catch (err) {
    // Se a placa de vídeo falhar, tenta de novo pelo processador
    if (encoder !== "libx264") {
      localStorage.setItem(ENCODER_KEY, "libx264");
      await exportClip({ ...opts, encoder: "libx264" });
      return;
    }
    throw err;
  }
}

/** Silencia os palavrões e coloca um bip no lugar. */
export function beepFilter(beeps: Array<[number, number]>, len: number, input = "[0:a:0]"): string {
  const expr = beeps.map(([a, b]) => `between(t,${a.toFixed(2)},${b.toFixed(2)})`).join("+");
  return (
    `${input}volume=0:enable='${expr}'[am];` +
    `sine=frequency=1000:sample_rate=48000:duration=${len.toFixed(2)},volume=0.18,volume=0:enable='not(${expr})'[bp];` +
    `[am][bp]amix=inputs=2:duration=first:normalize=0[a]`
  );
}
