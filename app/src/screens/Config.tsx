import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";
import { Icon } from "../components/Icon";
import { Toggle } from "../components/Toggle";
import { detectEncoder, encoderLabel, type Encoder } from "../lib/ffmpeg";
import { fmtHours } from "../lib/format";
import { clearTemp } from "../lib/native";
import { listProjects, saveProject } from "../lib/projects";
import { exportDirOf, useSettings, type ClipsAmount, type FileNaming, type Quality, type Settings } from "../lib/settings";

export function Config(props: { email: string; credits: number | null; online: boolean; onLogout: () => void; onOpenExports: () => void }) {
  const { email, credits, online, onLogout, onOpenExports } = props;
  const { settings, update } = useSettings();
  const [version, setVersion] = useState("");
  const [dir, setDir] = useState("");
  const [encoder, setEncoder] = useState<Encoder | null>(null);
  const [updMsg, setUpdMsg] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [privMsg, setPrivMsg] = useState<string | null>(null);

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);
  useEffect(() => {
    exportDirOf(settings).then(setDir);
  }, [settings]);
  useEffect(() => {
    detectEncoder(settings.useGpu).then(setEncoder).catch(() => setEncoder("libx264"));
  }, [settings.useGpu]);

  async function redetect() {
    setEncoder(null);
    setEncoder(await detectEncoder(settings.useGpu, true));
  }

  async function checkNow() {
    setUpdMsg("Procurando…");
    try {
      const u = await check();
      if (u) {
        setUpdMsg(`Versão ${u.version} disponível.`);
        window.dispatchEvent(new CustomEvent("clipei-check-update"));
      } else setUpdMsg("Você já está na versão mais recente.");
    } catch {
      setUpdMsg("Não consegui verificar agora. Confira sua internet.");
    }
  }

  async function wipeTranscripts() {
    const projects = await listProjects();
    for (const p of projects) {
      if (p.transcript) await saveProject({ ...p, transcript: undefined });
    }
    await clearTemp();
    setConfirmWipe(false);
    setPrivMsg(`Transcrições apagadas de ${projects.length} projeto(s).`);
  }

  const pct = credits == null ? 0 : Math.min(100, (credits / 3600) * 100);
  const sel = <K extends keyof Settings>(key: K) => (e: React.ChangeEvent<HTMLSelectElement>) => update({ [key]: e.target.value } as Partial<Settings>);

  return (
    <>
      <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="eyebrow">Clipei Cut · versão {version || "—"}</span>
        <h1 className="title">
          <span className="sl">//</span> <em>Configurações</em>
        </h1>
      </header>

      <div className="settingsGrid">
        <section className="card" aria-labelledby="c-conta" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h2 id="c-conta" className="sub" style={{ fontSize: 18 }}>
            Conta e plano
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div aria-hidden="true" className="avatar">
              {(email[0] ?? "?").toUpperCase()}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
              <b style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{email}</b>
              <span className="muted small">Plano beta (teste)</span>
            </div>
          </div>
          <div className="card ai" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, background: "var(--card2)" }}>
            <div className="kv">
              <span style={{ color: "var(--purple-text)", fontWeight: 700 }}>Créditos de IA</span>
              <span>{credits == null ? "—" : `${fmtHours(credits)} de vídeo`}</span>
            </div>
            <div className="bar">
              <div style={{ width: `${pct}%` }} />
            </div>
            <span className="muted small">Cada minuto de vídeo analisado usa 1 minuto de crédito.</span>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn primary" style={{ flex: "1 1 160px" }} disabled title="Em breve">
              Planos (em breve)
            </button>
            <button className="btn" style={{ flex: "1 1 120px" }} onClick={onLogout}>
              <Icon name="logout" size={16} /> Sair
            </button>
          </div>
        </section>

        <section className="card" aria-labelledby="c-exp" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 id="c-exp" className="sub" style={{ fontSize: 18 }}>
            Exportação
          </h2>
          <div className="field">
            <span className="small muted">Pasta onde os clipes são salvos</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span className="pathBox input" style={{ display: "flex", alignItems: "center", height: 44 }} title={dir}>
                {dir}
              </span>
              <button className="btn" style={{ minHeight: 44 }} onClick={onOpenExports}>
                Alterar
              </button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
            <div className="field">
              <label htmlFor="q">Qualidade</label>
              <select id="q" className="input" value={settings.quality} onChange={sel("quality")}>
                {(
                  [
                    ["1080p60", "1080p · até 60 fps"],
                    ["1080p30", "1080p · 30 fps"],
                    ["720p30", "720p · 30 fps (arquivo menor)"],
                  ] as Array<[Quality, string]>
                ).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="n">Nome do arquivo</label>
              <select id="n" className="input" value={settings.fileNaming} onChange={sel("fileNaming")}>
                {(
                  [
                    ["titulo", "Número + título"],
                    ["data-titulo", "Data + título"],
                    ["projeto-numero", "Projeto + número"],
                  ] as Array<[FileNaming, string]>
                ).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="note" style={encoder === "libx264" ? { background: "#15151b", borderColor: "var(--line2)", color: "var(--soft)" } : undefined}>
            <Icon name={encoder && encoder !== "libx264" ? "check" : "gear"} size={16} color={encoder && encoder !== "libx264" ? "#4ade80" : "#9a9aa6"} />
            {encoder ? `Exportando com: ${encoderLabel(encoder)}` : "Verificando a placa de vídeo…"}
            <button className="linkBtn" style={{ marginLeft: "auto" }} onClick={redetect}>
              Detectar de novo
            </button>
          </div>
          <div className="toggles">
            <Toggle label="Usar a placa de vídeo" hint="Exporta até 5× mais rápido. Desligue só se a exportação der erro." on={settings.useGpu} onChange={(v) => update({ useGpu: v })} />
            <Toggle label="Abrir a pasta ao terminar" hint="Mostra os arquivos assim que os clipes ficam prontos" on={settings.openFolderWhenDone} onChange={(v) => update({ openFolderWhenDone: v })} />
          </div>
        </section>

        <section className="card ai" aria-labelledby="c-ia" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 id="c-ia" className="sub" style={{ fontSize: 18 }}>
            Inteligência <em style={{ color: "var(--purple-text)" }}>artificial</em>
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
            <div className="field">
              <label htmlFor="lang">Idioma falado no vídeo</label>
              <select id="lang" className="input" value={settings.language} onChange={sel("language")}>
                <option value="pt">Português</option>
                <option value="auto">Detectar sozinho</option>
                <option value="en">Inglês</option>
                <option value="es">Espanhol</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="qtd">Quantos clipes sugerir</label>
              <select id="qtd" className="input" value={settings.clipsAmount} onChange={sel("clipsAmount")}>
                {(
                  [
                    ["poucos", "Poucos (~4/h)"],
                    ["equilibrado", "Equilibrado (~8/h)"],
                    ["muitos", "Muitos (~14/h)"],
                  ] as Array<[ClipsAmount, string]>
                ).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="toggles">
            <Toggle label="Bipar palavrões" hint="Coloca um bip no áudio e esconde a palavra na legenda. Bom para público jovem." on={settings.censor} onChange={(v) => update({ censor: v })} />
          </div>
        </section>

        <section className="card" aria-labelledby="c-app" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 id="c-app" className="sub" style={{ fontSize: 18 }}>
            Aplicativo
          </h2>
          <div className="toggles">
            <Toggle label="Avisar quando houver atualização" hint="O app verifica ao abrir e a cada 6 horas" on={settings.autoUpdate} onChange={(v) => update({ autoUpdate: v })} />
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
            <span className="muted small">{updMsg ?? `Versão instalada: ${version || "—"}`}</span>
            <button className="btn" onClick={checkNow} disabled={!online}>
              Procurar atualização
            </button>
          </div>
        </section>

        <section className="card" aria-labelledby="c-priv" style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 id="c-priv" className="sub" style={{ fontSize: 18 }}>
            Privacidade
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
            <div className="note" style={{ flex: "1 1 340px", alignItems: "flex-start" }}>
              <Icon name="shield" size={20} color="#4ade80" />
              <span style={{ lineHeight: 1.55 }}>
                Seus vídeos nunca saem do computador. Para a IA vai apenas o áudio, que o Clipei Cut não guarda. As transcrições ficam salvas só neste PC, dentro de cada projeto.
              </span>
            </div>
            <div style={{ flex: "1 1 340px", display: "flex", flexDirection: "column", gap: 10 }}>
              <span className="small" style={{ color: "var(--soft)", lineHeight: 1.5 }}>
                Apagar as transcrições remove o texto falado de todos os projetos deste PC. Os clipes sugeridos continuam, mas exportar com legenda vai exigir analisar o vídeo de novo.
              </span>
              {confirmWipe ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn" style={{ borderColor: "#6b1d24", color: "var(--red-text)" }} onClick={wipeTranscripts}>
                    Sim, apagar transcrições
                  </button>
                  <button className="btn" onClick={() => setConfirmWipe(false)}>
                    Cancelar
                  </button>
                </div>
              ) : (
                <button className="btn" style={{ alignSelf: "flex-start", borderColor: "#6b1d24", color: "var(--red-text)" }} onClick={() => setConfirmWipe(true)}>
                  Apagar transcrições salvas
                </button>
              )}
              {privMsg && <div className="note">{privMsg}</div>}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
