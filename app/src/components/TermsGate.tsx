import { useState } from "react";
import { acceptTerms } from "../lib/account";
import { TERMS_VERSION } from "../lib/legal";
import { LegalModal } from "./LegalModal";

/** Pede o aceite da versão atual dos Termos para quem ainda não aceitou. */
export function TermsGate({ onAccepted, onLogout }: { onAccepted: () => void; onLogout: () => void }) {
  const [legal, setLegal] = useState<null | "termos" | "privacidade">(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await acceptTerms(TERMS_VERSION);
      onAccepted();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modalBack" role="dialog" aria-modal="true" aria-labelledby="gate-title">
      <div className="modal card">
        <h2 id="gate-title" className="sub" style={{ fontSize: 20 }}>
          Atualizamos nossos termos
        </h2>
        <p className="small" style={{ color: "var(--soft)", lineHeight: 1.6, margin: 0 }}>
          Para continuar usando o Clipei Cut, leia e aceite os Termos de uso e a Política de privacidade. Eles explicam como funcionam os planos, o teste grátis e como cuidamos dos seus dados (LGPD).
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => setLegal("termos")}>
            Ler Termos de uso
          </button>
          <button className="btn" onClick={() => setLegal("privacidade")}>
            Ler Política de privacidade
          </button>
        </div>
        <label className="acceptRow">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>Li e aceito os Termos de uso e a Política de privacidade.</span>
        </label>
        {error && <div className="error">{error}</div>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn" onClick={onLogout}>
            Sair
          </button>
          <button className="btn primary" disabled={!checked || busy} onClick={accept}>
            {busy ? "Salvando…" : "Aceitar e continuar"}
          </button>
        </div>
      </div>
      {legal && <LegalModal initial={legal} onClose={() => setLegal(null)} />}
    </div>
  );
}
