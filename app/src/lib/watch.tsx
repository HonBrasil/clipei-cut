// Pasta automática: vigia a pasta de gravações e, quando chega um vídeo novo,
// pergunta se pode analisar (ou analisa sozinho, se a pessoa escolheu o automático).
// Só funciona com o app aberto. Nada é analisado sem a pessoa ligar essa opção.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getCurrentWindow, UserAttentionType } from "@tauri-apps/api/window";
import { probe } from "./ffmpeg";
import { scanRecordings, type VideoFile } from "./native";
import { analyzeInBackground, type PipelineStep } from "./pipeline";
import { newProjectId } from "./projects";
import { useSettings } from "./settings";
import type { VideoInfo } from "./types";

const POLL_MS = 20_000;
const DURS = [
  { minSec: 15, maxSec: 30 },
  { minSec: 30, maxSec: 60 },
  { minSec: 60, maxSec: 90 },
];

export type WatchPending = { file: VideoFile; video: VideoInfo; reason: "perguntar" | "longo" | "sem_horas" };
export type WatchJob = { name: string; step: PipelineStep; pct: number };
export type WatchDone = { id: string; projectId?: string; name: string; clips: number; error?: string };

type Ctx = {
  pending: WatchPending[];
  job: WatchJob | null;
  queued: number;
  done: WatchDone[];
  approve: (path: string) => void;
  dismiss: (path: string) => void;
  clearDone: (id: string) => void;
  resetBaseline: () => Promise<void>;
};
const WatchCtx = createContext<Ctx | null>(null);

const seenKey = (folder: string) => `clipei-watch-seen:${folder}`;
function loadSeen(folder: string): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(seenKey(folder)) ?? "null") ?? {};
  } catch {
    return {};
  }
}
function saveSeen(folder: string, seen: Record<string, number>) {
  try {
    localStorage.setItem(seenKey(folder), JSON.stringify(seen));
  } catch {
    // sem espaço: tudo bem, no pior caso pergunta de novo
  }
}

export function WatchProvider(props: {
  children: ReactNode;
  active: boolean; // logado, termos aceitos e com internet
  paid: boolean;
  credits: number | null; // segundos disponíveis
  onCredits: (seconds: number) => void;
  onProjectsChanged: () => void;
}) {
  const { settings } = useSettings();
  const w = settings.watch;
  const [pending, setPending] = useState<WatchPending[]>([]);
  const [job, setJob] = useState<WatchJob | null>(null);
  const [queue, setQueue] = useState<Array<{ file: VideoFile; video: VideoInfo }>>([]);
  const [done, setDone] = useState<WatchDone[]>([]);
  const sizes = useRef<Record<string, { size: number; polls: number }>>({});
  const live = useRef(props);
  live.current = props;

  const markSeen = useCallback(
    (f: VideoFile) => {
      if (!w.folder) return;
      const seen = loadSeen(w.folder);
      seen[f.path] = f.size;
      saveSeen(w.folder, seen);
    },
    [w.folder],
  );

  // Ao ligar (ou trocar de pasta), o que já está lá conta como visto: só vídeos novos disparam
  const resetBaseline = useCallback(async () => {
    if (!w.folder) return;
    const files = await scanRecordings(w.folder).catch(() => []);
    const seen: Record<string, number> = {};
    files.forEach((f) => (seen[f.path] = f.size));
    saveSeen(w.folder, seen);
    sizes.current = {};
    setPending([]);
  }, [w.folder]);

  useEffect(() => {
    if (w.on && w.folder && localStorage.getItem(seenKey(w.folder)) === null) resetBaseline();
  }, [w.on, w.folder, resetBaseline]);

  // Vigia a pasta
  useEffect(() => {
    if (!w.on || !w.folder || !props.active) return;
    const folder = w.folder;
    let stop = false;
    const tick = async () => {
      const files = await scanRecordings(folder).catch(() => [] as VideoFile[]);
      const seen = loadSeen(folder);
      for (const f of files) {
        if (stop) return;
        if (seen[f.path] !== undefined) continue;
        // Espera o arquivo parar de crescer (o OBS ainda pode estar gravando)
        const prev = sizes.current[f.path];
        if (!prev || prev.size !== f.size) {
          sizes.current[f.path] = { size: f.size, polls: 0 };
          continue;
        }
        prev.polls++;
        if (prev.polls < 1 || f.size < 1_000_000 || Date.now() - f.modifiedMs < 15_000) continue;
        delete sizes.current[f.path];
        seen[f.path] = f.size;
        saveSeen(folder, seen);

        const video = await probe(f.path).catch(() => null);
        if (!video || !video.hasAudio || video.duration < 30) continue; // não dá para analisar: ignora
        const { credits } = live.current;
        const noHours = credits != null && credits < video.duration;
        if (w.mode === "automatico" && !noHours && video.duration / 3600 <= w.maxHours) {
          setQueue((q) => [...q, { file: f, video }]);
        } else {
          setPending((p) => [...p.filter((x) => x.file.path !== f.path), { file: f, video, reason: noHours ? "sem_horas" : w.mode === "automatico" ? "longo" : "perguntar" }]);
          getCurrentWindow().requestUserAttention(UserAttentionType.Informational).catch(() => {});
        }
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [w.on, w.folder, w.mode, w.maxHours, props.active]);

  // Analisa a fila, um vídeo por vez
  useEffect(() => {
    if (job || !queue.length || !props.active) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    setJob({ name: next.file.name, step: "detect", pct: 0 });
    const s = settings;
    analyzeInBackground(
      {
        id: newProjectId(),
        createdAt: new Date().toISOString(),
        video: next.video,
        prefs: { ...DURS[w.dur], count: null },
        layout: "cam-top",
      },
      {
        language: s.language,
        perHour: { poucos: 4, equilibrado: 8, muitos: 14 }[s.clipsAmount],
        paid: live.current.paid,
        onProgress: (step, pct) => setJob({ name: next.file.name, step, pct }),
        onCredits: (n) => live.current.onCredits(n),
      },
    )
      .then((p) => {
        setDone((d) => [...d, { id: newProjectId(), projectId: p.id, name: next.file.name, clips: p.clips?.length ?? 0 }]);
        getCurrentWindow().requestUserAttention(UserAttentionType.Informational).catch(() => {});
      })
      .catch((e) => setDone((d) => [...d, { id: newProjectId(), name: next.file.name, clips: 0, error: e instanceof Error ? e.message : String(e) }]))
      .finally(() => {
        setJob(null);
        live.current.onProjectsChanged();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job, queue, props.active]);

  const approve = useCallback((path: string) => {
    setPending((p) => {
      const item = p.find((x) => x.file.path === path);
      if (item) setQueue((q) => [...q, { file: item.file, video: item.video }]);
      return p.filter((x) => x.file.path !== path);
    });
  }, []);
  const dismiss = useCallback(
    (path: string) =>
      setPending((p) => {
        const item = p.find((x) => x.file.path === path);
        if (item) markSeen(item.file);
        return p.filter((x) => x.file.path !== path);
      }),
    [markSeen],
  );
  const clearDone = useCallback((id: string) => setDone((d) => d.filter((x) => x.id !== id)), []);

  return (
    <WatchCtx.Provider value={{ pending, job, queued: queue.length, done, approve, dismiss, clearDone, resetBaseline }}>{props.children}</WatchCtx.Provider>
  );
}

export function useWatch(): Ctx {
  const c = useContext(WatchCtx);
  if (!c) throw new Error("useWatch fora do WatchProvider");
  return c;
}
