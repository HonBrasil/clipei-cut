// Comandos nativos (Rust) do Clipei Cut.
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { resolveResource } from "@tauri-apps/api/path";
import { FONTS, type FontId } from "./settings";

export type VideoFile = { path: string; name: string; folder: string; size: number; modifiedMs: number };

export const ensureDir = (path: string) => invoke<void>("ensure_dir", { path });
export const listVideos = (dir: string) => invoke<VideoFile[]>("list_videos", { dir });
export const freeSpace = (path: string) => invoke<number>("free_space", { path });
export const tempSize = () => invoke<number>("temp_size");
export const clearTemp = () => invoke<void>("clear_temp");
export const prepareFonts = (dst: string) => invoke<void>("prepare_fonts", { dst });
export const openPath = (path: string) => invoke<void>("open_path", { path });
export const revealPath = (path: string) => invoke<void>("reveal_path", { path });

export function fmtBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

let fontsLoaded: Promise<void> | null = null;

/** Carrega as fontes das legendas na interface, para a prévia ficar igual ao vídeo. */
export function loadCaptionFonts(): Promise<void> {
  if (!fontsLoaded) {
    fontsLoaded = (async () => {
      for (const id of Object.keys(FONTS) as FontId[]) {
        const f = FONTS[id];
        try {
          const url = convertFileSrc(await resolveResource(`fonts/${f.file}`));
          const face = new FontFace(`clipei-${id}`, `url("${url}")`);
          await face.load();
          document.fonts.add(face);
        } catch (e) {
          console.warn("Fonte não carregada", f.label, e);
        }
      }
    })();
  }
  return fontsLoaded;
}
