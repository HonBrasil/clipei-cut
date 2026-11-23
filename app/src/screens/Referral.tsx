import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Icon } from "../components/Icon";
import { applyReferral, fetchReferral, shareText, type Referral as Ref } from "../lib/referral";

const hrs = (s: number) => `${(s / 3600).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;

export function Referral({ onPlans }: { onPlans: () => void }) {
  const [data, setData] = useState<Ref | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"code" | "text" | null>(null);
  const [friend, setFriend] = useState("");
  const [applyMsg, setApplyMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetchReferral()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  useEffect(() => {
    load();
  }, []);

  async function copy(what: "code" | "text") {
    if (!data) return;
    await navigator.clipboard.writeText(what === "code" ? data.code : shareText(data.code)).catch(() => {});
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  }

  async function apply() {
    setBusy(true);
    setApplyMsg(null);
    try {
      const msg = await applyReferral(friend);
      setApplyMsg({ ok: true, text: msg });
      setFriend("");
      load();
    } catch (e) {
      setApplyMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="eyebrow">Ganhe horas de IA</span>
        <h1 className="title">
          <span className="sl">//</span> Indique e <em>ganhe</em>
        </h1>
      </header>

      {error && <div className="error">Não consegui carregar: {error}</div>}

      <section className="card refHero">
        <div className="refHeroText">
          <h2 className="sub" style={{ fontSize: 22 }}>
            Indique um amigo: quando ele assinar, você ganha <span className="refGold">{data ? hrs(data.referrerSeconds) : "2 h"}</span> e ele ganha{" "}
            <span className="refGold">{data ? hrs(data.referredSeconds) : "1 h"}</span>.
          </h2>
          <span className="muted small">Sem limite de amigos. As horas extras não vencem com o mês.</span>
        </div>
        <div className="refCodeBox">
          <span className="muted small">Seu código</span>
          <div className="refCode" aria-live="polite">
            {data?.code ?? "…"}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            <button className="btn" onClick={() => copy("code")} disabled={!data}>
              {copied === "code" ? "✓ Copiado" : "Copiar código"}
            </button>
            <button
              className="btn primary"
              style={{ background: "#1f9d55", borderColor: "#1f9d55" }}
              disabled={!data}
              onClick={() => data && openUrl(`https://wa.me/?text=${encodeURIComponent(shareText(data.code))}`)}
            >
              <Icon name="chat" size={16} /> Enviar no WhatsApp
            </button>
            <button className="btn" onClick={() => copy("text")} disabled={!data}>
              {copied === "text" ? "✓ Copiado" : "Copiar convite"}
            </button>
          </div>
        </div>
      </section>

      <div className="kpis">
        <div className="stat">
          <span className="muted small">Amigos cadastrados com seu código</span>
          <span className="big">{data?.invited ?? "—"}</span>
        </div>
        <div className="stat">
          <span className="muted small">Amigos que assinaram</span>
          <span className="big">{data?.converted ?? "—"}</span>
        </div>
        <div className="stat">
          <span className="muted small">Horas que você ganhou</span>
          <span className="big">{data ? hrs(data.earnedSeconds) : "—"}</span>
        </div>
      </div>

      <section className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }} aria-labelledby="ref-how">
        <h2 id="ref-how" className="sub" style={{ fontSize: 17 }}>
          Como funciona
        </h2>
        <ol className="refSteps">
          <li>
            <b>Envie seu código</b>
            <span>Pelo WhatsApp, no Discord ou na descrição da live.</span>
          </li>
          <li>
            <b>Seu amigo usa o código</b>
            <span>No cadastro (campo “Código de indicação”) ou aqui nesta tela.</span>
          </li>
          <li>
            <b>Ele assina um plano</b>
            <span>No primeiro pagamento aprovado, as horas caem na conta dos dois na hora.</span>
          </li>
        </ol>
      </section>

      {data?.canApply && (
        <section className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-labelledby="ref-friend">
          <h2 id="ref-friend" className="sub" style={{ fontSize: 17 }}>
            Recebeu um código de alguém?
          </h2>
          <span className="muted small">Use antes de assinar e ganhe {hrs(data.referredSeconds)} extra no seu primeiro pagamento.</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              className="input"
              style={{ flex: "1 1 200px", maxWidth: 280, textTransform: "uppercase" }}
              placeholder="Ex.: JOAO-7K2Q"
              value={friend}
              maxLength={20}
              onChange={(e) => setFriend(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))}
              aria-label="Código de indicação do amigo"
            />
            <button className="btn primary" onClick={apply} disabled={busy || friend.length < 4}>
              {busy ? "Aplicando…" : "Usar código"}
            </button>
          </div>
          {applyMsg && <div className={applyMsg.ok ? "okMsg" : "error"}>{applyMsg.text}</div>}
          {applyMsg?.ok && (
            <button className="btn" style={{ alignSelf: "flex-start" }} onClick={onPlans}>
              Ver planos
            </button>
          )}
        </section>
      )}

      {data?.referredBy && (
        <div className="note small">
          Você entrou com o código <b>{data.referredBy}</b>.{" "}
          {data.friendRewarded ? `Suas ${hrs(data.referredSeconds)} extras já foram creditadas. 🎉` : `Assine um plano para ganhar ${hrs(data.referredSeconds)} extra.`}
        </div>
      )}

      <span className="muted" style={{ fontSize: 12 }}>
        Regras: vale para amigos que ainda não assinaram; cada amigo conta uma vez; não vale usar o próprio código nem contas no mesmo computador. Limite de 20 indicações
        recompensadas a cada 30 dias.
      </span>
    </>
  );
}
