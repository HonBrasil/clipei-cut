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

export type Highlight = { word: string; emoji?: string | null };
export type ClipNotes = { gancho: number; emocao: number; clareza: number };

export type Clip = {
  id: string;
  start: number;
  end: number;
  title: string;
  score: number;
  reason: string;
  hook: string;
  notes?: ClipNotes; // notas da IA (0-100) que formam a nota de viralidade
  highlights?: Highlight[]; // palavras fortes (com emoji opcional) escolhidas pela IA
  post?: PostCopy; // texto do post gerado pela IA
  orig?: { start: number; end: number }; // corte original da IA (antes do ajuste manual)
};

export type PostCopy = { titulo: string; descricao: string; hashtags: string[] };

export type Prefs = {
  minSec: number;
  maxSec: number;
  count?: number | null; // quantidade escolhida (planos pagos); null = automático
};

export type Project = {
  id: string;
  createdAt: string; // ISO
  updatedAt?: string;
  video: VideoInfo;
  prefs: Prefs;
  transcript?: Transcript;
  clips?: Clip[];
  webcam?: Rect | null; // em pixels do vídeo original
  layout?: Layout;
  frameUrl?: string; // quadro de referência (data URL JPEG, salvo junto com o projeto)
  exported?: string[]; // caminhos dos clipes já exportados
};
