import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Icon } from "../components/Icon";
import { extractAudioChunks, extractFrames } from "../lib/ffmpeg";
import { detectWebcam } from "../lib/detect";
import { ApiError, findClips, transcribe } from "../lib/ai";
import { detectPlays, isGame } from "../lib/gameplay";
import { fmtTime } from "../lib/format";
import type { Layout, Project, Rect } from "../lib/types";
import { useSettings } from "../lib/settings";
import { openSupport } from "../lib/support";

type StepId = "detect" | "audio" | "transcribe" | "gameplay" | "ai";
type StepState = { status: "wait" | "doing" | "done"; pct?: number };

const STEP_LABEL: Record<StepId, string> = {
  detect: "Detectando a webcam",
  audio: "Separando o áudio",
  transcribe: "Transcrevendo o que foi falado",
  gameplay: "Procurando jogadas na tela",
  ai: "IA escolhendo os melhores momentos",
};

export function Analysis(props: {
  project: Project;
  online: boolean;
  paid: boolean;
  onChange: (fn: (p: Project) => Project) => void;
  onCredits: (n: number) => void;
  onBack: () => void;
  onDone: () => void;
}) {
  const { project, online, paid, onChange, onCredits, onBack, onDone } = props;
  const { settings } = useSettings();
  const { video } = project;
  const [steps, setSteps] = useState<Record<StepId, StepState>>({
    detect: { status: "wait" },
    audio: { status: "wait" },
    transcribe: { status: "wait" },
    gameplay: { status: "wait" },
    ai: { status: "wait" },
  });
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const started = useRef(-1);
  const alreadyDone = Boolean(project.clips);

  const set = (id: StepId, s: StepState) => setSteps((prev) => ({ ...prev, [id]: s }));

  useEffect(() => {
    if (alreadyDone || started.current === runId) return;
    started.current = runId;
    let cancelled = false;

    (async () => {
      try {
        setError(null);
        if (!online && !(project.transcript && project.clips)) {
          throw new Error("Sem internet. A transcrição e a IA precisam de conexão. Conecte-se e clique em “Tentar de novo”.");
        }
        // 1) Webcam (local, rápido) — já mostra a prévia enquanto o resto roda
        if (project.frameUrl) {
          set("detect", { status: "done" });
        } else {
          set("detect", { status: "doing" });
          const frames = await extractFrames(video);
          const det = await detectWebcam(video, frames);
          if (cancelled) return;
          setConfidence(det.confidence);
          onChange((p) => ({
            ...p,
            frameUrl: det.frameUrl,
            webcam: det.webcam,
            speakers: det.speakers,
            layout: det.speakers && (det.faceCam || !det.webcam) ? "podcast" : det.webcam ? "cam-top" : "game-only",
          }));
          set("detect", { status: "done" });
        }

        // 2 e 3) Áudio + transcrição — pulados se o projeto já tem a transcrição salva (não gasta créditos de novo)
        let transcript = project.transcript;
        if (transcript) {
          set("audio", { status: "done" });
          set("transcribe", { status: "done" });
        } else {
          set("audio", { status: "doing", pct: 0 });
          const chunks = await extractAudioChunks(video, (pct) => set("audio", { status: "doing", pct }));
          set("audio", { status: "done" });

          set("transcribe", { status: "doing", pct: 0 });
          transcript = await transcribe(chunks, settings.language, (pct) => set("transcribe", { status: "doing", pct }), onCredits);
          if (cancelled) return;
          const saved = transcript;
          onChange((p) => ({ ...p, transcript: saved }));
          set("transcribe", { status: "done" });
        }
        // 4) Jogadas na tela (modo jogo): picos de áudio + mudanças de imagem no PC, e a IA olha só esses momentos
        let events = project.gameEvents;
        if (isGame(project.prefs.category) && !events) {
          set("gameplay", { status: "doing", pct: 0 });
          events = await detectPlays(video, project.prefs.category!, (pct) => set("gameplay", { status: "doing", pct })).catch((e) => {
            console.warn("jogadas", e);
            return [];
          });
          if (cancelled) return;
          const ev = events;
          onChange((p) => ({ ...p, gameEvents: ev }));
        }
        set("gameplay", { status: "done" });
        if (transcript.words.length < 20 && !(events ?? []).some((e) => e.score >= 60)) {
          throw new Error("Quase não há fala nesse vídeo, então a IA não consegue escolher momentos.");
        }

        // 5) IA escolhe os clipes
        set("ai", { status: "doing", pct: 0 });
        const perHour = { poucos: 4, equilibrado: 8, muitos: 14 }[settings.clipsAmount];
        const clips = await findClips(transcript, project.prefs, (pct) => set("ai", { status: "doing", pct }), perHour, { paid, events: events ?? [] });
        if (cancelled) return;
        set("ai", { status: "done" });
        onChange((p) => ({ ...p, clips }));
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.code === "sem_creditos") setError("Seus créditos de IA acabaram. Escolha um plano para continuar.");
        else if (e instanceof TypeError || /failed to fetch|network/i.test(String(e)))
          setError("A conexão com a internet caiu durante a análise. O que já foi feito está salvo: conecte-se e clique em “Tentar de novo”.");
        else setError(e instanceof Error ? e.message : String(e));
        setSteps((prev) => {
          const next = { ...prev };
          (Object.keys(next) as StepId[]).forEach((k) => next[k].status === "doing" && (next[k] = { status: "wait" }));
          return next;
        });
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const ready = Boolean(project.clips);
  const layout = project.layout ?? "cam-top";

  return (
    <>
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button className="linkBtn" style={{ alignSelf: "flex-start", display: "flex", gap: 6, alignItems: "center" }} onClick={onBack}>
            <Icon name="back" size={14} /> Voltar
          </button>
          <h1 className="title">
            <span className="sl">//</span> Analisando seu <em>vídeo</em>
          </h1>
          <span className="muted small">
            {video.name} · {fmtTime(video.duration)} · {video.width}×{video.height} · {Math.round(video.fps)} fps
          </span>
        </div>
      </header>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
        <section style={{ flex: "3 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }} aria-label="Pré-visualização">
          {project.frameUrl ? (
            <CamEditor
              frameUrl={project.frameUrl}
              video={{ w: video.width, h: video.height }}
              boxes={
                layout === "podcast" && project.speakers
                  ? project.speakers.map((rect, i) => ({ rect, label: i === 0 ? "Pessoa 1 · em cima" : "Pessoa 2 · embaixo" }))
                  : layout === "cam-top" && project.webcam
                    ? [{ rect: project.webcam, label: `Webcam${confidence > 0 ? ` · ${Math.round(confidence * 100)}%` : ""}` }]
                    : []
              }
              aspect={layout === "podcast" ? 1080 / 960 : undefined}
              onRect={(i, r) =>
                onChange((p) =>
                  layout === "podcast" && p.speakers
                    ? { ...p, speakers: (i === 0 ? [r, p.speakers[1]] : [p.speakers[0], r]) as [Rect, Rect] }
                    : { ...p, webcam: r },
                )
              }
            />
          ) : (
            <div className="frame" style={{ aspectRatio: `${video.width} / ${video.height}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span className="muted">Carregando prévia…</span>
            </div>
          )}
          <span className="muted small">
            {layout === "podcast"
              ? "Arraste cada quadro para a pessoa certa. A pessoa 1 fica em cima e a 2 embaixo no vídeo final."
              : layout !== "cam-top"
              ? "Nesse formato a webcam não é usada."
              : project.webcam
                ? "Arraste o retângulo para ajustar a área da câmera. Use o canto branco para mudar o tamanho."
                : "Não encontramos webcam. Clique em “Marcar webcam” se o vídeo tiver uma câmera."}
          </span>
          {layout === "cam-top" && !project.webcam && project.frameUrl && (
            <button
              className="btn"
              style={{ alignSelf: "flex-start" }}
              onClick={() =>
                onChange((p) => ({
                  ...p,
                  webcam: { x: Math.round(video.width * 0.7), y: Math.round(video.height * 0.05), w: Math.round(video.width * 0.26), h: Math.round(video.width * 0.26 * 0.75) },
                }))
              }
            >
              Marcar webcam
            </button>
          )}
        </section>

        <section className="card" style={{ flex: "2 1 360px", minWidth: 0, display: "flex", flexDirection: "column", gap: 18 }} aria-label="Progresso e formato">
          <ol className="steps">
            {(Object.keys(STEP_LABEL) as StepId[]).map((id) => {
              const s = ready ? { status: "done" as const } : steps[id];
              return (
                <li key={id} className={`step ${s.status}`}>
                  <span className="dot">{s.status === "done" && <Icon name="check" size={12} color="#0a0a0d" width={3.4} />}</span>
                  {STEP_LABEL[id]}
                  {s.status === "doing" && s.pct != null && <span className="pct">{Math.round(s.pct * 100)}%</span>}
                </li>
              );
            })}
          </ol>

          {error && (
            <div className="error">
              {error}
              <div style={{ marginTop: 10 }}>
                <button className="btn" onClick={() => setRunId((n) => n + 1)}>
                  Tentar de novo
                </button>{" "}
                <button className="btn" onClick={() => openSupport(`Erro na análise: ${error}`)}>
                  Pedir ajuda
                </button>
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2 className="sub" style={{ fontSize: 16 }}>
              Formato do clipe
            </h2>
            <div className="layouts">
              <LayoutBtn id="cam-top" cur={layout} name="Cam em cima" desc="Webcam no topo e jogo embaixo" onPick={(l) => onChange((p) => ({ ...p, layout: l }))} />
              <LayoutBtn id="game-only" cur={layout} name="Recorte central" desc="Vertical, sem separar a câmera" onPick={(l) => onChange((p) => ({ ...p, layout: l }))} />
              <LayoutBtn
                id="podcast"
                cur={layout}
                name="Podcast"
                desc="2 pessoas, tela dividida"
                onPick={(l) => onChange((p) => ({ ...p, layout: l, speakers: p.speakers ?? defaultSpeakers(video.width, video.height) }))}
              />
              <LayoutBtn id="wide" cur={layout} name="Horizontal" desc="16:9 para YouTube" onPick={(l) => onChange((p) => ({ ...p, layout: l }))} />
            </div>
          </div>

          <button className="btn primary big" disabled={!ready} onClick={onDone}>
            {ready ? `Ver ${project.clips!.length} clipes` : "Aguarde a análise…"} <Icon name="arrow" />
          </button>
          <span className="muted small" style={{ textAlign: "center" }}>
            Usa {fmtTime(video.duration)} dos seus créditos · só o áudio é enviado para a IA
          </span>
        </section>
      </div>
    </>
  );
}

function LayoutBtn(props: { id: Layout; cur: Layout; name: string; desc: string; onPick: (l: Layout) => void }) {
  const on = props.id === props.cur;
  const mini =
    props.id === "wide" ? (
      <div style={{ width: 96, height: 54, borderRadius: 6, background: "#26303c" }} />
    ) : (
      <div style={{ width: 46, height: 82, borderRadius: 6, overflow: "hidden", background: "#26303c", display: "flex", flexDirection: "column" }}>
        {props.id === "cam-top" && <div style={{ height: "38%", background: "#5b4a78" }} />}
        {props.id === "podcast" && (
          <>
            <div style={{ height: "50%", background: "#5b4a78", borderBottom: "2px solid #0b0b0f" }} />
            <div style={{ height: "50%", background: "#3d5a78" }} />
          </>
        )}
      </div>
    );
  return (
    <button className={`layout ${on ? "on" : ""}`} aria-pressed={on} onClick={() => props.onPick(props.id)}>
      <div className="mini">{mini}</div>
      <b>{props.name}</b>
      <span>{props.desc}</span>
    </button>
  );
}

/** Imagem do vídeo com o retângulo da webcam arrastável/redimensionável. */
function CamEditor(props: {
  frameUrl: string;
  video: { w: number; h: number };
  boxes: Array<{ rect: Rect; label: string }>;
  aspect?: number; // trava a proporção ao redimensionar (podcast)
  onRect: (i: number, r: Rect) => void;
}) {
  const { frameUrl, video, boxes, aspect, onRect } = props;
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ i: number; mode: "move" | "resize"; sx: number; sy: number; start: Rect } | null>(null);

  function begin(e: RPointerEvent, i: number, mode: "move" | "resize") {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { i, mode, sx: e.clientX, sy: e.clientY, start: boxes[i].rect };
  }
  function move(e: RPointerEvent) {
    const d = drag.current;
    const el = box.current;
    if (!d || !el) return;
    const k = video.w / el.clientWidth;
    const dx = (e.clientX - d.sx) * k;
    const dy = (e.clientY - d.sy) * k;
    let r: Rect;
    if (d.mode === "move") {
      r = { ...d.start, x: clamp(d.start.x + dx, 0, video.w - d.start.w), y: clamp(d.start.y + dy, 0, video.h - d.start.h) };
    } else if (aspect) {
      let w = clamp(d.start.w + dx, 120, video.w - d.start.x);
      let h = w / aspect;
      if (d.start.y + h > video.h) {
        h = video.h - d.start.y;
        w = h * aspect;
      }
      r = { ...d.start, w, h };
    } else {
      r = { ...d.start, w: clamp(d.start.w + dx, 80, video.w - d.start.x), h: clamp(d.start.h + dy, 60, video.h - d.start.y) };
    }
    onRect(d.i, { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });
  }
  function end() {
    drag.current = null;
  }

  return (
    <div ref={box} className="frame" onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <img src={frameUrl} alt="Quadro do vídeo" />
      {boxes.map(({ rect, label }, i) => (
        <div
          key={i}
          className={`camBox ${i === 1 ? "alt" : ""}`}
          onPointerDown={(e) => begin(e, i, "move")}
          style={{
            left: `${(rect.x / video.w) * 100}%`,
            top: `${(rect.y / video.h) * 100}%`,
            width: `${(rect.w / video.w) * 100}%`,
            height: `${(rect.h / video.h) * 100}%`,
          }}
        >
          <span className="tag" style={rect.y / video.h < 0.08 ? { top: "auto", bottom: -30 } : undefined}>
            {label}
          </span>
          <span className="handle" onPointerDown={(e) => begin(e, i, "resize")} />
        </div>
      ))}
    </div>
  );
}

function clamp(n: number, a: number, b: number) {
  return Math.min(Math.max(n, a), Math.max(a, b));
}

/** Áreas iniciais do podcast: metade esquerda e metade direita, na proporção 9:8. */
function defaultSpeakers(W: number, H: number): [Rect, Rect] {
  const w = Math.min(W / 2, H * 1.125);
  const h = w / 1.125;
  const y = Math.max(0, (H - h) / 2);
  return [
    { x: Math.round(W / 4 - w / 2 < 0 ? 0 : W / 4 - w / 2), y: Math.round(y), w: Math.round(w), h: Math.round(h) },
    { x: Math.round(Math.min(W - w, (3 * W) / 4 - w / 2)), y: Math.round(y), w: Math.round(w), h: Math.round(h) },
  ];
}
