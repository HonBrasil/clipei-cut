import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { brl } from "../lib/account";
import { AdminUsers, UserDrawer } from "./AdminUsers";
import { AdminCreators } from "./AdminCreators";

type Stats = {
  generatedAt: string;
  users: { total: number; newMonth: number; new7: number };
  subscriptions: { active: number; cancelled: number; recorrentes: number; byPlan: { criador: number; pro: number; studio: number } };
  revenue: { grossMonth: number; netMonth: number; grossPrev: number; payments: number; byProduct: Record<string, { qty: number; total: number }> };
  usage: { hours: number; analyses: number; aiCost: number; profitEstimate: number };
  recentPayments: Array<{ id: string; user_id: string | null; email: string; product: string; amount: number; method: string | null; created_at: string }>;
  newestUsers: Array<{ id: string; email: string; plan: string; created_at: string }>;
};

const PRODUCT: Record<string, string> = {
  criador_mensal: "Criador mensal",
  pro_mensal: "Pro mensal",
  studio_mensal: "Studio mensal",
  criador_anual: "Criador anual",
  pro_anual: "Pro anual",
  studio_anual: "Studio anual",
  horas_5: "+5 horas",
  horas_20: "+20 horas",
};
const PLAN: Record<string, string> = { free: "Grátis", criador: "Criador", pro: "Pro", studio: "Studio" };

