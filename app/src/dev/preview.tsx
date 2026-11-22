// Só para desenvolvimento: mostra as telas no navegador, sem o Tauri.
// Abrir com: npm run dev -> http://localhost:1420/preview.html?s=captions
import { createRoot } from "react-dom/client";
import { mockIPC, mockConvertFileSrc, mockWindows } from "@tauri-apps/api/mocks";
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
import { Plans } from "../screens/Plans";
import type { Account } from "../lib/account";
import { Home } from "../screens/Home";
import { Tour } from "../components/Tour";
import { Clips } from "../screens/Clips";
import type { Project } from "../lib/types";

const W = (word: string, start: number, end: number) => ({ word, start, end });
const DEMO: Project = {
  id: "demo", createdAt: new Date().toISOString(),
  video: { path: "C:/videos/live.mp4", name: "live_sexta.mp4", duration: 3600, width: 1920, height: 1080, fps: 60, hasAudio: true },
  prefs: { minSec: 30, maxSec: 60 }, layout: "cam-top", webcam: { x: 1400, y: 700, w: 480, h: 360 },
  transcript: { duration: 3600, segments: [{ start: 100, end: 160, text: "x" }], words: Array.from({ length: 120 }, (_, i) => W(["mano", "éé", "olha", "isso", "absurdo", "hum", "que", "jogada"][i % 8], 100 + i * 0.5, 100 + i * 0.5 + 0.35)) },
  clips: [
    { id: "a", start: 100, end: 150, title: "A jogada mais absurda da live", score: 92, reason: "Reação explosiva", hook: "Mano, olha isso!", notes: { gancho: 95, emocao: 90, clareza: 82 }, highlights: [{ word: "absurdo", emoji: "😱" }, { word: "jogada", emoji: "🔥" }] },
    { id: "b", start: 300, end: 345, title: "Ele não esperava isso", score: 74, reason: "Momento engraçado", hook: "Que isso, cara?", notes: { gancho: 70, emocao: 80, clareza: 66 } },
    { id: "c", start: 500, end: 540, title: "Dica rápida de mira", score: 58, reason: "Dica útil", hook: "Faz assim que melhora" },
  ],
};

mockWindows("main");
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
const acc: Account = { plan: "pro", planPeriod: "mensal", planMethod: "recorrente", planStatus: "active", planExpiresAt: new Date(Date.now() + 20 * day).toISOString(), creditsSeconds: 31 * 3600, extraSeconds: 5 * 3600, allowanceSeconds: 50 * 3600, cycleStart: new Date().toISOString(), hasSubscription: true, trialClaimed: true, termsVersion: "2026-11-21", totalSeconds: 36 * 3600 };
createRoot(document.getElementById("root")!).render(
  <SettingsProvider>
    <div className="shell">
      <Sidebar screen={s} credits={acc.totalSeconds} account={acc} onNavigate={(n) => (location.search = `?s=${n}`)} onLogout={() => {}} />
      <main className="main">
        {s === "home" && <Home online credits={acc.totalSeconds} paid trialBlocked={false} onPlans={() => {}} onStart={() => {}} />}
        {s === "clips" && <Clips project={DEMO} paid onChange={() => {}} onBack={() => {}} onPlans={() => {}} />}
        {s === "captions" && <Captions />}
        {s === "exports" && <Exports />}
        {s === "settings" && <Config email="voce@clipei.com.br" account={acc} online onLogout={() => {}} onOpenExports={() => {}} onAccount={() => {}} onPlans={() => {}} />}
        {s === "plans" && <Plans account={{ ...acc, plan: "free", allowanceSeconds: 3600, totalSeconds: 2280, extraSeconds: 0, hasSubscription: false }} onAccount={() => {}} />}
      </main>
      {new URLSearchParams(location.search).has("tour") && <Tour startAt={Number(new URLSearchParams(location.search).get("tour"))} onFinish={() => {}} />}
    </div>
  </SettingsProvider>,
);
