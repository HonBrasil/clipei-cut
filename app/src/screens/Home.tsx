import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { Icon } from "../components/Icon";
import { probe } from "../lib/ffmpeg";
import { fmtHours, fmtTime } from "../lib/format";
import type { Prefs, Project } from "../lib/types";
import { newProjectId } from "../lib/projects";

const VIDEO_EXT = ["mp4", "mkv", "mov", "flv", "webm", "avi", "ts", "m4v"];
const DURATIONS: Array<{ label: string; prefs: Prefs }> = [
  { label: "15–30 s", prefs: { minSec: 15, maxSec: 30 } },
  { label: "30–60 s", prefs: { minSec: 30, maxSec: 60 } },
  { label: "60–90 s", prefs: { minSec: 60, maxSec: 90 } },
];

export function Home({ credits, online, paid, onStart, onPlans }: { credits: number | null; online: boolean; paid: boolean; onStart: (p: Project) => void; onPlans: () => void }) {
  const [dur, setDur] = useState(1);
  const [count, setCount] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needHours, setNeedHours] = useState(false);

  async function load(path: string) {
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    if (!VIDEO_EXT.includes(ext)) {
      setError("Esse arquivo não parece um vídeo. Use MP4, MKV, MOV, FLV ou WEBM.");
      return;
    }
    if (!online) {
      setError("Sem internet. Conecte-se para analisar um vídeo novo. Seus projetos já analisados continuam em Meus clipes.");
      return;
    }
    setBusy(true);
    setError(null);
    setNeedHours(false);
    try {
      const video = await probe(path);
      if (!video.hasAudio) throw new Error("Esse vídeo não tem áudio, e a IA precisa ouvir o que foi falado para achar os melhores momentos.");
      if (video.duration < 30) throw new Error("O vídeo é curto demais (menos de 30 segundos).");
      if (credits != null && credits < video.duration) {
        setNeedHours(true);
        throw new Error(
          `Esse vídeo tem ${fmtTime(video.duration)} e você tem ${fmtHours(credits)} de créditos. Escolha um vídeo menor ou adicione créditos.`,
        );
      }
      onStart({ id: newProjectId(), createdAt: new Date().toISOString(), video, prefs: { ...DURATIONS[dur].prefs, count: paid ? count : null }, layout: "cam-top" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // Arrastar e soltar arquivos na janela
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent((ev) => {
        if (ev.payload.type === "over" || ev.payload.type === "enter") setOver(true);
        else if (ev.payload.type === "leave") setOver(false);
        else if (ev.payload.type === "drop") {
          setOver(false);
          const p = ev.payload.paths[0];
          if (p) load(p);
        }
      })
      .then((u) => (unlisten = u));
    return () => unlisten?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dur, credits, online, count, paid]);

  async function pick() {
    const selected = await open({ multiple: false, filters: [{ name: "Vídeos", extensions: VIDEO_EXT }] });
    if (typeof selected === "string") load(selected);
  }

  return (
    <>
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="eyebrow">Bem-vindo ao Clipei Cut</span>
          <h1 className="title">
            <span className="sl">//</span> Novo <em>projeto</em>
          </h1>
        </div>
        <div className="note" style={{ borderRadius: 99 }}>
          <Icon name="shield" size={16} color="#4ade80" /> Seu vídeo nunca sai do seu PC
        </div>
      </header>

      <button className={`drop ${over ? "over" : ""}`} onClick={pick} disabled={busy}>
        <div className="icon">
          <Icon name="upload" size={28} color="#ff3b4a" />
        </div>
        <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 20, fontWeight: 600 }}>
          {busy ? "Lendo o vídeo…" : "Arraste o vídeo aqui ou clique para escolher"}
        </span>
        <span className="muted" style={{ fontSize: 14, maxWidth: 420, lineHeight: 1.5 }}>
          Gravações do OBS, lives ou podcasts. MP4, MKV, MOV, FLV ou WEBM.
        </span>
      </button>

      {error && (
        <div className="error">
          {error}
          {needHours && (
            <div style={{ marginTop: 10 }}>
              <button className="btn primary" onClick={onPlans}>
                Ver planos e horas avulsas
              </button>
            </div>
          )}
        </div>
      )}

      <section className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-labelledby="dur">
        <h2 id="dur" className="sub" style={{ fontSize: 16 }}>
          Duração dos clipes
        </h2>
        <div className="chips">
          {DURATIONS.map((d, i) => (
            <button key={d.label} className={`chip ${dur === i ? "on" : ""}`} aria-pressed={dur === i} onClick={() => setDur(i)}>
              {d.label}
            </button>
          ))}
        </div>
        <span className="muted small">A legenda em português é gerada automaticamente. Só o áudio vai para a IA.</span>
      </section>

      <section className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-labelledby="qtd">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h2 id="qtd" className="sub" style={{ fontSize: 16 }}>
            Quantos clipes gerar
          </h2>
          {!paid && <span className="planTag">Planos pagos</span>}
        </div>
        <div className="chips">
          {([null, 5, 10, 15, 20] as Array<number | null>).map((n) => {
            const on = paid ? count === n : n === null;
            return (
              <button
                key={String(n)}
                className={`chip ${on ? "on" : ""}`}
                aria-pressed={on}
                disabled={!paid && n !== null}
                title={!paid && n !== null ? "Disponível nos planos pagos" : undefined}
                onClick={() => setCount(n)}
              >
                {n === null ? (paid ? "Automático" : "Até 3 (Grátis)") : `${n} clipes`}
              </button>
            );
          })}
        </div>
        {paid ? (
          <span className="muted small">No automático, a IA escolhe só os momentos mais fortes. Com uma quantidade, ela completa até chegar no número pedido.</span>
        ) : (
          <span className="muted small">
            No Grátis a IA entrega até 3 clipes por vídeo.{" "}
            <button className="linkBtn" onClick={onPlans}>
              Ver planos
            </button>
          </span>
        )}
      </section>

      <section className="card" aria-labelledby="net" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 id="net" className="sub" style={{ fontSize: 16 }}>
          O que precisa de internet
        </h2>
        <div className="netinfo">
          <span>
            <Icon name="wifi" size={15} color="#b9a3ff" /> Precisa: entrar na conta, transcrever e a IA escolher os clipes
          </span>
          <span>
            <Icon name="check" size={15} color="#4ade80" /> Funciona offline: detectar a webcam, assistir e exportar clipes já analisados
          </span>
        </div>
      </section>
    </>
  );
}
