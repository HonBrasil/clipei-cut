import { useWatch } from "../lib/watch";
import { PIPELINE_LABEL } from "../lib/pipeline";
import { fmtHours, fmtTime } from "../lib/format";
import { Icon } from "./Icon";

/** Avisos da pasta automática: vídeo novo esperando ok, análise em andamento e clipes prontos. */
export function WatchBanner({ onOpen, onPlans }: { onOpen: (projectId: string) => void; onPlans: () => void }) {
  const { pending, job, queued, done, approve, dismiss, clearDone } = useWatch();
  if (!pending.length && !job && !done.length) return null;

  return (
    <div className="watchStack" aria-live="polite">
      {job && (
        <div className="watchCard working">
          <span className="watchIcon spin" aria-hidden>
            <Icon name="sparkles" size={18} />
          </span>
          <div className="watchText">
            <b>Pasta automática · {job.name}</b>
            <span>
              {PIPELINE_LABEL[job.step]}
              {job.pct > 0 ? ` · ${Math.round(job.pct * 100)}%` : "…"}
              {queued > 0 ? ` · mais ${queued} na fila` : ""}
            </span>
            <div className="bar" style={{ marginTop: 6 }}>
              <div style={{ width: `${Math.round(job.pct * 100)}%` }} />
            </div>
          </div>
        </div>
      )}

      {pending.map((p) => (
        <div key={p.file.path} className="watchCard">
          <span className="watchIcon" aria-hidden>
            <Icon name="folder" size={18} />
          </span>
          <div className="watchText">
            <b>Vídeo novo na pasta: {p.file.name}</b>
            <span>
              {fmtTime(p.video.duration)} de vídeo · usa cerca de {fmtHours(p.video.duration)} de IA
              {p.reason === "longo" && " · maior que o limite do automático"}
              {p.reason === "sem_horas" && " · você não tem horas suficientes"}
            </span>
          </div>
          <div className="watchActions">
            {p.reason === "sem_horas" ? (
              <button className="btn primary" onClick={onPlans}>
                Adicionar horas
              </button>
            ) : (
              <button className="btn primary" onClick={() => approve(p.file.path)}>
                Gerar clipes
              </button>
            )}
            <button className="btn" onClick={() => dismiss(p.file.path)}>
              Ignorar
            </button>
          </div>
        </div>
      ))}

      {done.map((d) => (
        <div key={d.id} className={`watchCard ${d.error ? "fail" : "ok"}`}>
          <span className="watchIcon" aria-hidden>
            <Icon name={d.error ? "alert" : "check"} size={18} />
          </span>
          <div className="watchText">
            <b>{d.error ? `Não consegui analisar ${d.name}` : `${d.clips} clipes prontos de ${d.name}`}</b>
            <span>{d.error ?? "Gerados pela pasta automática. Confira, ajuste e exporte."}</span>
          </div>
          <div className="watchActions">
            {d.projectId && !d.error && (
              <button
                className="btn primary"
                onClick={() => {
                  onOpen(d.projectId!);
                  clearDone(d.id);
                }}
              >
                Ver clipes
              </button>
            )}
            <button className="btn" onClick={() => clearDone(d.id)} aria-label="Fechar aviso">
              Fechar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
