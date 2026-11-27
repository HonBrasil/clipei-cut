// Preferências do usuário, salvas no PC (pasta de dados do app).
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { appDataDir, join, videoDir } from "@tauri-apps/api/path";
import { exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

export type FontId =
  | "poppins" | "bebas" | "anton" | "archivo" | "luckiest"
  | "montserrat" | "lilita" | "bangers" | "titan" | "russo" | "blackops" | "bungee" | "pressstart" | "orbitron"
  | "chakra" | "teko" | "kanit" | "rubik" | "oswald" | "marker" | "fredoka" | "righteous" | "paytone"
  | "barlow" | "nunito" | "pacifico" | "bowlby" | "passion";

export type FontCat = "populares" | "jogos" | "impacto" | "divertidas" | "estilo";
export const FONT_CATS: Array<{ id: FontCat; label: string }> = [
  { id: "populares", label: "Mais usadas" },
  { id: "jogos", label: "Jogos" },
  { id: "impacto", label: "Impacto" },
  { id: "divertidas", label: "Divertidas" },
  { id: "estilo", label: "Estilo" },
];

/** family = nome interno da fonte (o que o FFmpeg procura). scale ajusta fontes muito largas ou estreitas. */
export const FONTS: Record<FontId, { label: string; family: string; file: string; cat: FontCat; bold?: boolean; italic?: boolean; scale?: number }> = {
  // Mais usadas em cortes
  montserrat: { label: "Montserrat Black", family: "Montserrat Black", file: "Montserrat-Black.ttf", cat: "populares" },
  poppins: { label: "Poppins Extra Bold", family: "Poppins ExtraBold", file: "Poppins-ExtraBold.ttf", cat: "populares" },
  lilita: { label: "Lilita One", family: "Lilita One", file: "LilitaOne-Regular.ttf", cat: "populares", scale: 1.05 },
  bangers: { label: "Bangers", family: "Bangers", file: "Bangers-Regular.ttf", cat: "populares", scale: 1.25 },
  kanit: { label: "Kanit Itálico", family: "Kanit ExtraBold", file: "Kanit-ExtraBoldItalic.ttf", cat: "populares", italic: true, scale: 1.1 },
  rubik: { label: "Rubik Black", family: "Rubik Black", file: "Rubik-Black.ttf", cat: "populares" },
  // Jogos
  russo: { label: "Russo One", family: "Russo One", file: "RussoOne-Regular.ttf", cat: "jogos" },
  blackops: { label: "Black Ops", family: "Black Ops One", file: "BlackOpsOne-Regular.ttf", cat: "jogos", scale: 0.95 },
  bungee: { label: "Bungee", family: "Bungee", file: "Bungee-Regular.ttf", cat: "jogos", scale: 1.45 },
  orbitron: { label: "Orbitron", family: "Orbitron Black", file: "Orbitron-Black.ttf", cat: "jogos", scale: 0.82 },
  chakra: { label: "Chakra Petch", family: "Chakra Petch", file: "ChakraPetch-Bold.ttf", cat: "jogos", bold: true, scale: 1.2 },
  pressstart: { label: "Press Start (pixel)", family: "Press Start 2P", file: "PressStart2P-Regular.ttf", cat: "jogos", scale: 0.58 },
  teko: { label: "Teko", family: "Teko", file: "Teko-Bold.ttf", cat: "jogos", bold: true, scale: 1.3 },
  // Impacto
  anton: { label: "Anton", family: "Anton", file: "Anton-Regular.ttf", cat: "impacto", scale: 1.15 },
  bebas: { label: "Bebas Neue", family: "Bebas Neue", file: "BebasNeue-Regular.ttf", cat: "impacto", scale: 1.2 },
  oswald: { label: "Oswald", family: "Oswald", file: "Oswald-Bold.ttf", cat: "impacto", bold: true, scale: 1.08 },
  barlow: { label: "Barlow Condensed", family: "Barlow Condensed ExtraBold", file: "BarlowCondensed-ExtraBold.ttf", cat: "impacto", scale: 1.15 },
  archivo: { label: "Archivo Black", family: "Archivo Black", file: "ArchivoBlack-Regular.ttf", cat: "impacto", scale: 0.95 },
  bowlby: { label: "Bowlby One", family: "Bowlby One SC", file: "BowlbyOneSC-Regular.ttf", cat: "impacto", scale: 0.85 },
  passion: { label: "Passion One", family: "Passion One", file: "PassionOne-Bold.ttf", cat: "impacto", bold: true, scale: 1.15 },
  // Divertidas
  luckiest: { label: "Luckiest Guy", family: "Luckiest Guy", file: "LuckiestGuy-Regular.ttf", cat: "divertidas" },
  titan: { label: "Titan One", family: "Titan One", file: "TitanOne-Regular.ttf", cat: "divertidas", scale: 0.95 },
  fredoka: { label: "Fredoka", family: "Fredoka", file: "Fredoka-Bold.ttf", cat: "divertidas", bold: true, scale: 1.05 },
  paytone: { label: "Paytone One", family: "Paytone One", file: "PaytoneOne-Regular.ttf", cat: "divertidas" },
  nunito: { label: "Nunito Black", family: "Nunito Black", file: "Nunito-Black.ttf", cat: "divertidas", scale: 1.05 },
  // Estilo
  righteous: { label: "Righteous", family: "Righteous", file: "Righteous-Regular.ttf", cat: "estilo", scale: 1.02 },
  marker: { label: "Permanent Marker", family: "Permanent Marker", file: "PermanentMarker-Regular.ttf", cat: "estilo" },
  pacifico: { label: "Pacifico", family: "Pacifico", file: "Pacifico-Regular.ttf", cat: "estilo", scale: 1.2 },
};

export type CaptionAnim = "palavra" | "pop" | "digitacao" | "frase";
export type CaptionPos = "topo" | "meio" | "baixo";

export type CaptionModel = {
  id: string;
  name: string;
  builtin?: boolean;
  font: FontId;
  size: number; // % (70–140)
  base: string; // cor do texto
  highlight: string; // cor da palavra falada
  outline: boolean;
  box: boolean; // fundo escuro atrás da frase
  uppercase: boolean;
  anim: CaptionAnim;
  position: CaptionPos;
  brand: string; // "@seucanal" (vazio = não mostra)
};

export const BUILTIN_MODELS: CaptionModel[] = [
  { id: "destaque", name: "Destaque Clipei", builtin: true, font: "poppins", size: 100, base: "#FFFFFF", highlight: "#FF3B4A", outline: true, box: false, uppercase: true, anim: "palavra", position: "meio", brand: "" },
  { id: "amarelo", name: "Amarelo clássico", builtin: true, font: "poppins", size: 100, base: "#FFFFFF", highlight: "#FFD400", outline: true, box: false, uppercase: true, anim: "pop", position: "meio", brand: "" },
  { id: "neon", name: "Neon gamer", builtin: true, font: "archivo", size: 95, base: "#FFFFFF", highlight: "#5EEAD4", outline: true, box: false, uppercase: true, anim: "palavra", position: "meio", brand: "" },
  { id: "podcast", name: "Podcast limpo", builtin: true, font: "poppins", size: 85, base: "#FFFFFF", highlight: "#FFFFFF", outline: false, box: true, uppercase: false, anim: "frase", position: "baixo", brand: "" },
  { id: "impacto", name: "Impacto", builtin: true, font: "anton", size: 115, base: "#FFFFFF", highlight: "#FF3B4A", outline: true, box: false, uppercase: true, anim: "pop", position: "meio", brand: "" },
  { id: "divertido", name: "Divertido", builtin: true, font: "luckiest", size: 100, base: "#FFFFFF", highlight: "#B9A3FF", outline: true, box: false, uppercase: true, anim: "digitacao", position: "meio", brand: "" },
  { id: "viral", name: "Viral Montserrat", builtin: true, font: "montserrat", size: 100, base: "#FFFFFF", highlight: "#FFD400", outline: true, box: false, uppercase: true, anim: "pop", position: "meio", brand: "" },
  { id: "fps", name: "FPS tático", builtin: true, font: "blackops", size: 100, base: "#FFFFFF", highlight: "#4ADE80", outline: true, box: false, uppercase: true, anim: "palavra", position: "meio", brand: "" },
  { id: "pixel", name: "Pixel retrô", builtin: true, font: "pressstart", size: 100, base: "#FFFFFF", highlight: "#5EEAD4", outline: true, box: false, uppercase: true, anim: "digitacao", position: "meio", brand: "" },
  { id: "quadrinhos", name: "Quadrinhos", builtin: true, font: "bangers", size: 105, base: "#FFFFFF", highlight: "#FFD400", outline: true, box: false, uppercase: true, anim: "pop", position: "meio", brand: "" },
  { id: "jogo", name: "Jogo colorido", builtin: true, font: "lilita", size: 100, base: "#FFFFFF", highlight: "#FF8A00", outline: true, box: false, uppercase: true, anim: "pop", position: "meio", brand: "" },
  { id: "estilo", name: "Itálico estiloso", builtin: true, font: "kanit", size: 100, base: "#FFFFFF", highlight: "#FF3B4A", outline: true, box: false, uppercase: true, anim: "palavra", position: "meio", brand: "" },
  { id: "futuro", name: "Futurista", builtin: true, font: "orbitron", size: 100, base: "#FFFFFF", highlight: "#B9A3FF", outline: true, box: false, uppercase: true, anim: "palavra", position: "meio", brand: "" },
];

export type Quality = "1080p60" | "1080p30" | "720p30";
export type FileNaming = "titulo" | "data-titulo" | "projeto-numero";
export type ClipsAmount = "poucos" | "equilibrado" | "muitos";

export type Settings = {
  captionModelId: string;
  customModels: CaptionModel[];
  exportDir: string | null; // null = Vídeos\Clipei Cut
  quality: Quality;
  useGpu: boolean;
  fileNaming: FileNaming;
  openFolderWhenDone: boolean;
  language: "pt" | "auto" | "en" | "es";
  clipsAmount: ClipsAmount;
  censor: boolean;
  autoUpdate: boolean;
  tourDone: boolean;
  fx: { cutSilences: boolean; cutFillers: boolean; emojis: boolean; keywords: boolean; zoom: boolean };
  formats: Array<"9x16" | "1x1" | "16x9">; // formatos exportados de uma vez
  brand: BrandKit;
  watch: WatchSettings;
  covers: boolean; // gerar capa junto com cada vídeo (planos pagos)
  category: "fps" | "br" | "moba" | "esportes" | "luta" | "terror" | "outros" | "conversa"; // último tipo de vídeo escolhido
};

export type WatchSettings = {
  on: boolean;
  folder: string | null;
  mode: "perguntar" | "automatico"; // pergunta antes de gastar horas, ou analisa sozinho
  maxHours: number; // no automático, vídeos maiores que isso pedem confirmação
  dur: 0 | 1 | 2; // 15–30 s, 30–60 s, 60–90 s
};
export const DEFAULT_WATCH: WatchSettings = { on: false, folder: null, mode: "perguntar", maxHours: 3, dur: 1 };

export type LogoPos = "tl" | "tr" | "bl" | "br";
export type BrandKit = {
  on: boolean;
  logo: string | null; // caminho da logo copiada para a pasta do app
  logoAspect: number; // largura / altura da imagem
  logoPos: LogoPos;
  logoSize: number; // % da largura do vídeo (8 a 30)
  logoOpacity: number; // 30 a 100
  color: string; // cor principal da marca
  textColor: string;
  captionColor: boolean; // usa a cor da marca no destaque da legenda
  cta: { on: boolean; text: string; seconds: number };
};

export const DEFAULT_BRAND: BrandKit = {
  on: true,
  logo: null,
  logoAspect: 1,
  logoPos: "tr",
  logoSize: 16,
  logoOpacity: 90,
  color: "#E3121F",
  textColor: "#FFFFFF",
  captionColor: false,
  cta: { on: true, text: "Siga para mais!", seconds: 3 },
};

export const DEFAULT_SETTINGS: Settings = {
  captionModelId: "destaque",
  customModels: [],
  exportDir: null,
  quality: "1080p60",
  useGpu: true,
  fileNaming: "titulo",
  openFolderWhenDone: false,
  language: "pt",
  clipsAmount: "equilibrado",
  censor: false,
  autoUpdate: true,
  tourDone: false,
  fx: { cutSilences: true, cutFillers: true, emojis: true, keywords: true, zoom: true },
  formats: ["9x16"],
  brand: DEFAULT_BRAND,
  watch: DEFAULT_WATCH,
  covers: true,
  category: "outros",
};

export function allModels(s: Settings): CaptionModel[] {
  return [...BUILTIN_MODELS, ...s.customModels];
}

export function currentModel(s: Settings): CaptionModel {
  return allModels(s).find((m) => m.id === s.captionModelId) ?? BUILTIN_MODELS[0];
}

export async function defaultExportDir(): Promise<string> {
  return join(await videoDir(), "Clipei Cut");
}

export async function exportDirOf(s: Settings): Promise<string> {
  return s.exportDir ?? (await defaultExportDir());
}

async function file(): Promise<string> {
  const dir = await appDataDir();
  if (!(await exists(dir))) await mkdir(dir, { recursive: true });
  return join(dir, "settings.json");
}

async function load(): Promise<Settings> {
  try {
    const f = await file();
    if (!(await exists(f))) return DEFAULT_SETTINGS;
    const saved = JSON.parse(await readTextFile(f));
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      fx: { ...DEFAULT_SETTINGS.fx, ...saved.fx },
      brand: { ...DEFAULT_BRAND, ...saved.brand, cta: { ...DEFAULT_BRAND.cta, ...saved.brand?.cta } },
      watch: { ...DEFAULT_WATCH, ...saved.watch },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

type Ctx = { settings: Settings; update: (patch: Partial<Settings>) => void; loaded: boolean };
const SettingsCtx = createContext<Ctx>({ settings: DEFAULT_SETTINGS, update: () => {}, loaded: false });

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    load().then((s) => {
      setSettings(s);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(async () => {
      try {
        await writeTextFile(await file(), JSON.stringify(settings, null, 2));
      } catch (e) {
        console.error("Não consegui salvar as configurações", e);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [settings, loaded]);

  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);

  return <SettingsCtx.Provider value={{ settings, update, loaded }}>{children}</SettingsCtx.Provider>;
}

export function useSettings(): Ctx {
  return useContext(SettingsCtx);
}
