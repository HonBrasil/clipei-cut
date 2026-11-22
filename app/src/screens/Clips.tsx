import { useEffect, useMemo, useRef, useState } from "react";
import { join } from "@tauri-apps/api/path";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { Icon } from "../components/Icon";
import { CancelledError, detectEncoder, encoderLabel, exportClip, exportCover, workDir, type Encoder } from "../lib/ffmpeg";
import { brandActive, brandedModel, ctaOf, logoBox } from "../lib/brand";
import { buildAss, buildCoverAss, captionY, censorIntervals } from "../lib/ass";
import { ensureDir, prepareEmojis, prepareFonts, revealPath } from "../lib/native";
import { EMOJIS, fromOut, planClip, zoomExpr as zoomExprOf, type EditOpts } from "../lib/edit";
import { allModels, exportDirOf, useSettings, type FileNaming } from "../lib/settings";
import { findClips, generatePost, wordsForClip } from "../lib/ai";
import { CaptionEditor } from "../components/CaptionEditor";
import { ClipPreview } from "../components/ClipPreview";
import { openSupport } from "../lib/support";
import { fmtTime, slugify } from "../lib/format";
import { captionBase, layoutForFormat, layoutSize, type Clip, type Format, type Project } from "../lib/types";

type Job = { id: string; clipId: string; title: string; format: Format; status: "fila" | "exportando" | "pronto" | "erro" | "cancelado"; pct: number; path?: string; error?: string };
type ExportState = { running: boolean; jobs: Job[] };
const FORMAT_LABEL: Record<Format, string> = { "9x16": "9:16", "1x1": "1:1", "16x9": "16:9" };
const FORMAT_HINT: Record<Format, string> = { "9x16": "TikTok, Reels, Shorts", "1x1": "Feed do Instagram", "16x9": "YouTube" };

