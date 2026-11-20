import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { deleteProject, listProjects } from "../lib/projects";
import { fmtTime } from "../lib/format";
import type { Project } from "../lib/types";

const LAYOUT_LABEL = { "cam-top": "Cam em cima", "game-only": "Recorte central", wide: "Horizontal" } as const;

export function Library({ onOpen, onNew }: { onOpen: (p: Project) => void; onNew: () => void }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  function load() {
    listProjects()
      .then(setProjects)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }
  useEffect(load, []);

  async function remove(id: string) {
    await deleteProject(id);
    setConfirmId(null);
    load();
  }

  return (
    <>
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="eyebrow">Salvos neste computador</span>
          <h1 className="title">
            <span className="sl">//</span> Meus <em>clipes</em>
          </h1>
        </div>
        <button className="btn primary" onClick={onNew}>
          <Icon name="plus" size={16} /> Novo projeto
        </button>
      </header>

      {error && <div className="error">Não consegui abrir seus projetos: {error}</div>}

      {projects && projects.length === 0 && (
        <div className="card" style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 12, alignItems: "center", padding: 40 }}>
          <span className="muted">Você ainda não tem projetos. Comece importando um vídeo.</span>
          <button className="btn primary" onClick={onNew}>
            <Icon name="plus" size={16} /> Novo projeto
          </button>
        </div>
      )}

      <section className="projects" aria-label="Projetos">
        {projects?.map((p) => {
          const n = p.clips?.length ?? 0;
          const ready = Boolean(p.clips);
          return (
            <article key={p.id} className="project">
              <button className="thumb" onClick={() => onOpen(p)} aria-label={`Abrir ${p.video.name}`}>
                {p.frameUrl ? <img src={p.frameUrl} alt="" /> : <div className="noThumb" />}
                <span className="len">{fmtTime(p.video.duration)}</span>
              </button>
              <div className="info">
                <b title={p.video.name}>{p.video.name}</b>
                <span className="muted small">
                  {new Date(p.updatedAt ?? p.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · {LAYOUT_LABEL[p.layout ?? "cam-top"]}
                </span>
                <span className="small" style={{ fontWeight: 600, color: ready ? "var(--green)" : "var(--purple-text)" }}>
                  {ready ? `${n} clipes${p.exported?.length ? ` · ${p.exported.length} exportados` : ""}` : "Análise não terminou — abra para continuar"}
                </span>
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button className="btn primary" style={{ flex: 1, minHeight: 40 }} onClick={() => onOpen(p)}>
                    Abrir
                  </button>
                  {confirmId === p.id ? (
                    <button className="btn" style={{ minHeight: 40, color: "var(--red-text)" }} onClick={() => remove(p.id)}>
                      Confirmar
                    </button>
                  ) : (
                    <button className="btn" style={{ minHeight: 40 }} onClick={() => setConfirmId(p.id)} aria-label="Excluir projeto">
                      Excluir
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </section>
      {projects && projects.length > 0 && (
        <span className="muted small">Excluir um projeto apaga só a análise salva. Os clipes exportados e o vídeo original continuam no seu PC.</span>
      )}
    </>
  );
}
