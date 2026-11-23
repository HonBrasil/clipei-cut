import { useCallback, useEffect, useState } from "react";
import { brl } from "../lib/account";
import { adminCall } from "./AdminUsers";

type CreatorRow = {
  user_id: string;
  email: string;
  code: string;
  active: boolean;
  referrer_seconds: number;
  referred_seconds: number;
  discount_pct: number;
  commission_pct: number;
  invited: number;
  converted: number;
  active_subs: number;
  revenue: number;
  created_at: string;
};
type UserHit = { id: string; email: string };

const TIER = (n: number) => (n >= 25 ? "🥇 Ouro" : n >= 10 ? "🥈 Prata" : n >= 3 ? "🥉 Bronze" : "Início");

type Draft = { userId: string; email: string; code: string; referrerHours: number; referredHours: number; discountPct: number; commissionPct: number; active: boolean };

export function AdminCreators({ onOpen }: { onOpen: (id: string) => void }) {
  const [list, setList] = useState<CreatorRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<UserHit[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await adminCall<{ creators: CreatorRow[] }>({ action: "creators" });
      setList(r.creators);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // Busca de contas para transformar em criador
  useEffect(() => {
    if (q.trim().length < 3) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await adminCall<{ users: UserHit[] }>({ action: "list", query: q.trim(), limit: 6 });
        setHits(r.users);
      } catch {
        setHits([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const startNew = (u: UserHit) => {
    const base = u.email.split("@")[0].toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
    setDraft({ userId: u.id, email: u.email, code: base, referrerHours: 5, referredHours: 2, discountPct: 15, commissionPct: 20, active: true });
    setQ("");
    setHits([]);
  };
  const edit = (c: CreatorRow) =>
    setDraft({
      userId: c.user_id,
      email: c.email,
      code: c.code,
      referrerHours: c.referrer_seconds / 3600,
      referredHours: c.referred_seconds / 3600,
      discountPct: c.discount_pct,
      commissionPct: c.commission_pct,
      active: c.active,
    });

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await adminCall({ action: "creator_set", ...draft });
      setOk(`${draft.email} agora é criador com o código ${draft.code}.`);
      setDraft(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function turnOff(c: CreatorRow) {
    setBusy(true);
    try {
      await adminCall({ action: "creator_off", userId: c.user_id });
      setOk(`${c.email} não é mais criador.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const totalRevenue = list.reduce((n, c) => n + Number(c.revenue), 0);
  const totalSubs = list.reduce((n, c) => n + c.active_subs, 0);

  return (
    <section className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }} aria-label="Criadores parceiros">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <b>Criadores parceiros</b>
          <span className="muted small">
            {list.filter((c) => c.active).length} ativos · {totalSubs} assinantes ativos trazidos · {brl(totalRevenue)} em vendas
          </span>
        </div>
        <div style={{ position: "relative", flex: "1 1 280px", maxWidth: 380 }}>
          <input className="input" style={{ width: "100%" }} placeholder="Adicionar criador: buscar e-mail…" value={q} onChange={(e) => setQ(e.target.value)} />
          {hits.length > 0 && (
            <div className="hitList">
              {hits.map((h) => (
                <button key={h.id} onClick={() => startNew(h)}>
                  {h.email}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {ok && <div className="okMsg">{ok}</div>}

      {draft && (
        <div className="adminBox">
          <h3>{list.some((c) => c.user_id === draft.userId) ? "Editar criador" : "Novo criador"} · {draft.email}</h3>
          <div className="creatorForm">
            <div className="field">
              <label>Código (cupom)</label>
              <input className="input" value={draft.code} maxLength={16} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} />
            </div>
            <div className="field">
              <label>Horas p/ criador por assinante</label>
              <input className="input" type="number" min={0} max={50} value={draft.referrerHours} onChange={(e) => setDraft({ ...draft, referrerHours: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>Horas p/ seguidor</label>
              <input className="input" type="number" min={0} max={20} value={draft.referredHours} onChange={(e) => setDraft({ ...draft, referredHours: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>Desconto do seguidor (1º pagamento) %</label>
              <input className="input" type="number" min={0} max={50} value={draft.discountPct} onChange={(e) => setDraft({ ...draft, discountPct: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>Comissão (só registro, fase 2) %</label>
              <input className="input" type="number" min={0} max={50} value={draft.commissionPct} onChange={(e) => setDraft({ ...draft, commissionPct: Number(e.target.value) })} />
            </div>
          </div>
          <span className="muted" style={{ fontSize: 12 }}>
            Metas automáticas: 3 assinantes ativos = Criador grátis · 10 = Pro grátis · 25 = Studio grátis (enquanto mantiver a meta).
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primary" disabled={busy || draft.code.length < 3} onClick={save}>
              {busy ? "Salvando…" : "Salvar criador"}
            </button>
            <button className="btn" onClick={() => setDraft(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="creatorTable" role="table">
        <div className="creatorRow head" role="row">
          <span>Criador</span>
          <span>Código</span>
          <span>Nível</span>
          <span>Ativos</span>
          <span className="hideSm">Cadastros</span>
          <span className="hideSm">Vendas</span>
          <span />
        </div>
        {list.map((c) => (
          <div key={c.user_id} className={`creatorRow ${c.active ? "" : "off"}`} role="row">
            <button className="linkBtn email" onClick={() => onOpen(c.user_id)} title="Abrir perfil">
              {c.email}
            </button>
            <b>{c.code}</b>
            <span>{c.active ? TIER(c.active_subs) : "Desativado"}</span>
            <span>{c.active_subs}</span>
            <span className="hideSm">
              {c.invited} ({c.converted} pagaram)
            </span>
            <span className="hideSm">{brl(Number(c.revenue))}</span>
            <span style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              <button className="btn sm" onClick={() => edit(c)}>
                Editar
              </button>
              {c.active && (
                <button className="btn sm" disabled={busy} onClick={() => turnOff(c)}>
                  Desativar
                </button>
              )}
            </span>
          </div>
        ))}
        {!list.length && <span className="muted small" style={{ padding: "12px 0" }}>Nenhum criador ainda. Busque o e-mail acima para adicionar.</span>}
      </div>
    </section>
  );
}
