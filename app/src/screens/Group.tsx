import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Icon } from "../components/Icon";
import { PLAN_INFO } from "../lib/account";
import { fetchGroup, groupInviteText, joinGroup, leaveGroup, newInvite, removeMember, sizeName, type Group as G } from "../lib/groups";

const date = (s: string | null) => (s ? new Date(s).toLocaleDateString("pt-BR") : "—");

export function Group({ onPlans, onChanged }: { onPlans: () => void; onChanged: () => void }) {
  const [g, setG] = useState<G | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [askForce, setAskForce] = useState(false);
  const [confirm, setConfirm] = useState<{ label: string; run: () => Promise<void> } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = () =>
    fetchGroup()
      .then((x) => {
        setG(x);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  useEffect(() => {
    load();
  }, []);

  async function act(fn: () => Promise<void>, okText: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: okText });
      await load();
      onChanged();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function join(force = false) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await joinGroup(code, force);
      if (r === "tem_plano") {
        setAskForce(true);
        return;
      }
      setAskForce(false);
      setMsg({ ok: true, text: "Você entrou no grupo! O plano já está liberado na sua conta." });
      setCode("");
      await load();
      onChanged();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="eyebrow">Duo · Trio · Squad</span>
        <h1 className="title">
          <span className="sl">//</span> Meu <em>grupo</em>
        </h1>
      </header>

      {error && <div className="error">Não consegui carregar o grupo: {error}</div>}
      {msg && <div className={msg.ok ? "okMsg" : "error"}>{msg.text}</div>}
      {!g && !error && <div className="muted small">Carregando…</div>}

      {g?.role === "none" && (
        <div className="groupNone">
          <section className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-labelledby="g-join">
            <h2 id="g-join" className="sub" style={{ fontSize: 18 }}>
              Entrar num grupo
            </h2>
            <span className="muted small">Recebeu um código de um amigo? Cole aqui e ganhe o plano do grupo na sua conta, com as suas próprias horas.</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                className="input"
                style={{ flex: "1 1 200px", maxWidth: 260 }}
                placeholder="GRUPO-XXXXXX"
                value={code}
                maxLength={14}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""));
                  setAskForce(false);
                }}
                aria-label="Código do grupo"
              />
              <button className="btn primary" disabled={busy || code.length < 8} onClick={() => join(false)}>
                {busy ? "Entrando…" : "Entrar no grupo"}
              </button>
            </div>
            {askForce && (
              <div className="note" role="alertdialog" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <span className="small">
                  Você já tem um plano próprio ativo. Ao entrar no grupo, sua conta passa a usar o plano do grupo. <b>Lembre de cancelar a renovação do seu plano</b> em
                  Configurações para não pagar duas vezes.
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn primary" disabled={busy} onClick={() => join(true)}>
                    Entrar mesmo assim
                  </button>
                  <button className="btn" onClick={() => setAskForce(false)}>
                    Voltar
                  </button>
                </div>
              </div>
            )}
          </section>
          <section className="card groupCta" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 className="sub" style={{ fontSize: 18 }}>
              Montar o seu grupo
            </h2>
            <span className="muted small">Assine um plano Duo, Trio ou Squad, chame os amigos e economize até 20% — cada um com a própria conta.</span>
            <button className="btn primary" style={{ alignSelf: "flex-start" }} onClick={onPlans}>
              <Icon name="users" size={16} /> Ver planos em grupo
            </button>
          </section>
        </div>
      )}

      {g && g.role !== "none" && (
        <>
          <section className="card groupHead">
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="muted small">{g.role === "owner" ? "Você é o dono deste grupo" : `Grupo de ${g.ownerEmail}`}</span>
              <h2 className="sub" style={{ fontSize: 22 }}>
                {PLAN_INFO[g.plan].name} {sizeName(g.size)}
              </h2>
              <span className="small" style={{ color: "var(--soft)" }}>
                {PLAN_INFO[g.plan].hours} h por mês para cada pessoa · {g.renews ? "renova" : "vale até"} em {date(g.expiresAt)}
              </span>
            </div>
            <div className="seats" aria-label={`${g.members.length} de ${g.size} vagas ocupadas`}>
              {Array.from({ length: g.size }, (_, i) => (
                <span key={i} className={`seat ${i < g.members.length ? "on" : ""}`}>
                  <Icon name="user" size={16} />
                </span>
              ))}
              <span className="small muted">
                {g.members.length}/{g.size} vagas
              </span>
            </div>
          </section>

          {g.role === "owner" && g.inviteCode && (
            <section className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-labelledby="g-inv">
              <h2 id="g-inv" className="sub" style={{ fontSize: 17 }}>
                Convidar amigos
              </h2>
              {g.members.length >= g.size ? (
                <span className="muted small">O grupo está completo. Para trocar alguém, remova um membro abaixo.</span>
              ) : (
                <span className="muted small">Envie o código: a pessoa instala o Clipei Cut, cria a conta e usa o código em “Meu grupo”.</span>
              )}
              <div className="refCodeBox" style={{ flex: "none", alignSelf: "flex-start", minWidth: 300 }}>
                <div className="refCode">{g.inviteCode}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                  <button
                    className="btn"
                    onClick={async () => {
                      await navigator.clipboard.writeText(g.inviteCode!).catch(() => {});
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    {copied ? "✓ Copiado" : "Copiar código"}
                  </button>
                  <button
                    className="btn primary"
                    style={{ background: "#1f9d55", borderColor: "#1f9d55" }}
                    onClick={() => openUrl(`https://wa.me/?text=${encodeURIComponent(groupInviteText(g.inviteCode!, g.plan))}`)}
                  >
                    <Icon name="chat" size={16} /> Enviar no WhatsApp
                  </button>
                  <button className="btn" disabled={busy} onClick={() => act(async () => void (await newInvite()), "Novo código criado. O anterior não funciona mais.")}>
                    Gerar novo código
                  </button>
                </div>
              </div>
            </section>
          )}

          <section className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }} aria-labelledby="g-mem">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h2 id="g-mem" className="sub" style={{ fontSize: 17 }}>
                Membros
              </h2>
              {g.role === "owner" && <span className="muted small">Trocas disponíveis nos próximos 30 dias: {g.swapsLeft}</span>}
            </div>
            {g.members.map((m) => (
              <div key={m.id} className="memberRow">
                <span className="memberAvatar">{m.email.slice(0, 1).toUpperCase()}</span>
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                  <b className="small" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                    {m.email}
                  </b>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {m.owner ? "Dono · paga o plano" : `Entrou em ${date(m.joinedAt)}`}
                  </span>
                </div>
                {g.role === "owner" && !m.owner && (
                  <button
                    className="btn"
                    disabled={busy || g.swapsLeft === 0}
                    title={g.swapsLeft === 0 ? "Limite de trocas atingido" : ""}
                    onClick={() =>
                      setConfirm({
                        label: `Remover ${m.email} do grupo? A conta dele volta para o plano Grátis.`,
                        run: () => removeMember(m.id),
                      })
                    }
                  >
                    Remover
                  </button>
                )}
              </div>
            ))}
            {Array.from({ length: Math.max(0, g.size - g.members.length) }, (_, i) => (
              <div key={`v${i}`} className="memberRow empty">
                <span className="memberAvatar">+</span>
                <span className="muted small">Vaga livre</span>
              </div>
            ))}
          </section>

          {g.role === "member" && (
            <button
              className="btn"
              style={{ alignSelf: "flex-start", color: "var(--red-text)" }}
              disabled={busy}
              onClick={() => setConfirm({ label: "Sair do grupo? Sua conta volta para o plano Grátis (suas horas avulsas continuam).", run: leaveGroup })}
            >
              Sair do grupo
            </button>
          )}

          {confirm && (
            <div className="note" role="alertdialog" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span className="small">{confirm.label}</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn danger" disabled={busy} onClick={() => act(confirm.run, "Pronto!")}>
                  {busy ? "Aplicando…" : "Confirmar"}
                </button>
                <button className="btn" onClick={() => setConfirm(null)}>
                  Voltar
                </button>
              </div>
            </div>
          )}

          <span className="muted" style={{ fontSize: 12 }}>
            Cada pessoa usa as próprias horas, que não passam de uma conta para outra. O dono pode trocar até 2 membros a cada 30 dias. Se o dono cancelar, todos continuam com
            o plano até o fim do período pago.
          </span>
        </>
      )}
    </>
  );
}
