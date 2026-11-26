import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { brl, fetchAccount, HOUR_PACKS, PLAN_INFO, startCheckout, type Account, type PlanId } from "../lib/account";
import { fmtHours } from "../lib/format";
import { GROUP_PRICES, GROUP_SIZES, type GroupPlan } from "../lib/groups";
import { fetchReferral } from "../lib/referral";
import { fetchGroup } from "../lib/groups";

type Period = "mensal" | "anual";

export function Plans({ account, onAccount, onGroup }: { account: Account | null; onAccount: (a: Account | null) => void; onGroup: () => void }) {
  const [period, setPeriod] = useState<Period>("mensal");
  const [kind, setKind] = useState<"individual" | "grupo">("individual");
  const [gPlan, setGPlan] = useState<GroupPlan>("pro");
  const [followerOff, setFollowerOff] = useState(0);
  const [ownsGroup, setOwnsGroup] = useState(false);
  useEffect(() => {
    fetchGroup()
      .then((g) => setOwnsGroup(g.role === "owner"))
      .catch(() => {});
  }, []);
  useEffect(() => {
    fetchReferral()
      .then((r) => setFollowerOff(r.followerDiscount ?? 0))
      .catch(() => {});
  }, []);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error" | "wait"; text: string } | null>(null);
  const before = useRef<string>("");
  const poll = useRef<number | null>(null);

  // Depois de abrir o pagamento, confere a conta a cada 5 s por até 10 min
  function watchForPayment() {
    before.current = JSON.stringify([account?.plan, account?.planExpiresAt, account?.extraSeconds]);
    if (poll.current) clearInterval(poll.current);
    let tries = 0;
    poll.current = window.setInterval(async () => {
      tries++;
      const a = await fetchAccount();
      if (a && JSON.stringify([a.plan, a.planExpiresAt, a.extraSeconds]) !== before.current) {
        onAccount(a);
        setMsg({ kind: "ok", text: "Pagamento confirmado! Seu plano e suas horas já estão liberados." });
        clearInterval(poll.current!);
      } else if (tries > 120) clearInterval(poll.current!);
    }, 5000);
  }
  useEffect(() => () => void (poll.current && clearInterval(poll.current)), []);

  async function buy(product: string, method: "recorrente" | "unico") {
    setBusy(`${product}:${method}`);
    setMsg(null);
    try {
      await startCheckout(product, method);
      setMsg({ kind: "wait", text: "Abrimos o pagamento no seu navegador. Pague com Pix ou cartão. Assim que for aprovado, o plano é liberado aqui automaticamente." });
      watchForPayment();
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  const plans: PlanId[] = ["criador", "pro", "studio"];

  return (
    <>
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="eyebrow">Pagamento seguro pela InfinitePay · Pix ou cartão</span>
          <h1 className="title">
            <span className="sl">//</span> Escolha seu <em>plano</em>
          </h1>
        </div>
        <div className="seg" role="group" aria-label="Período">
          <button className={period === "mensal" ? "on" : ""} aria-pressed={period === "mensal"} onClick={() => setPeriod("mensal")}>
            Mensal
          </button>
          <button className={period === "anual" ? "on" : ""} aria-pressed={period === "anual"} onClick={() => setPeriod("anual")}>
            Anual <span className="badge ok" style={{ marginLeft: 6, padding: "2px 6px", fontSize: 11 }}>2 meses grátis</span>
          </button>
        </div>
      </header>

      {account && (
        <div className="toolbar">
          <span className="small" style={{ color: "var(--soft)" }}>
            Seu plano: <b style={{ color: "var(--text)" }}>{PLAN_INFO[account.plan].name}</b>
            {account.plan !== "free" && account.planExpiresAt && (
              <>
                {" "}
                · {account.planStatus === "cancelled" ? "termina" : account.planMethod === "recorrente" ? "renova" : "vale até"} em{" "}
                {new Date(account.planExpiresAt).toLocaleDateString("pt-BR")}
              </>
            )}
          </span>
          <span className="small" style={{ color: "var(--purple-text)", fontWeight: 700 }}>
            Saldo: {fmtHours(account.totalSeconds)}
            {account.extraSeconds > 0 && ` (${fmtHours(account.extraSeconds)} avulsas)`}
          </span>
        </div>
      )}

      {msg && <div className={msg.kind === "error" ? "error" : "note"}>{msg.text}</div>}
      {followerOff > 0 && (
        <div className="okMsg">
          🎁 Você entrou com o cupom de um criador: <b>{followerOff}% OFF no primeiro pagamento</b> de qualquer plano. O desconto já vem aplicado na tela de pagamento.
        </div>
      )}

      <div className="planKinds" role="tablist" aria-label="Tipo de plano">
        <button role="tab" aria-selected={kind === "individual"} className={kind === "individual" ? "on" : ""} onClick={() => setKind("individual")}>
          <Icon name="user" size={16} /> Individual
        </button>
        <button role="tab" aria-selected={kind === "grupo"} className={kind === "grupo" ? "on" : ""} onClick={() => setKind("grupo")}>
          <Icon name="users" size={16} /> Em grupo <span className="badge ok" style={{ marginLeft: 4, padding: "2px 6px", fontSize: 11 }}>até −20%</span>
        </button>
      </div>

      {kind === "grupo" && (
        <>
          <div className="groupIntro">
            <span className="small" style={{ color: "var(--soft)" }}>
              Uma pessoa paga e convida os amigos. <b style={{ color: "var(--text)" }}>Cada um usa a própria conta, com as próprias horas</b> — ninguém gasta as horas do outro.
            </span>
            <div className="seg" role="radiogroup" aria-label="Plano do grupo">
              {(["criador", "pro"] as GroupPlan[]).map((g) => (
                <button key={g} role="radio" aria-checked={gPlan === g} className={gPlan === g ? "on" : ""} onClick={() => setGPlan(g)}>
                  {PLAN_INFO[g].name} · {PLAN_INFO[g].hours} h cada
                </button>
              ))}
            </div>
          </div>
          <section className="planGrid" aria-label="Planos em grupo">
            {GROUP_SIZES.map((g) => {
              const price = GROUP_PRICES[gPlan][g.id][period];
              const full = (period === "mensal" ? PLAN_INFO[gPlan].monthly : PLAN_INFO[gPlan].yearly) * g.people;
              const product = `${gPlan}_${g.id}_${period}`;
              return (
                <article key={g.id} className={`planCard ${g.id === "trio" ? "featured" : ""}`}>
                  {g.id === "trio" && <span className="ribbon">Melhor custo</span>}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <h2 className="sub" style={{ fontSize: 22 }}>
                      {PLAN_INFO[gPlan].name} {g.label}
                    </h2>
                    <span className="people" aria-label={`${g.people} pessoas`}>
                      {Array.from({ length: g.people }, (_, i) => (
                        <Icon key={i} name="user" size={15} />
                      ))}
                    </span>
                  </div>
                  <div>
                    <span className="price">{brl(price)}</span>
                    <span className="muted small"> /{period === "mensal" ? "mês" : "ano"}</span>
                  </div>
                  <span className="small" style={{ color: "#4ade80", fontWeight: 700, minHeight: 18 }}>
                    {brl(price / g.people)} por pessoa · economia de {brl(full - price)}
                  </span>
                  <ul className="perks">
                    <li>
                      <Icon name="check" size={15} color="#4ade80" width={3} /> {g.people} contas com plano {PLAN_INFO[gPlan].name}
                    </li>
                    <li>
                      <Icon name="check" size={15} color="#4ade80" width={3} /> {PLAN_INFO[gPlan].hours} horas por mês para cada um
                    </li>
                    <li>
                      <Icon name="check" size={15} color="#4ade80" width={3} /> {g.discount}% mais barato que {g.people} planos separados
                    </li>
                    <li>
                      <Icon name="check" size={15} color="#4ade80" width={3} /> Convite por código, troca de membros quando precisar
                    </li>
                  </ul>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: "auto" }}>
                    <button className="btn primary" disabled={!!busy} onClick={() => buy(product, "unico")}>
                      {busy === `${product}:unico` ? "Abrindo…" : period === "mensal" ? "Assinar 1 mês" : "Assinar 12 meses"}
                    </button>
                    <span className="muted" style={{ fontSize: 12, textAlign: "center" }}>
                      Pix ou cartão{period === "anual" ? " em até 12x" : ""}
                    </span>
                  </div>
                </article>
              );
            })}
          </section>
          <div className="toolbar">
            <span className="small" style={{ color: "var(--soft)" }}>
              Recebeu um código de grupo de um amigo? Entre no grupo dele e ganhe o plano sem pagar nada.
            </span>
            <button className="btn" onClick={onGroup}>
              <Icon name="users" size={16} /> Entrar num grupo
            </button>
          </div>
        </>
      )}

      {kind === "individual" && (
      <section className="planGrid" aria-label="Planos">
        {plans.map((id) => {
          const p = PLAN_INFO[id];
          const price = period === "mensal" ? p.monthly : p.yearly;
          const current = account?.plan === id;
          const product = `${id}_${period}`;
          return (
            <article key={id} className={`planCard ${id === "pro" ? "featured" : ""} ${current ? "current" : ""}`}>
              {id === "pro" && <span className="ribbon">Mais escolhido</span>}
              <h2 className="sub" style={{ fontSize: 22 }}>
                {p.name}
              </h2>
              <div>
                <span className="price">{brl(price)}</span>
                <span className="muted small"> /{period === "mensal" ? "mês" : "ano"}</span>
              </div>
              <span className="muted small" style={{ minHeight: 18 }}>
                {period === "anual" ? `Equivale a ${brl(price / 12)}/mês · economize ${brl(p.monthly * 12 - price)}` : `Só ${brl(price / p.hours)} por hora de vídeo`}
              </span>
              <ul className="perks">
                {p.perks.map((k) => (
                  <li key={k}>
                    <Icon name="check" size={15} color="#4ade80" width={3} /> {k}
                  </li>
                ))}
              </ul>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: "auto" }}>
                {ownsGroup ? (
                  <button className="btn" onClick={onGroup} title="Comprar um plano individual encerraria o seu grupo">
                    Você é dono de um grupo · renove em Meu grupo
                  </button>
                ) : (
                <button className="btn primary" disabled={!!busy} onClick={() => buy(product, "unico")}>
                  {busy === `${product}:unico` ? "Abrindo…" : current ? (period === "mensal" ? "Renovar +1 mês" : "Renovar +12 meses") : period === "mensal" ? "Assinar 1 mês" : "Assinar 12 meses"}
                </button>
                )}
                <span className="muted" style={{ fontSize: 12, textAlign: "center" }}>
                  Pix ou cartão{period === "anual" ? " em até 12x" : ""} · {current ? "o tempo soma ao que você já tem" : period === "mensal" ? "vale 30 dias" : "vale 12 meses"}
                </span>
              </div>
              {current && <span className="badge ai" style={{ alignSelf: "center" }}>Seu plano atual</span>}
            </article>
          );
        })}
      </section>
      )}

      <section className="card" aria-labelledby="avulsas" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <h2 id="avulsas" className="sub" style={{ fontSize: 18 }}>
            Precisa de mais horas?
          </h2>
          <span className="muted small">Horas avulsas não vencem e são usadas depois das horas do seu plano. Funcionam em qualquer plano, inclusive no Grátis.</span>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {HOUR_PACKS.map((h) => (
            <div key={h.id} className="pack">
              <b style={{ fontSize: 18 }}>+{h.hours} horas</b>
              <span className="price" style={{ fontSize: 22 }}>
                {brl(h.price)}
              </span>
              <button className="btn primary" disabled={!!busy} onClick={() => buy(h.id, "unico")}>
                {busy === `${h.id}:unico` ? "Abrindo…" : "Comprar"}
              </button>
            </div>
          ))}
        </div>
      </section>

      <span className="muted small">
        Pagamentos processados pela InfinitePay. O Clipei Cut não vê nem guarda os dados do seu cartão. Os planos são pré-pagos: nada é cobrado automaticamente — para continuar, é só renovar. Assinaturas antigas no cartão continuam e podem ser canceladas em Configurações.
      </span>
    </>
  );
}
