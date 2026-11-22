import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Icon } from "../components/Icon";
import { Toggle } from "../components/Toggle";
import { importLogo } from "../lib/native";
import { logoBox } from "../lib/brand";
import { DEFAULT_BRAND, useSettings, type BrandKit, type LogoPos } from "../lib/settings";

const COLORS = ["#E3121F", "#7C3AED", "#2563EB", "#0EA5E9", "#10B981", "#F59E0B", "#EC4899", "#111111"];
const POS: Array<[LogoPos, string]> = [
  ["tl", "Superior esquerdo"],
  ["tr", "Superior direito"],
  ["bl", "Inferior esquerdo"],
  ["br", "Inferior direito"],
];

export function Brand({ paid, onPlans }: { paid: boolean; onPlans: () => void }) {
  const { settings, update } = useSettings();
  const kit: BrandKit = settings.brand ?? DEFAULT_BRAND;
  const set = (patch: Partial<BrandKit>) => update({ brand: { ...kit, ...patch } });
  const setCta = (patch: Partial<BrandKit["cta"]>) => set({ cta: { ...kit.cta, ...patch } });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pickLogo() {
    setError(null);
    const file = await open({ multiple: false, filters: [{ name: "Imagem", extensions: ["png", "jpg", "jpeg", "webp"] }] });
    if (!file || Array.isArray(file)) return;
    setBusy(true);
    try {
      const path = await importLogo(file);
      const aspect = await new Promise<number>((res) => {
        const img = new Image();
        img.onload = () => res(img.naturalWidth / Math.max(1, img.naturalHeight));
        img.onerror = () => res(1);
        img.src = convertFileSrc(path);
      });
      set({ logo: path, logoAspect: aspect });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const box = logoBox(kit, "cam-top");

  return (
    <>
      <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="eyebrow">Sua identidade nos clipes</span>
        <h1 className="title">
          <span className="sl">//</span> Kit da <em>marca</em>
        </h1>
        <span className="muted small">Logo, cor e uma chamada no final de cada vídeo. Vale para todos os clipes que você exportar.</span>
      </header>

      {!paid && (
        <div className="toolbar" style={{ borderColor: "#6b1d24", background: "#1a0f11" }}>
          <span className="small" style={{ color: "var(--soft)" }}>
            O kit da marca é dos <b style={{ color: "var(--text)" }}>planos pagos</b>. Você já pode montar o seu: ele entra nos vídeos assim que você assinar.
          </span>
          <button className="btn primary" onClick={onPlans}>
            Ver planos
          </button>
        </div>
      )}

      <div className="brandGrid">
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <section className="card brandCard">
            <Toggle label="Usar o kit nos vídeos" hint="Desligue para exportar sem logo e sem chamada." on={kit.on} onChange={(v) => set({ on: v })} />
          </section>

          <section className="card brandCard" aria-labelledby="b-logo">
            <h2 id="b-logo" className="sub" style={{ fontSize: 16 }}>Logo</h2>
            <div className="brandRow" style={{ justifyContent: "flex-start" }}>
              <div className="logoSlot">{kit.logo ? <img src={convertFileSrc(kit.logo)} alt="Sua logo" /> : <Icon name="upload" size={22} />}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn" onClick={pickLogo} disabled={busy}>
                    {busy ? "Carregando…" : kit.logo ? "Trocar logo" : "Escolher logo"}
                  </button>
                  {kit.logo && (
                    <button className="btn" onClick={() => set({ logo: null })}>
                      Remover
                    </button>
                  )}
                </div>
                <span className="muted" style={{ fontSize: 12 }}>PNG com fundo transparente fica melhor. Até 5 MB.</span>
              </div>
            </div>
            {error && <div className="error">{error}</div>}
            {kit.logo && (
              <>
                <div className="field">
                  <label>Posição</label>
                  <div className="posGrid" role="radiogroup" aria-label="Posição da logo">
                    {POS.map(([id, label]) => (
                      <button key={id} role="radio" aria-checked={kit.logoPos === id} aria-label={label} title={label} className={`posBtn ${id} ${kit.logoPos === id ? "on" : ""}`} onClick={() => set({ logoPos: id })}>
                        <span />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="b-size">Tamanho · {kit.logoSize}%</label>
                  <input id="b-size" type="range" min={8} max={30} value={kit.logoSize} onChange={(e) => set({ logoSize: Number(e.target.value) })} style={{ accentColor: "#e3121f" }} />
                </div>
                <div className="field">
                  <label htmlFor="b-op">Transparência · {kit.logoOpacity}%</label>
                  <input id="b-op" type="range" min={30} max={100} step={5} value={kit.logoOpacity} onChange={(e) => set({ logoOpacity: Number(e.target.value) })} style={{ accentColor: "#e3121f" }} />
                </div>
              </>
            )}
          </section>

          <section className="card brandCard" aria-labelledby="b-cor">
            <h2 id="b-cor" className="sub" style={{ fontSize: 16 }}>Cor da marca</h2>
            <div className="swatches">
              {COLORS.map((c) => (
                <button key={c} className={`swatch ${kit.color.toLowerCase() === c.toLowerCase() ? "on" : ""}`} style={{ background: c }} aria-label={`Cor ${c}`} onClick={() => set({ color: c })} />
              ))}
              <label className="swatch custom" title="Escolher outra cor">
                <input type="color" value={kit.color} onChange={(e) => set({ color: e.target.value })} aria-label="Outra cor" />
                +
              </label>
            </div>
            <div className="brandRow">
              <span className="small">Texto da chamada em</span>
              <div className="seg">
                {[
                  ["#FFFFFF", "Branco"],
                  ["#111111", "Preto"],
                ].map(([c, l]) => (
                  <button key={c} className={kit.textColor === c ? "on" : ""} onClick={() => set({ textColor: c })}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <Toggle label="Usar a cor no destaque da legenda" hint="A palavra falada no momento fica na cor da marca." on={kit.captionColor} onChange={(v) => set({ captionColor: v })} />
          </section>

          <section className="card brandCard" aria-labelledby="b-cta">
            <h2 id="b-cta" className="sub" style={{ fontSize: 16 }}>Chamada no final</h2>
            <Toggle label="Mostrar chamada no final" hint="Aparece nos últimos segundos de cada clipe." on={kit.cta.on} onChange={(v) => setCta({ on: v })} />
            {kit.cta.on && (
              <>
                <div className="field">
                  <label htmlFor="b-text">Texto</label>
                  <input id="b-text" className="input" maxLength={60} value={kit.cta.text} placeholder="Siga @seuperfil" onChange={(e) => setCta({ text: e.target.value })} />
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                    {["Siga para mais!", "Siga @seuperfil", "Link na bio 🔗", "Inscreva-se no canal"].map((x) => (
                      <button key={x} className="chip sm" onClick={() => setCta({ text: x })}>
                        {x}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="b-sec">Duração · {kit.cta.seconds} s</label>
                  <input id="b-sec" type="range" min={2} max={6} value={kit.cta.seconds} onChange={(e) => setCta({ seconds: Number(e.target.value) })} style={{ accentColor: "#e3121f" }} />
                </div>
              </>
            )}
          </section>
        </div>

        <aside className="brandPreview" aria-label="Prévia do kit">
          <div className="phone">
            <div className="phoneCam" />
            <div className="phoneGame" />
            {kit.logo && (
              <img
                className="pvLogo"
                src={convertFileSrc(kit.logo)}
                alt=""
                style={{ left: `${(box.x / 1080) * 100}%`, top: `${(box.y / 1920) * 100}%`, width: `${(box.w / 1080) * 100}%`, opacity: kit.logoOpacity / 100 }}
              />
            )}
            <span className="phoneCaption">
              ISSO FOI <span style={{ color: kit.captionColor ? kit.color : "#FFE14D" }}>ABSURDO</span>
            </span>
            {kit.cta.on && kit.cta.text.trim() && (
              <span className="pvCta" style={{ top: "80%", background: kit.color, color: kit.textColor, fontSize: "6.2cqw" }}>
                {kit.cta.text}
              </span>
            )}
          </div>
          <span className="muted small" style={{ textAlign: "center" }}>
            Prévia ilustrativa · veja no clipe real em “Assistir e ajustar”
          </span>
        </aside>
      </div>
    </>
  );
}
