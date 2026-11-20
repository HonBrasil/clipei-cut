export type Rect = { x: number; y: number; w: number; h: number };

export type VideoInfo = {
  path: string;
  name: string;
  duration: number; // segundos
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
};

export type Word = { word: string; start: number; end: number };
export type Segment = { start: number; end: number; text: string };

export type Transcript = { segments: Segment[]; words: Word[]; duration: number };

export type Layout = "cam-top" | "game-only" | "wide";

export type Clip = {
  id: string;
  start: number;
  end: number;
  title: string;
  score: number;
  reason: string;
  hook: string;
};

export type Prefs = {
  minSec: number;
  maxSec: number;
};

export type Project = {
  video: VideoInfo;
  prefs: Prefs;
  transcript?: Transcript;
  clips?: Clip[];
  webcam?: Rect | null; // em pixels do vídeo original
  layout?: Layout;
  frameUrl?: string; // quadro de referência para a tela de análise
};
