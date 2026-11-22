import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Toggle } from "./Toggle";
import { Icon } from "./Icon";
import { DEFAULT_WATCH, useSettings, type WatchSettings } from "../lib/settings";
import { useWatch } from "../lib/watch";

const DURS = ["15–30 s", "30–60 s", "60–90 s"];

/** Configuração da pasta automática (nas Configurações). */
export function WatchCard() {
  const { settings, update } = useSettings();
  const { resetBaseline } = useWatch();
  const w: WatchSettings = settings.watch ?? DEFAULT_WATCH;
  const set = (patch: Partial<WatchSettings>) => update({ watch: { ...w, ...patch } });
  const [confirmAuto, setConfirmAuto] = useState(false);

  async function pickFolder() {
    const dir = await open({ directory: true, multiple: false, title: "Pasta onde suas gravações são salvas" });
    if (!dir || Array.isArray(dir)) return;
    set({ folder: dir, on: true });
  }

  return (
    <section className="card" aria-labelledby="c-watch" style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 id="c-watch" className="sub" style={{ fontSize: 17 }}>
          Pasta automática <span className="badge" style={{ marginLeft: 6, verticalAlign: "middle" }}>novo</span>
        </h2>
        <span className="muted small">
          Escolha a pasta onde o OBS (ou outro programa) salva suas lives. Quando aparecer um vídeo novo, o Clipei Cut avisa e gera os clipes para você. Funciona com o app aberto.
        </span>
      </div>

      <Toggle
        label="Vigiar uma pasta"
        hint={w.folder ? w.folder : "Nenhuma pasta escolhida"}
        on={w.on && Boolean(w.folder)}
        onChange={(v) => (v && !w.folder ? pickFolder() : set({ on: v }))}
      />

      {w.folder && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={pickFolder}>
            <Icon name="folder" size={16} /> Trocar pasta
          </button>
          <button className="btn" onClick={() => resetBaseline()} title="Os vídeos que já estão na pasta não serão analisados">
            Ignorar os vídeos que já estão lá
          </button>
        </div>
      )}

      {w.on && w.folder && (
        <>
          <div className="field">
            <label>Quando chegar um vídeo novo</label>
            <div className="seg" role="radiogroup" aria-label="Modo da pasta automática">
              <button role="radio" aria-checked={w.mode === "perguntar"} className={w.mode === "perguntar" ? "on" : ""} onClick={() => set({ mode: "perguntar" })}>
                Perguntar antes
              </button>
              <button
                role="radio"
                aria-checked={w.mode === "automatico"}
                className={w.mode === "automatico" ? "on" : ""}
                onClick={() => (w.mode === "automatico" ? null : setConfirmAuto(true))}
              >
                Gerar sozinho
              </button>
            </div>
            <span className="muted" style={{ fontSize: 12 }}>
              {w.mode === "perguntar"
                ? "Mostra um aviso com a duração e as horas que vai usar. Só analisa se você clicar em “Gerar clipes”."
                : `Analisa sozinho vídeos de até ${w.maxHours} h. Os maiores ainda pedem a sua confirmação.`}
            </span>
          </div>

          {confirmAuto && (
            <div className="note" role="alertdialog" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span className="small">
                No modo automático, <b>cada vídeo novo consome horas de IA</b> do seu saldo (1 hora de vídeo = 1 hora de IA), sem perguntar. Quer ativar?
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn primary"
                  onClick={() => {
                    set({ mode: "automatico" });
                    setConfirmAuto(false);
                  }}
                >
                  Sim, gerar sozinho
                </button>
                <button className="btn" onClick={() => setConfirmAuto(false)}>
                  Continuar perguntando
                </button>
              </div>
            </div>
          )}

          {w.mode === "automatico" && (
            <div className="field">
              <label htmlFor="w-max">Limite por vídeo no automático · {w.maxHours} h</label>
              <input id="w-max" type="range" min={1} max={8} value={w.maxHours} onChange={(e) => set({ maxHours: Number(e.target.value) })} style={{ accentColor: "#e3121f" }} />
            </div>
          )}

          <div className="field">
            <label>Duração dos clipes</label>
            <div className="seg">
              {DURS.map((l, i) => (
                <button key={l} className={w.dur === i ? "on" : ""} onClick={() => set({ dur: i as 0 | 1 | 2 })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