export function Clips(props: { project: Project; paid: boolean; onChange: (fn: (p: Project) => Project) => void; onBack: () => void; onPlans: () => void }) {
  const { project, paid, onChange, onBack, onPlans } = props;
  const { settings, update } = useSettings();
  const models = allModels(settings);
  const [modelId, setModelId] = useState(settings.captionModelId);
  const clips = project.clips ?? [];
  const [selected, setSelected] = useState<Set<string>>(() => new Set(clips.filter((c) => c.score >= 75).map((c) => c.id)));
  const [playing, setPlaying] = useState<Clip | null>(clips[0] ?? null);
  const [captions, setCaptions] = useState(Boolean(project.transcript));
  const [encoder, setEncoder] = useState<Encoder | null>(null);
  const [exp, setExp] = useState<ExportState>({ running: false, jobs: [] });
  const abortRef = useRef<AbortController | null>(null);
  const formats: Format[] = settings.formats?.length ? settings.formats : ["9x16"];
  const [pvFormat, setPvFormat] = useState<Format>(formats[0]);
  const toggleFormat = (f: Format) => {
    const next = formats.includes(f) ? formats.filter((x) => x !== f) : [...formats, f];
    if (!next.length) return; // pelo menos um formato
    const ordered = (["9x16", "1x1", "16x9"] as Format[]).filter((x) => next.includes(x));
    update({ formats: ordered });
    if (!ordered.includes(pvFormat)) setPvFormat(ordered[0]);
  };
  const projectLayout = project.layout ?? "cam-top";
  const layoutOf = (f: Format) => layoutForFormat(f, projectLayout, Boolean(project.webcam));
  const [more, setMore] = useState<{ busy: boolean; msg?: string; error?: boolean }>({ busy: false });
  const [moreCount, setMoreCount] = useState(5);
  const [panel, setPanel] = useState<{ kind: "captions" | "post"; id: string } | null>(null);
  const [postState, setPostState] = useState<{ busy: boolean; error?: string }>({ busy: false });
  const [copied, setCopied] = useState<string | null>(null);
  const [seekReq, setSeekReq] = useState<{ t: number; n: number } | undefined>(undefined);
  const [order, setOrder] = useState<"nota" | "video">("nota");
  const fx: EditOpts = settings.fx ?? { cutSilences: true, cutFillers: true, emojis: true, keywords: true, zoom: true };
  const setFx = (k: keyof EditOpts) => update({ fx: { ...fx, [k]: !fx[k] } });
  const planFor = (c: Clip) => planClip(project.transcript ? wordsForClip(project.transcript.words, c) : [], c.end - c.start, c.highlights, fx);
  const shown = useMemo(() => (order === "nota" ? [...clips].sort((a, b) => b.score - a.score) : [...clips].sort((a, b) => a.start - b.start)), [clips, order]);

  useEffect(() => {
    detectEncoder(settings.useGpu).then(setEncoder).catch(() => setEncoder("libx264"));
  }, [settings.useGpu]);

  const current = clips.find((c) => c.id === playing?.id) ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const currentPlan = useMemo(() => (current && project.transcript ? planFor(current) : undefined), [current, project.transcript, fx.cutSilences, fx.cutFillers, fx.emojis, fx.keywords, fx.zoom]);
  const previewModel = models.find((m) => m.id === modelId) ?? models[0];

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

  function editWord(index: number, text: string) {
    onChange((p) => {
      if (!p.transcript) return p;
      const words = p.transcript.words.slice();
      words[index] = { ...words[index], word: text };
      return { ...p, transcript: { ...p.transcript, words } };
    });
  }

  function seek(t: number) {
    setSeekReq((r) => ({ t, n: (r?.n ?? 0) + 1 }));
  }

  // ----- Ajuste de início e fim (planos pagos) -----
  function setCut(clip: Clip, start: number, end: number) {
    const words = project.transcript?.words ?? [];
    // Encaixa no começo/fim de palavra mais próximo
    const s0 = words.length ? words.reduce((b, w) => (Math.abs(w.start - start) < Math.abs(b - start) ? w.start : b), words[0].start) : start;
    const e0 = words.length ? words.reduce((b, w) => (Math.abs(w.end - end) < Math.abs(b - end) ? w.end : b), words[0].end) : end;
    const ns = Math.max(0, s0 - 0.12);
    const ne = Math.min(project.video.duration, e0 + 0.2);
    if (ne - ns < 3 || ne - ns > 180) return;
    onChange((p) => ({
      ...p,
      clips: (p.clips ?? []).map((c) => (c.id === clip.id ? { ...c, start: ns, end: ne, orig: c.orig ?? { start: c.start, end: c.end } } : c)),
    }));
  }
  function sentence(edge: "start" | "end", dir: -1 | 1, t: number): number | null {
    const segs = project.transcript?.segments ?? [];
    const pts = segs.map((s) => (edge === "start" ? s.start : s.end));
    const cand = dir < 0 ? pts.filter((x) => x < t - 0.4).pop() : pts.find((x) => x > t + 0.4);
    return cand ?? null;
  }
  function moveStart(c: Clip, how: "frase" | "fino", dir: -1 | 1) {
    const t = how === "fino" ? c.start + dir * 0.5 : sentence("start", dir, c.start);
    if (t != null) setCut(c, t, c.end);
  }
  function moveEnd(c: Clip, how: "frase" | "fino", dir: -1 | 1) {
    const t = how === "fino" ? c.end + dir * 0.5 : sentence("end", dir, c.end);
    if (t != null) setCut(c, c.start, t);
  }
  function resetCut(c: Clip) {
    if (!c.orig) return;
    onChange((p) => ({ ...p, clips: (p.clips ?? []).map((x) => (x.id === c.id ? { ...x, start: c.orig!.start, end: c.orig!.end, orig: undefined } : x)) }));
  }

  async function makePost(clip: Clip) {
    if (!project.transcript) return;
    setPostState({ busy: true });
    try {
      const post = await generatePost(clip, project.transcript.words);
      onChange((p) => ({ ...p, clips: (p.clips ?? []).map((c) => (c.id === clip.id ? { ...c, post } : c)) }));
      setPostState({ busy: false });
    } catch (e) {
      setPostState({ busy: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  async function copy(label: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }

  async function generateMore() {
    if (!project.transcript) return;
    setMore({ busy: true });
    try {
      const novos = await findClips(project.transcript, project.prefs, undefined, 8, { paid: true, exclude: clips, count: moreCount });
      const ids = new Set(clips.map((c) => c.id));
      const fresh = novos.filter((c) => !ids.has(c.id));
      onChange((p) => ({ ...p, clips: [...(p.clips ?? []), ...fresh] }));
      setSelected((sel) => new Set([...sel, ...fresh.map((c) => c.id)]));
      setMore({
        busy: false,
        msg: fresh.length ? `+${fresh.length} clipes novos no fim da lista (já marcados).` : "A IA não encontrou outros momentos bons nesse vídeo.",
      });
    } catch (e) {
      setMore({ busy: false, error: true, msg: e instanceof Error ? e.message : String(e) });
    }
  }

  async function runExport() {
    const list = clips.filter((c) => selected.has(c.id)).sort((x, y) => x.start - y.start);
    if (!list.length || !encoder) return;
    const jobs: Job[] = list.flatMap((c) => formats.map((f) => ({ id: `${c.id}-${f}`, clipId: c.id, title: c.title, format: f, status: "fila" as const, pct: 0 })));
    const setJob = (id: string, patch: Partial<Job>) => setExp((e) => ({ ...e, jobs: e.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) }));
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setExp({ running: true, jobs });
    const done: string[] = [];
    try {
      const base = project.video.name.replace(/\.[^.]+$/, "");
      const outDir = await join(await exportDirOf(settings), slugify(base));
      await ensureDir(outDir);
      const wdir = await workDir("export");
      await prepareFonts(await join(wdir, "fonts"));
      if (fx.emojis) await prepareEmojis(await join(wdir, "emoji")).catch(() => {});
      const kit = settings.brand;
      const branded = brandActive(kit, paid);
      const model = brandedModel(models.find((m) => m.id === modelId) ?? models[0], kit, paid);
      const cta = ctaOf(kit, paid);
      const withCaptions = captions && Boolean(project.transcript);

      for (let n = 0; n < jobs.length; n++) {
        const job = jobs[n];
        if (ctrl.signal.aborted) break;
        const clip = list.find((c) => c.id === job.clipId)!;
        const i = list.indexOf(clip);
        const layout = layoutOf(job.format);
        const { w: VW } = layoutSize(layout);
        setJob(job.id, { status: "exportando", pct: 0 });
        try {
          const plan = planFor(clip);
          const words = plan.words; // já na linha do tempo final (com os cortes)
          let assFile: string | null = null;
          if (withCaptions || !paid || cta) {
            // No plano Grátis vai o selo "Feito com Clipei Cut", mesmo sem legenda
            assFile = `clip_${n}.ass`;
            const ass = buildAss(withCaptions ? words : [], plan.outLen, layout, Boolean(project.webcam), model, settings.censor, !paid, withCaptions ? plan.keywords : new Set(), cta);
            await writeTextFile(await join(wdir, assFile), ass);
          }
          const outPath = await join(outDir, fileName(settings.fileNaming, i, clip.title, base, job.format));
          const speakers = projectLayout === "podcast" && (layout === "podcast" || layout === "square") ? project.speakers ?? null : null;
          await exportClip({
            video: project.video,
            clip,
            layout,
            webcam: layout === "cam-top" ? project.webcam : null,
            workDir: wdir,
            assFile,
            outPath,
            encoder,
            quality: paid ? settings.quality : "720p30",
            beeps: settings.censor ? censorIntervals(words) : [],
            signal: ctrl.signal,
            fx: {
              keeps: plan.cut ? plan.keeps : undefined,
              zoom: plan.zoom,
              zoomExpr: plan.zoom.length ? zoomExprOf(plan.zoom) : undefined,
              speakers,
              logo: branded && kit.logo ? { file: kit.logo, ...logoBox(kit, layout), opacity: kit.logoOpacity } : null,
              emojis: plan.emojis.map((e) => {
                const size = layout === "wide" ? 110 : 140;
                const font = captionBase(layout) * (model.size / 100);
                const y = captionY(layout, Boolean(project.webcam), model.position) - font - 75 - size / 2;
                return { file: `emoji/${EMOJIS[e.emoji]}.png`, start: e.start, end: e.end, x: VW / 2 - size / 2, y: Math.max(20, y), size };
              }),
            },
            onProgress: (pct) => setJob(job.id, { pct }),
          });
          done.push(outPath);
          // Capa (planos pagos): quadro forte do clipe + título grande, no mesmo formato
          if (paid && settings.covers && !ctrl.signal.aborted) {
            const kw = [...plan.keywords][0];
            const tOut = kw !== undefined ? plan.words[kw].start : plan.outLen * 0.35;
            const at = clip.start + (plan.cut ? fromOut(tOut, plan.keeps) : tOut);
            const coverAss = `cover_${n}.ass`;
            await writeTextFile(await join(wdir, coverAss), buildCoverAss(clip.title, layout, branded ? kit.color : model.highlight));
            await exportCover({
              video: project.video,
              at,
              layout,
              webcam: layout === "cam-top" ? project.webcam : null,
              workDir: wdir,
              assFile: coverAss,
              outPath: outPath.replace(/\.mp4$/i, "_capa.jpg"),
              fx: { speakers, logo: branded && kit.logo ? { file: kit.logo, ...logoBox(kit, layout), opacity: kit.logoOpacity } : null },
            }).catch((e) => console.warn("Capa não gerada", e));
          }
          setJob(job.id, { status: "pronto", pct: 1, path: outPath });
        } catch (err) {
          if (err instanceof CancelledError || ctrl.signal.aborted) {
            setJob(job.id, { status: "cancelado" });
            break;
          }
          setJob(job.id, { status: "erro", error: err instanceof Error ? err.message : String(err) });
        }
      }
    } catch (err) {
      setExp((e) => ({ ...e, jobs: e.jobs.map((j) => (j.status === "fila" || j.status === "exportando" ? { ...j, status: "erro", error: err instanceof Error ? err.message : String(err) } : j)) }));
    }
    // O que sobrou na fila depois de cancelar fica marcado como cancelado
    setExp((e) => ({ running: false, jobs: e.jobs.map((j) => (j.status === "fila" || j.status === "exportando" ? { ...j, status: "cancelado" } : j)) }));
    abortRef.current = null;
    if (done.length) {
      onChange((p) => ({ ...p, exported: Array.from(new Set([...(p.exported ?? []), ...done])) }));
      if (settings.openFolderWhenDone && !ctrl.signal.aborted) revealPath(done[0]).catch(() => {});
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
          <b style={{ color: "var(--text)" }}>{selected.size} selecionados</b>
          {" · "}
          <button className="linkBtn small" onClick={() => setSelected(selected.size === clips.length ? new Set() : new Set(clips.map((c) => c.id)))}>
            {selected.size === clips.length ? "Limpar seleção" : "Selecionar todos"}
          </button>
        </span>
        <button
          className={`fmtBtn ${paid && settings.covers ? "on" : ""}`}
          aria-pressed={paid && settings.covers}
          title={paid ? "Gera uma imagem de capa (JPG) junto com cada vídeo" : "Capa automática: disponível nos planos pagos"}
          onClick={() => (paid ? update({ covers: !settings.covers }) : onPlans())}
        >
          🖼️ Capa {!paid && <span className="badge" style={{ marginLeft: 2 }}>Pago</span>}
        </button>
        <div className="fmtPick" role="group" aria-label="Formatos para exportar">
          <span className="muted small">Formatos</span>
          {(["9x16", "1x1", "16x9"] as Format[]).map((f) => (
            <button key={f} className={`fmtBtn ${formats.includes(f) ? "on" : ""}`} aria-pressed={formats.includes(f)} title={FORMAT_HINT[f]} onClick={() => toggleFormat(f)}>
              <span className={`fmtIcon f${f}`} aria-hidden />
              {FORMAT_LABEL[f]}
            </button>
          ))}
        </div>
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
            <Icon name="download" size={16} /> Exportar {selected.size * formats.length || ""} {selected.size * formats.length === 1 ? "vídeo" : "vídeos"}
          </button>
        </div>
      </div>

      <div className="toolbar fxBar" aria-label="Edição automática">
        <span className="small" style={{ color: "var(--soft)" }}>
          <b style={{ color: "var(--text)" }}>Edição automática</b> · aplicada na prévia e na exportação
        </span>
        <div className="fxChips">
          {(
            [
              ["cutSilences", "✂️ Cortar silêncios", "Encurta pausas longas entre as falas"],
              ["cutFillers", "🗣️ Tirar “éé”, “hum”", "Remove hesitações da fala"],
              ["keywords", "🎨 Palavras-chave", "Pinta as palavras mais fortes na legenda"],
              ["emojis", "😱 Emojis", "Emoji animado nas palavras-chave"],
              ["zoom", "🔍 Zoom dinâmico", "Aproxima a imagem nos momentos fortes"],
            ] as Array<[keyof EditOpts, string, string]>
          ).map(([k, label, tip]) => (
            <button key={k} className={`chip sm ${fx[k] ? "on" : ""}`} aria-pressed={fx[k]} title={tip} onClick={() => setFx(k)} disabled={!project.transcript}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {project.transcript && clips.length > 0 && !clips.some((c) => c.highlights?.length) && (fx.keywords || fx.emojis || fx.zoom) && (
        <div className="note small">Palavras-chave, emojis e zoom aparecem nos clipes gerados a partir desta versão. Use “Gerar mais clipes” ou analise o vídeo de novo para ter tudo.</div>
      )}

      <div className="toolbar" style={{ borderColor: "#3a2f5c" }}>
        <span className="small" style={{ color: "var(--soft)" }}>
          <b style={{ color: "var(--purple-text)" }}>Quer mais opções?</b> A IA procura outros momentos sem repetir os atuais e sem gastar horas.
        </span>
        {paid ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select className="input" style={{ height: 44 }} value={moreCount} aria-label="Quantos clipes a mais" onChange={(e) => setMoreCount(Number(e.target.value))}>
              {[3, 5, 10].map((n) => (
                <option key={n} value={n}>
                  +{n} clipes
                </option>
              ))}
            </select>
            <button className="btn ai" onClick={generateMore} disabled={more.busy || !project.transcript}>
              {more.busy ? "Procurando…" : "Gerar mais clipes"}
            </button>
          </div>
        ) : (
          <button className="btn" onClick={onPlans}>
            <span className="planTag">Planos pagos</span> Gerar mais clipes
          </button>
        )}
      </div>
      {more.msg && <div className={more.error ? "error" : "note"}>{more.msg}</div>}

      {!paid && (
        <div className="toolbar" style={{ borderColor: "#6b1d24", background: "#1a0f11" }}>
          <span className="small" style={{ color: "var(--soft)" }}>
            No plano <b style={{ color: "var(--text)" }}>Grátis</b> os clipes saem em 720p com o selo “Feito com Clipei Cut”.
          </span>
          <button className="btn primary" onClick={onPlans}>
            Tirar a marca d'água
          </button>
        </div>
      )}

      {exp.jobs.length > 0 && <ExportQueue exp={exp} encoder={encoder} onCancel={() => abortRef.current?.abort()} onClose={() => setExp({ running: false, jobs: [] })} />}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
        <section className="clips" style={{ flex: "3 1 520px", minWidth: 0 }} aria-label="Clipes sugeridos">
          {clips.length > 1 && (
            <div className="clipsOrder">
              <span className="muted small">Ordenar por</span>
              <div className="seg" role="tablist" aria-label="Ordenar clipes">
                <button role="tab" aria-selected={order === "nota"} className={order === "nota" ? "on" : ""} onClick={() => setOrder("nota")}>
                  Nota viral
                </button>
                <button role="tab" aria-selected={order === "video"} className={order === "video" ? "on" : ""} onClick={() => setOrder("video")}>
                  Ordem do vídeo
                </button>
              </div>
            </div>
          )}
          {shown.map((c) => {
            const on = selected.has(c.id);
            const outLen = project.transcript && (fx.cutSilences || fx.cutFillers) ? planFor(c).outLen : c.end - c.start;
            return (
              <article key={c.id} className={`clip ${on ? "on" : ""} ${playing?.id === c.id ? "playing" : ""}`}>
                <div className="top">
                  <ViralScore score={c.score} />
                  <span className="muted small">
                    {fmtTime(c.start)} · {Math.round(outLen)}s
                    {outLen < c.end - c.start - 0.9 && <span style={{ color: "var(--purple-text)" }}> (−{Math.round(c.end - c.start - outLen)}s)</span>}
                  </span>
                  <button className={`check ${on ? "on" : ""}`} role="checkbox" aria-checked={on} aria-label={`Selecionar ${c.title}`} onClick={() => toggle(c.id)}>
                    {on && <Icon name="check" size={14} color="#fff" width={3.4} />}
                  </button>
                </div>
                {c.notes && (
                  <div className="subScores" aria-label="Detalhe da nota">
                    {(
                      [
                        ["Gancho", c.notes.gancho],
                        ["Emoção", c.notes.emocao],
                        ["Clareza", c.notes.clareza],
                      ] as Array<[string, number]>
                    ).map(([l, v]) => (
                      <div key={l} className="subScore" title={`${l}: ${v}/100`}>
                        <span>{l}</span>
                        <div className="subBar">
                          <div style={{ width: `${v}%`, background: scoreColor(v) }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <input className="titleInput" value={c.title} aria-label="Título do clipe" onChange={(e) => rename(c.id, e.target.value)} />
                <span className="muted small" style={{ lineHeight: 1.45 }}>
                  {c.reason && <span className="badge ai" style={{ marginRight: 6 }}>{c.reason}</span>}“{c.hook}”
                </span>
                <button
                  className="btn"
                  style={{ minHeight: 40 }}
                  onClick={() => {
                    setPlaying(c);
                    setPanel(null);
                  }}
                >
                  <Icon name="play" size={14} /> Assistir e ajustar
                </button>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    className="btn"
                    style={{ minHeight: 38, flex: 1, fontSize: 13, padding: "0 10px" }}
                    disabled={!project.transcript}
                    onClick={() => {
                      setPlaying(c);
                      setPanel({ kind: "captions", id: c.id });
                    }}
                  >
                    <Icon name="text" size={14} /> Corrigir legenda
                  </button>
                  <button
                    className="btn"
                    style={{ minHeight: 38, flex: 1, fontSize: 13, padding: "0 10px" }}
                    onClick={() => {
                      if (!paid) return onPlans();
                      setPlaying(c);
                      setPostState({ busy: false });
                      setPanel({ kind: "post", id: c.id });
                      if (!c.post) makePost(c);
                    }}
                    title={paid ? "" : "Disponível nos planos pagos"}
                  >
                    {paid ? (c.post ? "Ver texto do post" : "Texto do post") : <><span className="planTag">Pago</span> Texto do post</>}
                  </button>
                </div>
              </article>
            );
          })}
          {clips.length === 0 && <div className="card muted">A IA não encontrou momentos fortes nesse vídeo. Tente outra duração de clipe.</div>}
        </section>

        <aside className="player" style={{ flex: "2 1 340px", minWidth: 0 }} aria-label="Prévia">
          {current && formats.length > 1 && (
            <div className="seg" role="tablist" aria-label="Formato da prévia" style={{ alignSelf: "center" }}>
              {formats.map((f) => (
                <button key={f} role="tab" aria-selected={pvFormat === f} className={pvFormat === f ? "on" : ""} onClick={() => setPvFormat(f)}>
                  {FORMAT_LABEL[f]}
                </button>
              ))}
            </div>
          )}
          {current ? (
            <ClipPreview
              video={project.video}
              clip={current}
              layout={layoutOf(formats.includes(pvFormat) ? pvFormat : formats[0])}
              webcam={layoutOf(formats.includes(pvFormat) ? pvFormat : formats[0]) === "cam-top" ? project.webcam : null}
              speakers={projectLayout === "podcast" ? project.speakers ?? null : null}
              brand={brandActive(settings.brand, paid) ? { kit: settings.brand, cta: ctaOf(settings.brand, paid) } : null}
              words={project.transcript ? wordsForClip(project.transcript.words, current) : []}
              plan={currentPlan}
              model={captions && project.transcript ? brandedModel(previewModel, settings.brand, paid) : null}
              censor={settings.censor}
              watermark={!paid}
              seek={seekReq}
            />
          ) : (
            <div className="card muted small">Clique em “Assistir” num clipe para ver como ele vai ficar.</div>
          )}
          {current && !panel && (
            <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <b>{current.title}</b>
                <div className="muted small" style={{ marginTop: 4 }}>
                  {fmtTime(current.start)} → {fmtTime(current.end)} · {Math.round(currentPlan?.outLen ?? current.end - current.start)} s · prévia com o formato, a legenda e a edição do vídeo final
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <b className="small">Ajustar corte</b>
                {!paid && <span className="planTag">Planos pagos</span>}
                {paid && current.orig && (
                  <button className="linkBtn" style={{ marginLeft: "auto" }} onClick={() => resetCut(current)}>
                    Voltar ao corte da IA
                  </button>
                )}
              </div>
              {paid ? (
                <div className="trim">
                  <span className="muted small">Início</span>
                  <div className="trimBtns">
                    <button className="btn" onClick={() => moveStart(current, "frase", -1)} title="Começar na frase anterior">« Frase</button>
                    <button className="btn" onClick={() => moveStart(current, "fino", -1)}>−0,5 s</button>
                    <button className="btn" onClick={() => moveStart(current, "fino", 1)}>+0,5 s</button>
                    <button className="btn" onClick={() => moveStart(current, "frase", 1)} title="Começar na próxima frase">Frase »</button>
                  </div>
                  <span className="muted small">Fim</span>
                  <div className="trimBtns">
                    <button className="btn" onClick={() => moveEnd(current, "frase", -1)} title="Terminar na frase anterior">« Frase</button>
                    <button className="btn" onClick={() => moveEnd(current, "fino", -1)}>−0,5 s</button>
                    <button className="btn" onClick={() => moveEnd(current, "fino", 1)}>+0,5 s</button>
                    <button className="btn" onClick={() => moveEnd(current, "frase", 1)} title="Terminar na próxima frase">Frase »</button>
                  </div>
                  <span className="muted" style={{ fontSize: 12 }}>O corte sempre encaixa no começo ou no fim de uma palavra, então nunca corta alguém no meio da fala.</span>
                </div>
              ) : (
                <button className="btn" style={{ alignSelf: "flex-start" }} onClick={onPlans}>
                  Liberar ajuste de início e fim
                </button>
              )}
            </div>
          )}
          {panel?.kind === "captions" && project.transcript && clips.find((c) => c.id === panel.id) && (
            <CaptionEditor clip={clips.find((c) => c.id === panel.id)!} words={project.transcript.words} onEdit={editWord} onSeek={seek} onClose={() => setPanel(null)} />
          )}
          {panel?.kind === "post" && (() => {
            const c = clips.find((x) => x.id === panel.id);
            if (!c) return null;
            return (
              <div className="card postBox" style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <b>Texto do post</b>
                  <button className="linkBtn" onClick={() => setPanel(null)}>
                    Fechar
                  </button>
                </div>
                {postState.busy && <span className="muted small">A IA está escrevendo o título, a descrição e as hashtags…</span>}
                {postState.error && <div className="error">{postState.error}</div>}
                {c.post && (
                  <>
                    {(
                      [
                        ["Título", c.post.titulo],
                        ["Descrição", c.post.descricao],
                        ["Hashtags", c.post.hashtags.join(" ")],
                      ] as Array<[string, string]>
                    ).map(([label, text]) => (
                      <div key={label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span className="muted small">{label}</span>
                        <div className="postField">
                          {text}
                          <button className="btn copy" style={{ minHeight: 30, padding: "0 10px", fontSize: 12 }} onClick={() => copy(label, text)}>
                            {copied === label ? "Copiado!" : "Copiar"}
                          </button>
                        </div>
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button className="btn primary" onClick={() => copy("tudo", `${c.post!.titulo}\n\n${c.post!.descricao}\n\n${c.post!.hashtags.join(" ")}`)}>
                        {copied === "tudo" ? "Copiado!" : "Copiar tudo"}
                      </button>
                      <button className="btn" disabled={postState.busy} onClick={() => makePost(c)}>
                        Gerar outro
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })()}
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

function scoreColor(v: number): string {
  return v >= 85 ? "#4ade80" : v >= 70 ? "#ffb547" : v >= 50 ? "#c8c8d0" : "#ff7a85";
}

/** Nota de viralidade: número + rótulo, com a cor da faixa. */
function ViralScore({ score }: { score: number }) {
  const label = score >= 85 ? "Viral" : score >= 70 ? "Forte" : score >= 50 ? "Bom" : "Fraco";
  return (
    <span className="viral" style={{ ["--vc" as string]: scoreColor(score) }} title={`Nota de viralidade: ${score}/100`}>
      <b>{score >= 85 ? "🔥 " : ""}{score}</b>
      <span>{label}</span>
    </span>
  );
}

const STATUS_LABEL: Record<Job["status"], string> = { fila: "Na fila", exportando: "Exportando", pronto: "Pronto", erro: "Erro", cancelado: "Cancelado" };

/** Fila de exportação: um item por clipe e formato, com progresso e cancelar. */
function ExportQueue({ exp, encoder, onCancel, onClose }: { exp: ExportState; encoder: Encoder | null; onCancel: () => void; onClose: () => void }) {
  const total = exp.jobs.length;
  const ready = exp.jobs.filter((j) => j.status === "pronto");
  const errors = exp.jobs.filter((j) => j.status === "erro");
  const progress = exp.jobs.reduce((n, j) => n + (j.status === "pronto" ? 1 : j.status === "exportando" ? j.pct : 0), 0) / Math.max(1, total);
  return (
    <section className="card ai queue" aria-live="polite" aria-label="Fila de exportação">
      <div className="queueHead">
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <b>{exp.running ? `Exportando ${ready.length + 1 > total ? total : ready.length + 1} de ${total}` : `${ready.length} de ${total} vídeos prontos`}</b>
          <span className="muted small">
            {exp.running ? `${Math.round(progress * 100)}% · ${encoder ? encoderLabel(encoder) : ""} · pode continuar usando o app` : errors.length ? `${errors.length} com erro` : "Salvos na pasta de exportação"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {exp.running ? (
            <button className="btn" onClick={onCancel}>
              Cancelar
            </button>
          ) : (
            <>
              {ready[0]?.path && (
                <button className="btn primary" onClick={() => revealPath(ready[0].path!)}>
                  <Icon name="folder" size={16} /> Abrir pasta
                </button>
              )}
              {errors.length > 0 && (
                <button className="btn" onClick={() => openSupport(`Erro ao exportar: ${errors[0].error}`)}>
                  Pedir ajuda
                </button>
              )}
              <button className="btn" onClick={onClose}>
                Fechar
              </button>
            </>
          )}
        </div>
      </div>
      <div className="bar">
        <div style={{ width: `${progress * 100}%` }} />
      </div>
      <ul className="queueList">
        {exp.jobs.map((j) => (
          <li key={j.id} className={`queueItem ${j.status}`} title={j.error ?? ""}>
            <span className="qFmt">{FORMAT_LABEL[j.format]}</span>
            <span className="qTitle">{j.title}</span>
            <span className="qStatus">
              {j.status === "exportando" ? `${Math.round(j.pct * 100)}%` : STATUS_LABEL[j.status]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
