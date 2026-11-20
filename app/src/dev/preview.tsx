// Só para desenvolvimento: mostra as telas no navegador, sem o Tauri.
// Abrir com: npm run dev -> http://localhost:1420/preview.html?s=captions
import { createRoot } from "react-dom/client";
import { mockIPC, mockConvertFileSrc } from "@tauri-apps/api/mocks";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "../styles.css";
import { SettingsProvider, FONTS, type FontId } from "../lib/settings";
import { Sidebar, type Screen } from "../components/Sidebar";
import { Captions } from "../screens/Captions";
import { Exports } from "../screens/Exports";
import { Config } from "../screens/Config";

mockConvertFileSrc("windows");
const day = 86_400_000;
mockIPC((cmd, args: any) => {
  if (cmd === "plugin:path|resolve_directory") return "C:\\Users\\Voce\\Videos";
  if (cmd === "plugin:path|join") return (args.paths as string[]).join("\\");
  if (cmd === "plugin:path|resolve_resource") return args.path;
  if (cmd === "plugin:fs|exists") return false;
  if (cmd === "plugin:app|version") return "0.1.7";
  if (cmd === "plugin:updater|check") return null;
  if (cmd === "list_videos")
    return ["clutch-1v4-ultimo-round", "a-call-que-salvou", "dica-rapida-de-mira", "historia-do-campeonato", "tutorial-obs"].map((n, i) => ({
      path: `C:\\x\\${n}.mp4`, name: `0${i + 1}-${n}_9x16.mp4`, folder: i < 3 ? "live-sexta-ranked" : "podcast-ep-08", size: (30 + i * 9) * 1024 * 1024, modifiedMs: Date.now() - i * 2 * day,
    }));
  if (cmd === "free_space") return 412 * 1024 ** 3;
  if (cmd === "temp_size") return 318 * 1024 ** 2;
  return null;
});

// Fontes das legendas servidas pelo Vite direto da pasta de recursos
const base = "/src-tauri/resources/fonts/";
for (const id of Object.keys(FONTS) as FontId[]) {
  const f = new FontFace(`clipei-${id}`, `url("${base}${FONTS[id].file}")`);
  f.load().then((x) => document.fonts.add(x)).catch(() => {});
}

const s = (new URLSearchParams(location.search).get("s") ?? "captions") as Screen;
createRoot(document.getElementById("root")!).render(
  <SettingsProvider>
    <div className="shell">
      <Sidebar screen={s} credits={2280} onNavigate={(n) => (location.search = `?s=${n}`)} onLogout={() => {}} />
      <main className="main">
        {s === "captions" && <Captions />}
        {s === "exports" && <Exports />}
        {s === "settings" && <Config email="voce@clipei.com.br" credits={2280} online onLogout={() => {}} onOpenExports={() => {}} />}
      </main>
    </div>
  </SettingsProvider>,
);
