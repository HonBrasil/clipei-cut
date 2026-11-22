import { useEffect, useRef, useState } from "react";
import { Toggle } from "../components/Toggle";
import { CaptionPreview } from "../components/CaptionPreview";
import { loadCaptionFonts } from "../lib/native";
import { FontPicker } from "../components/FontPicker";
import { allModels, FONTS, useSettings, type CaptionAnim, type CaptionModel, type CaptionPos } from "../lib/settings";

const COLORS: Array<[string, string]> = [
  ["Vermelho Clipei", "#FF3B4A"],
  ["Amarelo", "#FFD400"],
  ["Verde-água", "#5EEAD4"],
  ["Roxo", "#B9A3FF"],
  ["Laranja", "#FF8A3D"],
  ["Branco", "#FFFFFF"],
];
const ANIMS: Array<[CaptionAnim, string]> = [
  ["palavra", "Palavra por palavra"],
  ["pop", "Pop"],
  ["digitacao", "Digitação"],
  ["frase", "Frase inteira"],
];
const POSITIONS: Array<[CaptionPos, string]> = [
  ["topo", "Topo"],
  ["meio", "Meio"],
  ["baixo", "Embaixo"],
];

export function Captions() {
  const { settings, update } = useSettings();
  const models = allModels(settings);
  const [selId, setSelId] = useState(settings.captionModelId);
  const selected = models.find((m) => m.id === selId) ?? models[0];
  const [draft, setDraft] = useState<CaptionModel>(selected);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    loadCaptionFonts();
  }, []);
  useEffect(() => {
    setDraft(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId]);

  // Salvamento automático: modelo próprio salva na hora; modelo pronto vira uma cópia sua
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const set = (patch: Partial<CaptionModel>) => {
    if (draft.builtin) {
      const id = `meu-${Date.now().toString(36)}`;
      const copy: CaptionModel = { ...draft, ...patch, id, name: `${draft.name} (meu)`, builtin: false };
      update({
        customModels: [...settings.customModels, copy],
        // se o modelo pronto era o padrão, a cópia assume o lugar dele
        captionModelId: settings.captionModelId === draft.id ? id : settings.captionModelId,
      });
      setDraft(copy);
      setSelId(id);
      flash(`Criamos “${copy.name}” com a sua alteração. Ela é salva automaticamente.`);
      return;
    }
    const next = { ...draft, ...patch };
    setDraft(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      update({ customModels: settings.customModels.map((m) => (m.id === next.id ? next : m)) });
    }, 350);
  };
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  function flash(msg: string) {
    setSaved(msg);
    setTimeout(() => setSaved(null), 2500);
  }

  function saveAsNew() {
    const id = `meu-${Date.now().toString(36)}`;
    const name = draft.builtin ? `${draft.name} (meu)` : `${draft.name} (cópia)`;
    const m: CaptionModel = { ...draft, id, name, builtin: false };
    update({ customModels: [...settings.customModels, m] });
    setSelId(id);
    flash("Modelo salvo!");
  }
  function remove() {
    update({
      customModels: settings.customModels.filter((m) => m.id !== draft.id),
      captionModelId: settings.captionModelId === draft.id ? "destaque" : settings.captionModelId,
    });
    setSelId("destaque");
  }
  function makeDefault() {
    update({ captionModelId: draft.id, customModels: settings.customModels.map((m) => (m.id === draft.id ? draft : m)) });
    flash("Agora este é o modelo padrão.");
  }

  return (
    <>
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="eyebrow">O padrão é aplicado em todos os clipes novos</span>
          <h1 className="title">
            <span className="sl">//</span> Modelos de <em>legenda</em>
          </h1>
        </div>
      </header>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
        <section className="modelGrid" aria-label="Modelos" style={{ flex: "3 1 460px", minWidth: 0 }}>
          {models.map((m) => (
            <button key={m.id} className={`modelCard ${m.id === selId ? "on" : ""}`} aria-pressed={m.id === selId} onClick={() => setSelId(m.id)}>
              <div className="modelThumb">
                <CaptionPreview model={m} width={110} animate={m.id === selId} />
                {settings.captionModelId === m.id && <span className="defaultTag">Padrão</span>}
              </div>
              <b>{m.name}</b>
              <span className="muted small">{m.builtin ? "Modelo pronto" : "Meu modelo"}</span>
            </button>
          ))}
        </section>

        <section className="card" aria-labelledby="edit" style={{ flex: "2 1 400px", minWidth: 0, display: "flex", flexDirection: "column", gap: 18 }}>
          <h2 id="edit" className="sub" style={{ fontSize: 18 }}>
            Personalizar
          </h2>

          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
            <CaptionPreview model={draft} width={170} />
            <div style={{ flex: "1 1 200px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="field">
                <label htmlFor="mname">Nome do modelo</label>
                <input id="mname" className="input" value={draft.name} disabled={draft.builtin} onChange={(e) => set({ name: e.target.value })} />
              </div>
              <div className="field">
                <label>Fonte · {FONTS[draft.font]?.label}</label>
                <FontPicker value={draft.font} onChange={(f) => set({ font: f })} />
              </div>
              <div className="field">
                <label htmlFor="size">Tamanho · {draft.size}%</label>
                <input id="size" type="range" min={70} max={140} step={5} value={draft.size} onChange={(e) => set({ size: Number(e.target.value) })} style={{ accentColor: "#e3121f" }} />
              </div>
            </div>
          </div>

          <div role="group" aria-label="Cor da palavra em destaque" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="small muted">Cor da palavra falada</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {COLORS.map(([label, c]) => (
                <button key={c} className={`swatch ${draft.highlight.toUpperCase() === c ? "on" : ""}`} style={{ background: c }} aria-label={label} aria-pressed={draft.highlight.toUpperCase() === c} onClick={() => set({ highlight: c })} />
              ))}
              <label className="swatch custom" title="Outra cor">
                <input type="color" value={draft.highlight} onChange={(e) => set({ highlight: e.target.value.toUpperCase() })} aria-label="Escolher outra cor" />
              </label>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="small muted">Animação</span>
            <div className="chips">
              {ANIMS.map(([id, label]) => (
                <button key={id} className={`chip sm ${draft.anim === id ? "on" : ""}`} aria-pressed={draft.anim === id} onClick={() => set({ anim: id })}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="small muted">Posição</span>
            <div className="chips">
              {POSITIONS.map(([id, label]) => (
                <button key={id} className={`chip sm ${draft.position === id ? "on" : ""}`} aria-pressed={draft.position === id} onClick={() => set({ position: id })}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="toggles">
            <Toggle label="Contorno nas letras" hint="Deixa a legenda legível em qualquer fundo" on={draft.outline} onChange={(v) => set({ outline: v })} />
            <Toggle label="Fundo escuro atrás da frase" hint="Estilo podcast, mais discreto" on={draft.box} onChange={(v) => set({ box: v })} />
            <Toggle label="Letras maiúsculas" hint="O padrão dos cortes virais" on={draft.uppercase} onChange={(v) => set({ uppercase: v })} />
          </div>

          <div className="field">
            <label htmlFor="brand">Marca do canal (aparece no canto de todos os clipes)</label>
            <input id="brand" className="input" placeholder="@seucanal (deixe vazio para não mostrar)" value={draft.brand} maxLength={40} onChange={(e) => set({ brand: e.target.value })} />
          </div>

          {saved && <div className="note">{saved}</div>}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn primary" style={{ flex: "1 1 160px" }} onClick={makeDefault} disabled={settings.captionModelId === draft.id}>
              {settings.captionModelId === draft.id ? "✓ Modelo padrão" : "Usar como padrão"}
            </button>
            {draft.builtin ? (
              <button className="btn" style={{ flex: "1 1 160px" }} onClick={saveAsNew}>
                Duplicar modelo
              </button>
            ) : (
              <>
                <button className="btn" onClick={saveAsNew}>
                  Duplicar
                </button>
                <button className="btn" style={{ color: "var(--red-text)" }} onClick={remove} aria-label="Excluir modelo">
                  Excluir
                </button>
              </>
            )}
          </div>
          <span className="muted small">
            {draft.builtin
              ? "Ao mudar qualquer opção, criamos uma cópia sua deste modelo (o original continua disponível)."
              : "As alterações são salvas automaticamente."}
          </span>
        </section>
      </div>
    </>
  );
}
