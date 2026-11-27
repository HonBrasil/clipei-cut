// Análise completa de um vídeo sem depender da tela de análise (usada pela pasta automática).
// Mesmo caminho da tela: webcam → áudio → transcrição → IA. Salva o projeto a cada etapa.
import { detectWebcam } from "./detect";
import { extractAudioChunks, extractFrames } from "./ffmpeg";
import { findClips, transcribe } from "./ai";
import { detectPlays, isGame } from "./gameplay";
import { saveProject } from "./projects";
import type { Project } from "./types";

export type PipelineStep = "detect" | "audio" | "transcribe" | "gameplay" | "ai";
export const PIPELINE_LABEL: Record<PipelineStep, string> = {
  detect: "Detectando a webcam",
  audio: "Separando o áudio",
  transcribe: "Transcrevendo",
  gameplay: "Procurando jogadas na tela",
  ai: "IA escolhendo os momentos",
};

export async function analyzeInBackground(
  start: Project,
  opts: {
    language: string;
    perHour: number;
    paid: boolean;
    onProgress: (step: PipelineStep, pct: number) => void;
    onCredits: (seconds: number) => void;
  },
): Promise<Project> {
  let p = start;
  const save = async (next: Project) => {
    p = next;
    await saveProject(p);
  };
  await save(p);

  opts.onProgress("detect", 0);
  const frames = await extractFrames(p.video);
  const det = await detectWebcam(p.video, frames);
  await save({
    ...p,
    frameUrl: det.frameUrl,
    webcam: det.webcam,
    speakers: det.speakers,
    layout: det.speakers && (det.faceCam || !det.webcam) ? "podcast" : det.webcam ? "cam-top" : "game-only",
  });

  opts.onProgress("audio", 0);
  const chunks = await extractAudioChunks(p.video, (pct) => opts.onProgress("audio", pct));

  opts.onProgress("transcribe", 0);
  const transcript = await transcribe(chunks, opts.language, (pct) => opts.onProgress("transcribe", pct), opts.onCredits);
  await save({ ...p, transcript });

  let events: import("./types").GameEvent[] = [];
  if (isGame(p.prefs.category)) {
    opts.onProgress("gameplay", 0);
    events = await detectPlays(p.video, p.prefs.category!, (pct) => opts.onProgress("gameplay", pct)).catch(() => []);
    await save({ ...p, gameEvents: events });
  }
  if (transcript.words.length < 20 && !events.some((e) => e.score >= 60)) throw new Error("Quase não há fala nesse vídeo.");

  opts.onProgress("ai", 0);
  const clips = await findClips(transcript, p.prefs, (pct) => opts.onProgress("ai", pct), opts.perHour, { paid: opts.paid, events });
  await save({ ...p, clips });
  return p;
}
