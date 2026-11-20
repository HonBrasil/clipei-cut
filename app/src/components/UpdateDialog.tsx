import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { Icon } from "./Icon";
import { useSettings } from "../lib/settings";

const SNOOZE_KEY = "clipei-update-snooze";

/**
 * Procura versão nova ao abrir o app (e a cada 6 horas).
 * Se houver, mostra a janela com as novidades e o botão para atualizar.
 */
export function UpdateDialog({ online }: { online: boolean }) {
  const [update, setUpdate] = useState<Update | null>(null);
  const [current, setCurrent] = useState("");
  const [state, setState] = useState<"idle" | "downloading" | "installing" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const { settings, loaded } = useSettings();

  useEffect(() => {
    if (!online || !loaded) return;
    let alive = true;
    const run = async (manual = false) => {
      if (!manual && !settings.autoUpdate) return;
      try {
        const u = await check();
        if (!alive || !u) return;
        // "Depois" esconde a mesma versão por 12 horas
        const snooze = JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? "null") as { v: string; until: number } | null;
        if (!manual && snooze && snooze.v === u.version && Date.now() < snooze.until) return;
        setCurrent(await getVersion());
        setUpdate(u);
      } catch (e) {
        console.warn("Não foi possível verificar atualizações", e);
      }
    };
    run();
    const t = setInterval(() => run(), 6 * 60 * 60 * 1000);
    const manual = () => run(true);
    window.addEventListener("clipei-check-update", manual);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener("clipei-check-update", manual);
    };
  }, [online, loaded, settings.autoUpdate]);

  if (!update) return null;

  async function install() {
    if (!update) return;
    setState("downloading");
    setError("");
    let total = 0;
    let got = 0;
    try {
      await update.downloadAndInstall((ev) => {
        if (ev.event === "Started") total = ev.data.contentLength ?? 0;
        else if (ev.event === "Progress") {
          got += ev.data.chunkLength;
          if (total) setProgress(got / total);
        } else if (ev.event === "Finished") setState("installing");
      });
      await relaunch();
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function later() {
    localStorage.setItem(SNOOZE_KEY, JSON.stringify({ v: update!.version, until: Date.now() + 12 * 60 * 60 * 1000 }));
    setUpdate(null);
  }

  const busy = state === "downloading" || state === "installing";

  return (
    <div className="modalBack" role="dialog" aria-modal="true" aria-labelledby="upd-title">
      <div className="modal card">
        <span className="badge ai" style={{ alignSelf: "flex-start" }}>
          Nova versão
        </span>
        <h2 id="upd-title" className="sub" style={{ fontSize: 22 }}>
          Clipei Cut {update.version} <span className="muted" style={{ fontSize: 14, fontWeight: 400 }}>(você tem a {current})</span>
        </h2>
        {update.body && <div className="notes">{update.body}</div>}

        {busy && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="small" style={{ color: "var(--soft)" }}>
              {state === "downloading" ? `Baixando… ${Math.round(progress * 100)}%` : "Instalando… o app vai reabrir sozinho."}
            </span>
            <div className="bar">
              <div style={{ width: `${state === "installing" ? 100 : progress * 100}%` }} />
            </div>
          </div>
        )}
        {state === "error" && <div className="error">Não consegui atualizar: {error}</div>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          {!busy && (
            <button className="btn" onClick={later}>
              Depois
            </button>
          )}
          <button className="btn primary" onClick={install} disabled={busy}>
            <Icon name="download" size={16} /> {state === "error" ? "Tentar de novo" : "Atualizar agora"}
          </button>
        </div>
        <span className="muted small">Seus projetos e clipes continuam salvos depois da atualização.</span>
      </div>
    </div>
  );
}
