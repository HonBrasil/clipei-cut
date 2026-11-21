import { useState } from "react";
import { PRIVACY, TERMS, type LegalDoc } from "../lib/legal";

export function LegalModal({ initial = "termos", onClose }: { initial?: "termos" | "privacidade"; onClose: () => void }) {
  const [tab, setTab] = useState(initial);
  const doc: LegalDoc = tab === "termos" ? TERMS : PRIVACY;
  return (
    <div className="modalBack" role="dialog" aria-modal="true" aria-labelledby="legal-title" onClick={onClose}>
      <div className="modal card legal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div className="seg" role="tablist">
            <button role="tab" aria-selected={tab === "termos"} className={tab === "termos" ? "on" : ""} onClick={() => setTab("termos")}>
              Termos de uso
            </button>
            <button role="tab" aria-selected={tab === "privacidade"} className={tab === "privacidade" ? "on" : ""} onClick={() => setTab("privacidade")}>
              Privacidade
            </button>
          </div>
          <button className="btn" onClick={onClose}>
            Fechar
          </button>
        </div>
        <div className="legalBody">
          <h2 id="legal-title" className="sub">
            {doc.title}
          </h2>
          <span className="muted small">Última atualização: {doc.updated}</span>
          {doc.sections.map((s) => (
            <section key={s.h}>
              <h3>{s.h}</h3>
              {s.p.map((t, i) => (
                <p key={i}>{t}</p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
