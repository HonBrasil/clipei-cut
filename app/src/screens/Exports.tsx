import { useCallback, useEffect, useMemo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Icon } from "../components/Icon";
import { clearTemp, ensureDir, fmtBytes, freeSpace, listVideos, openPath, revealPath, tempSize, type VideoFile } from "../lib/native";
import { exportDirOf, useSettings } from "../lib/settings";

type Period = "semana" | "mes" | "tudo";

export function Exports() {
  const { settings, update } = useSettings();
  const [dir, setDir] = useState("");
  const [files, setFiles] = useState<VideoFile[] | null>(null);
  const [free, setFree] = useState<number | null>(null);
  const [temp, setTemp] = useState<number | null>(null);
  const [period, setPeriod] = useState<Period>("tudo");
  const [folder, setFolder] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const d = await exportDirOf(settings);
    setDir(d);
    setFiles(await listVideos(d));
    freeSpace(d).then(setFree).catch(() => setFree(null));
    tempSize().then(setTemp).catch(() => setTemp(null));
  }, [settings]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function changeDir() {
    const picked = await open({ directory: true, multiple: false, title: "Escolha a pasta para salvar os clipes" });
    if (typeof picked === "string") update({ exportDir: picked });
  }

  async function openDir() {
    await ensureDir(dir);
    await openPath(dir);
  }

  async function cleanTemp() {
    await clearTemp();
    setMsg("Arquivos temporários apagados.");
    setTimeout(() => setMsg(null), 2500);
    refresh();
  }

  const folders = useMemo(() => Array.from(new Set((files ?? []).map((f) => f.folder).filter(Boolean))).sort(), [files]);
  const shown = useMemo(() => {
    const now = Date.now();
    const limit = period === "semana" ? 7 : period === "mes" ? 31 : Infinity;
    return (files ?? []).filter((f) => (now - f.modifiedMs) / 86_400_000 <= limit && (!folder || f.folder === folder));
  }, [files, period, folder]);
  const used = (files ?? []).reduce((n, f) => n + f.size, 0);

  return (
    <>
      <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="eyebrow">Tudo fica salvo só no seu computador</span>
        <h1 className="title">
          <span className="sl">//</span> Pasta de <em>exportação</em>
        </h1>
      </header>

      <section className="toolbar" aria-label="Local da pasta">
        <Icon name="folder" size={22} color="#ff3b4a" />
        <span className="pathBox" title={dir}>
          {dir}
        </span>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn primary" onClick={openDir}>
            Abrir no Windows
          </button>
          <button className="btn" onClick={changeDir}>
            Alterar pasta
          </button>
          {settings.exportDir && (
            <button className="btn" onClick={() => update({ exportDir: null })}>
              Usar a padrão
            </button>
          )}
        </div>
      </section>

      <section className="grid2" aria-label="Resumo" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <div className="stat">
          <span className="muted small">Clipes exportados</span>
          <span className="big">{files?.length ?? "—"}</span>
        </div>
        <div className="stat">
          <span className="muted small">Espaço usado pelos clipes</span>
          <span className="big">{fmtBytes(used)}</span>
          {free != null && <span className="muted small">{fmtBytes(free)} livres neste disco</span>}
        </div>
        <div className="stat" style={{ gap: 10 }}>
          <span className="muted small">Arquivos temporários do app</span>
          <span style={{ fontSize: 14, color: "var(--soft)" }}>{temp != null ? fmtBytes(temp) : "—"} de áudio e imagens usados durante a análise</span>
          <button className="btn" style={{ alignSelf: "flex-start", minHeight: 40 }} onClick={cleanTemp} disabled={!temp}>
            Limpar agora
          </button>
        </div>
      </section>
      {msg && <div className="note">{msg}</div>}

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div className="seg" role="group" aria-label="Período">
          {(
            [
              ["semana", "Esta semana"],
              ["mes", "Este mês"],
              ["tudo", "Tudo"],
            ] as Array<[Period, string]>
          ).map(([id, label]) => (
            <button key={id} className={period === id ? "on" : ""} aria-pressed={period === id} onClick={() => setPeriod(id)}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label htmlFor="proj" className="small muted">
            Projeto
          </label>
          <select id="proj" className="input" style={{ height: 42 }} value={folder} onChange={(e) => setFolder(e.target.value)}>
            <option value="">Todos os projetos</option>
            {folders.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <button className="btn" style={{ minHeight: 42 }} onClick={refresh}>
            Atualizar
          </button>
        </div>
      </div>

      {files && shown.length === 0 && <div className="card muted">Nenhum clipe exportado {period === "tudo" ? "ainda" : "nesse período"}.</div>}

      <section className="files" aria-label="Clipes exportados">
        {shown.map((f) => (
          <article key={f.path} className="fileCard">
            <div className="vthumb">
              <video src={`${convertFileSrc(f.path)}#t=1`} preload="metadata" muted />
            </div>
            <div className="meta">
              <b title={f.name}>{f.name}</b>
              <span className="muted small">
                {new Date(f.modifiedMs).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · {fmtBytes(f.size)}
                {f.folder ? ` · ${f.folder}` : ""}
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn primary" style={{ flex: 1, minHeight: 40 }} onClick={() => openPath(f.path)}>
                  <Icon name="play" size={14} /> Abrir
                </button>
                <button className="btn" style={{ minHeight: 40 }} onClick={() => revealPath(f.path)} aria-label="Mostrar na pasta" title="Mostrar na pasta">
                  <Icon name="folder" size={16} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
