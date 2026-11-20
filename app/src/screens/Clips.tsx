import { useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { Icon } from "../components/Icon";
import { detectEncoder, encoderLabel, exportClip, workDir, type Encoder } from "../lib/ffmpeg";
import { buildAss, censorIntervals } from "../lib/ass";
import { ensureDir, prepareFonts, revealPath } from "../lib/native";
import { allModels, exportDirOf, useSettings, type FileNaming } from "../lib/settings";
import { wordsForClip } from "../lib/ai";
import { fmtTime, slugify } from "../lib/format";
import type { Clip, Project } from "../lib/types";

type ExportState = { running: boolean; current: number; total: number; pct: number; done: string[]; error?: string };

export function Clips(props: { project: Project; onChange: (fn: (p: Project) => Project) => void; onBack: () => void }) {
  const { project, onChange, onBack } = props;
  const { settings, update } = useSettings();
  const models = allModels(settings);
  const [modelId, setModelId] = useState(settings.captionModelId);
  const clips = project.clips ?? [];
  const [selected, setSelected] = useState<Set<string>>(() => new Set(clips.filter((c) => c.score >= 75).map((c) => c.id)));
  const [playing, setPlaying] = useState<Clip | null>(clips[0] ?? null);
  const [captions, setCaptions] = useState(Boolean(project.transcript));
  const [encoder, setEncoder] = useState<Encoder | null>(null);
  const [exp, setExp] = useState<ExportState>({ running: false, current: 0, total: 0, pct: 0, done: [] });
  const videoRef = useRef<HTMLVideoElement>(null);
  const src = useMemo(() => convertFileSrc(project.video.path), [project.video.path]);

  useEffect(() => {
    detectEncoder(settings.useGpu).then(setEncoder).catch(() => setEncoder("libx264"));
  }, [settings.useGpu]);

  // Toca só o trecho do clipe escolhido
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !playing) return;
    const start = () => {
      v.currentTime = playing.start;
    };
    if (v.readyState >= 1) start();
    else v.addEventListener("loadedmetadata", start, { once: true });
    const stopAtEnd = () => {
      if (v.currentTime >= playing.end) {
        v.pause();
        v.currentTime = playing.start;
      }
    };
    v.addEventListener("timeupdate", stopAtEnd);
    return () => v.removeEventListener("timeupdate", stopAtEnd);
  }, [playing]);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function rename(id: string, title: string) {
    onChange((p) => ({ ...p, clips: (p.clips ?? []).map((c) => (c.id === id ? { ...c, title } : c)) }));
  }

  async function runExport() {
    const list = clips.filter((c) => selected.has(c.id)).sort((a, b) => a.start - b.start);
    if (!list.length || !encoder) return;
    setExp({ running: true, current: 0, total: list.length, pct: 0, done: [] });
    try {
      const base = project.video.name.replace(/\.[^.]+$/, "");
      const outDir = await join(await exportDirOf(settings), slugify(base));
      await ensureDir(outDir);
      const wdir = await workDir("export");
      await prepareFonts(await join(wdir, "fonts"));
      const model = models.find((m) => m.id === modelId) ?? models[0];
      const done: string[] = [];
      for (let i = 0; i < list.length; i++) {
        const clip = list[i];
        setExp((e) => ({ ...e, current: i + 1, pct: 0 }));
        const words = project.transcript ? wordsForClip(project.transcript.words, clip) : [];
        let assFile: string | null = null;
        if (captions && project.transcript) {
          assFile = `clip_${i}.ass`;
          const ass = buildAss(words, clip.end - clip.start, project.layout ?? "cam-top", Boolean(project.webcam), model, settings.censor);
          await writeTextFile(await join(wdir, assFile), ass);
        }
        const outPath = await join(outDir, fileName(settings.fileNaming, i, clip.title, base, project.layout === "wide" ? "16x9" : "9x16"));
        await exportClip({
          video: project.video,
          clip,
          layout: project.layout ?? "cam-top",
          webcam: project.layout === "cam-top" ? project.webcam : null,
          workDir: wdir,
          assFile,
          outPath,
          encoder,
          quality: settings.quality,
          beeps: settings.censor ? censorIntervals(words) : [],
          onProgress: (pct) => setExp((e) => ({ ...e, pct })),
        });
        done.push(outPath);
        setExp((e) => ({ ...e, done: [...done] }));
      }
      setExp((e) => ({ ...e, running: false }));
      onChange((p) => ({ ...p, exported: Array.from(new Set([...(p.exported ?? []), ...done])) }));
      if (settings.openFolderWhenDone && done[0]) revealPath(done[0]).catch(() => {});
    } catch (err) {
      setExp((e) => ({ ...e, running: false, error: err instanceof Error ? err.message : String(err) }));
    }
  }

  return (
    <>
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button className="linkBtn" style={{ alignSelf: "flex-start", display: "flex", gap: 6, alignItems: "center" }} onClick={onBack}>
            <Icon name="back" size={14} /> Formato e webcam
          </button>
          <h1 className="title">
            <span className="sl">//</span> {clips.length} clipes <em>prontos</em>
          </h1>
          <span className="muted small">{project.video.name}</span>
        </div>
      </header>

      <div className="toolbar">
        <span className="small" style={{ color: "var(--soft)" }}>
          <b style={{ color: "var(--text)" }}>{selected.size} selecionados</b> · clique no quadrado para marcar · clique no título para editar
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <label className="small" style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--soft)" }} title={project.transcript ? "" : "Este projeto não tem mais a transcrição salva"}>
            <input type="checkbox" checked={captions} disabled={!project.transcript} onChange={(e) => setCaptions(e.target.checked)} /> Legenda
          </label>
          <select className="input" style={{ height: 44 }} value={modelId} disabled={!captions} aria-label="Modelo de legenda" onChange={(e) => setModelId(e.target.value)}>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <label className="small" style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--soft)" }}>
            <input type="checkbox" checked={settings.censor} onChange={(e) => update({ censor: e.target.checked })} /> Bipar palavrões
          </label>
          <button className="btn primary" disabled={!selected.size || exp.running || !encoder} onClick={runExport}>
            <Icon name="download" size={16} /> Exportar {selected.size || ""}
          </button>
        </div>
      </div>

      {(exp.running || exp.done.length > 0 || exp.error) && (
        <section className="card ai" style={{ display: "flex", flexDirection: "column", gap: 10 }} aria-live="polite">
          {exp.running ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                <span>
                  Exportando clipe {exp.current} de {exp.total}
                </span>
                <span style={{ color: "var(--purple-text)", fontWeight: 700 }}>
                  {Math.round(exp.pct * 100)}% · {encoder ? encoderLabel(encoder) : ""}
                </span>
              </div>
              <div className="bar">
                <div style={{ width: `${((exp.current - 1 + exp.pct) / exp.total) * 100}%` }} />
              </div>
            </>
          ) : exp.error ? (
            <div className="error">Não consegui exportar: {exp.error}</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
              <span className="badge ok">{exp.done.length} clipes salvos na pasta de exportação</span>
              <button className="btn primary" onClick={() => revealPath(exp.done[0])}>
                <Icon name="folder" size={16} /> Abrir pasta
              </button>
            </div>
          )}
        </section>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
        <section className="clips" style={{ flex: "3 1 520px", minWidth: 0 }} aria-label="Clipes sugeridos">
          {clips.map((c) => {
            const on = selected.has(c.id);
            return (
              <article key={c.id} className={`clip ${on ? "on" : ""} ${playing?.id === c.id ? "playing" : ""}`}>
                <div className="top">
                  <span className="score" style={{ background: c.score >= 85 ? "#4ade80" : c.score >= 70 ? "#ffb547" : "#c8c8d0" }}>
                    {c.score}
                  </span>
                  <span className="muted small">
                    {fmtTime(c.start)} · {Math.round(c.end - c.start)}s
                  </span>
                  <button className={`check ${on ? "on" : ""}`} role="checkbox" aria-checked={on} aria-label={`Selecionar ${c.title}`} onClick={() => toggle(c.id)}>
                    {on && <Icon name="check" size={14} color="#fff" width={3.4} />}
                  </button>
                </div>
                <input className="titleInput" value={c.title} aria-label="Título do clipe" onChange={(e) => rename(c.id, e.target.value)} />
                <span className="muted small" style={{ lineHeight: 1.45 }}>
                  {c.reason && <span className="badge ai" style={{ marginRight: 6 }}>{c.reason}</span>}“{c.hook}”
                </span>
                <button className="btn" style={{ minHeight: 40 }} onClick={() => setPlaying(c)}>
                  <Icon name="play" size={14} /> Assistir trecho
                </button>
              </article>
            );
          })}
          {clips.length === 0 && <div className="card muted">A IA não encontrou momentos fortes nesse vídeo. Tente outra duração de clipe.</div>}
        </section>

        <aside className="player" style={{ flex: "2 1 340px", minWidth: 0 }} aria-label="Prévia">
          <video ref={videoRef} src={src} controls preload="metadata" />
          {playing && (
            <div className="card" style={{ padding: 16 }}>
              <b>{playing.title}</b>
              <div className="muted small" style={{ marginTop: 6 }}>
                {fmtTime(playing.start)} → {fmtTime(playing.end)} · a prévia mostra o vídeo original; o formato vertical e a legenda entram na exportação.
              </div>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

function fileName(naming: FileNaming, i: number, title: string, project: string, fmt: string): string {
  const n = String(i + 1).padStart(2, "0");
  if (naming === "data-titulo") return `${new Date().toISOString().slice(0, 10)}_${slugify(title)}_${fmt}.mp4`;
  if (naming === "projeto-numero") return `${slugify(project)}-${n}_${fmt}.mp4`;
  return `${n}-${slugify(title)}_${fmt}.mp4`;
}