export function Admin() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"geral" | "usuarios" | "criadores">("geral");
  const [openUser, setOpenUser] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-stats`, {
        method: "POST",
        headers: { Authorization: `Bearer ${s.session?.access_token ?? ""}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error?.message ?? `Erro ${res.status}`);
      setStats(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const [statsStale, setStatsStale] = useState(false);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (view === "geral" && statsStale && !openUser) {
      setStatsStale(false);
      load();
    }
  }, [view, statsStale, openUser, load]);

  const r = stats?.revenue;
  const growth = r && r.grossPrev > 0 ? ((r.grossMonth - r.grossPrev) / r.grossPrev) * 100 : null;
  const monthName = new Date().toLocaleDateString("pt-BR", { month: "long" });

  return (
    <>
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="eyebrow">Visível só para a administração</span>
          <h1 className="title">
            <span className="sl">//</span> Painel <em>admin</em>
          </h1>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {stats && <span className="muted small">Atualizado às {new Date(stats.generatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>}
          <button className="btn" onClick={load} disabled={busy}>
            {busy ? "Carregando…" : "Atualizar"}
          </button>
        </div>
      </header>

      <div className="seg" role="tablist" aria-label="Seções do painel" style={{ alignSelf: "flex-start" }}>
        <button role="tab" aria-selected={view === "geral"} className={view === "geral" ? "on" : ""} onClick={() => setView("geral")}>
          Visão geral
        </button>
        <button role="tab" aria-selected={view === "usuarios"} className={view === "usuarios" ? "on" : ""} onClick={() => setView("usuarios")}>
          Usuários
        </button>
        <button role="tab" aria-selected={view === "criadores"} className={view === "criadores" ? "on" : ""} onClick={() => setView("criadores")}>
          Criadores
        </button>
      </div>

      {view === "usuarios" && <AdminUsers onOpen={setOpenUser} />}
      {view === "criadores" && <AdminCreators onOpen={setOpenUser} />}
      {openUser && <UserDrawer userId={openUser} onClose={() => setOpenUser(null)} onChanged={() => setStatsStale(true)} />}

      {view === "geral" && error && <div className="error">Não consegui carregar o painel: {error}</div>}

      {view === "geral" && stats && (
        <>
          <section className="kpis" aria-label="Resumo">
            <div className="stat">
              <span className="muted small">Faturamento de {monthName}</span>
              <span className="big">{brl(stats.revenue.grossMonth)}</span>
              <span className="muted small">
                Líquido estimado {brl(stats.revenue.netMonth)}
                {growth != null && (
                  <b style={{ color: growth >= 0 ? "var(--green)" : "var(--red-text)", marginLeft: 6 }}>
                    {growth >= 0 ? "▲" : "▼"} {Math.abs(growth).toFixed(0)}% vs mês passado
                  </b>
                )}
              </span>
            </div>
            <div className="stat">
              <span className="muted small">Assinaturas ativas</span>
              <span className="big">{stats.subscriptions.active}</span>
              <span className="muted small">
                {stats.subscriptions.recorrentes} no cartão recorrente · {stats.subscriptions.cancelled} canceladas (até vencer)
              </span>
            </div>
            <div className="stat">
              <span className="muted small">Contas criadas</span>
              <span className="big">{stats.users.total}</span>
              <span className="muted small">
                +{stats.users.newMonth} este mês · +{stats.users.new7} nos últimos 7 dias
              </span>
            </div>
            <div className="stat">
              <span className="muted small">Uso de IA no mês</span>
              <span className="big">{stats.usage.hours.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h</span>
              <span className="muted small">
                {stats.usage.analyses} análises · custo estimado {brl(stats.usage.aiCost)}
              </span>
            </div>
          </section>

          <div className="settingsGrid">
            <section className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-labelledby="a-planos">
              <h2 id="a-planos" className="sub" style={{ fontSize: 17 }}>
                Clientes por plano
              </h2>
              {(["criador", "pro", "studio"] as const).map((k) => {
                const n = stats.subscriptions.byPlan[k];
                const max = Math.max(1, stats.subscriptions.byPlan.criador, stats.subscriptions.byPlan.pro, stats.subscriptions.byPlan.studio);
                return (
                  <div key={k} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div className="kv">
                      <span>{PLAN[k]}</span>
                      <b>{n}</b>
                    </div>
                    <div className="bar red">
                      <div style={{ width: `${(n / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
              <div className="kv" style={{ marginTop: 6 }}>
                <span>Grátis</span>
                <b>{Math.max(0, stats.users.total - stats.subscriptions.byPlan.criador - stats.subscriptions.byPlan.pro - stats.subscriptions.byPlan.studio)}</b>
              </div>
            </section>

            <section className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }} aria-labelledby="a-vendas">
              <h2 id="a-vendas" className="sub" style={{ fontSize: 17 }}>
                Vendas de {monthName}
              </h2>
              {Object.keys(stats.revenue.byProduct).length === 0 && <span className="muted small">Nenhuma venda ainda este mês.</span>}
              {Object.entries(stats.revenue.byProduct)
                .sort((a, b) => b[1].total - a[1].total)
                .map(([k, v]) => (
                  <div key={k} className="kv">
                    <span>
                      {PRODUCT[k] ?? k} · {v.qty}×
                    </span>
                    <b>{brl(v.total)}</b>
                  </div>
                ))}
              <div className="kv" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                <span>Lucro estimado (líquido − IA)</span>
                <b style={{ color: "var(--green)" }}>{brl(stats.usage.profitEstimate)}</b>
              </div>
              <span className="muted" style={{ fontSize: 12 }}>Estimativas antes de impostos. Líquido calculado com a taxa de 4,99% do Mercado Pago.</span>
            </section>
          </div>

          <div className="settingsGrid">
            <section className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }} aria-labelledby="a-pag">
              <h2 id="a-pag" className="sub" style={{ fontSize: 17 }}>
                Últimos pagamentos
              </h2>
              {stats.recentPayments.length === 0 && <span className="muted small">Nenhum pagamento ainda.</span>}
              <div className="adminTable" role="table">
                {stats.recentPayments.map((p) => (
                  <div
                    key={p.id}
                    className={`adminRow${p.user_id ? " click" : ""}`}
                    role="row"
                    tabIndex={p.user_id ? 0 : -1}
                    onClick={() => p.user_id && setOpenUser(p.user_id)}
                    onKeyDown={(e) => e.key === "Enter" && p.user_id && setOpenUser(p.user_id)}
                  >
                    <span title={p.email}>{p.email}</span>
                    <span className="muted">{PRODUCT[p.product] ?? p.product}</span>
                    <b>{brl(Number(p.amount))}</b>
                    <span className="muted">{new Date(p.created_at).toLocaleDateString("pt-BR")}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }} aria-labelledby="a-novos">
              <h2 id="a-novos" className="sub" style={{ fontSize: 17 }}>
                Contas mais recentes
              </h2>
              <div className="adminTable" role="table">
                {stats.newestUsers.map((u, i) => (
                  <div
                    key={u.id ?? i}
                    className="adminRow click"
                    role="row"
                    tabIndex={0}
                    style={{ gridTemplateColumns: "minmax(0, 2fr) 1fr 1fr" }}
                    onClick={() => u.id && setOpenUser(u.id)}
                    onKeyDown={(e) => e.key === "Enter" && u.id && setOpenUser(u.id)}
                  >
                    <span title={u.email}>{u.email}</span>
                    <span className="muted">{PLAN[u.plan] ?? u.plan}</span>
                    <span className="muted">{new Date(u.created_at).toLocaleDateString("pt-BR")}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}
