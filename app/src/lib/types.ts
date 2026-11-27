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

export type Layout = "cam-top" | "game-only" | "wide" | "square" | "podcast";
export type Format = "9x16" | "1x1" | "16x9";

/** Tamanho final de cada layout, em pixels. */
export function layoutSize(l: Layout): { w: number; h: number } {
  if (l === "wide") return { w: 1920, h: 1080 };
  if (l === "square") return { w: 1080, h: 1080 };
  return { w: 1080, h: 1920 };
}

/** Layout usado para exportar um formato, a partir do layout escolhido no projeto. */
export function layoutForFormat(f: Format, project: Layout, hasWebcam: boolean): Layout {
  if (f === "16x9") return "wide";
  if (f === "1x1") return "square";
  if (project === "wide" || project === "square") return hasWebcam ? "cam-top" : "game-only";
  return project;
}

/** Tamanho base da letra da legenda em cada layout. */
export function captionBase(l: Layout): number {
  return l === "wide" ? 66 : l === "square" ? 70 : 82;
}

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
  game?: { type: string; label: string; score: number }; // jogada detectada na tela dentro do clipe
  post?: PostCopy; // texto do post gerado pela IA
  orig?: { start: number; end: number }; // corte original da IA (antes do ajuste manual)
};

export type PostCopy = { titulo: string; descricao: string; hashtags: string[] };

export type Prefs = {
  minSec: number;
  maxSec: number;
  count?: number | null; // quantidade escolhida (planos pagos); null = automático
  category?: GameCategory; // tipo de vídeo (liga a detecção de jogadas)
};

export type GameCategory = "fps" | "br" | "moba" | "esportes" | "luta" | "terror" | "outros" | "conversa";
/** Jogada vista na tela pela IA (tempo no vídeo original). */
export type GameEvent = { t: number; score: number; type: string; label: string };

export type Project = {
  id: string;
  createdAt: string; // ISO
  updatedAt?: string;
  video: VideoInfo;
  prefs: Prefs;
  transcript?: Transcript;
  clips?: Clip[];
  webcam?: Rect | null; // em pixels do vídeo original
  captionPos?: "topo" | "meio" | "baixo"; // posição da legenda escolhida na tela de clipes
  gameEvents?: GameEvent[]; // jogadas vistas na tela (modo jogo)
  speakers?: [Rect, Rect] | null; // podcast: área de cada pessoa (proporção 9:8), em pixels do vídeo original
  layout?: Layout;
  frameUrl?: string; // quadro de referência (data URL JPEG, salvo junto com o projeto)
  exported?: string[]; // caminhos dos clipes já exportados
};
