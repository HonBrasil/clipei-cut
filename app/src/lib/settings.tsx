// Preferências do usuário, salvas no PC (pasta de dados do app).
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { appDataDir, join, videoDir } from "@tauri-apps/api/path";
import { exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

export type FontId = "poppins" | "bebas" | "anton" | "archivo" | "luckiest";

export const FONTS: Record<FontId, { label: string; family: string; file: string }> = {
  poppins: { label: "Poppins Extra Bold", family: "Poppins ExtraBold", file: "Poppins-ExtraBold.ttf" },
  bebas: { label: "Bebas Neue", family: "Bebas Neue", file: "BebasNeue-Regular.ttf" },
  anton: { label: "Anton", family: "Anton", file: "Anton-Regular.ttf" },
  archivo: { label: "Archivo Black", family: "Archivo Black", file: "ArchivoBlack-Regular.ttf" },
  luckiest: { label: "Luckiest Guy", family: "Luckiest Guy", file: "LuckiestGuy-Regular.ttf" },
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
    return { ...DEFAULT_SETTINGS, ...JSON.parse(await readTextFile(f)) };
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
