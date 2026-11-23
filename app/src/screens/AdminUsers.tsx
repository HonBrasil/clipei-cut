import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { brl } from "../lib/account";

export const PLAN_NAME: Record<string, string> = { free: "Grátis", criador: "Criador", pro: "Pro", studio: "Studio" };
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
const ACTION: Record<string, string> = {
  horas_adicionadas: "Horas adicionadas",
  horas_removidas: "Horas removidas",
  plano_definido: "Plano definido",
  plano_removido: "Plano removido",
  plano_estendido: "Plano estendido",
  renovacao_cancelada: "Renovação cancelada",
};

export async function adminCall<T>(body: Record<string, unknown>): Promise<T> {
  const { data: s } = await supabase.auth.getSession();
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${s.session?.access_token ?? ""}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out?.error?.message ?? `Erro ${res.status}`);
  return out as T;
}

export function hrs(seconds: number): string {
  const h = seconds / 3600;
  return `${h.toLocaleString("pt-BR", { maximumFractionDigits: h < 10 ? 1 : 0 })} h`;
}
const date = (s?: string | null) => (s ? new Date(s).toLocaleDateString("pt-BR") : "—");
const dateTime = (s?: string | null) =>
  s ? new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

type Row = {
  id: string;
  email: string;
  plan: string;
  plan_status: string;
  plan_expires_at: string | null;
  credits_seconds: number;
  extra_seconds: number;
  has_subscription: boolean;
  created_at: string;
  last_sign_in_at: string | null;
};

const PAGE = 25;

export function AdminUsers({ onOpen }: { onOpen: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [plan, setPlan] = useState("");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const load = useCallback(async (q: string, p: string, pg: number) => {
    const id = ++reqId.current;
    setBusy(true);
    setError(null);
    try {
      const r = await adminCall<{ total: number; users: Row[] }>({ action: "list", query: q, plan: p, limit: PAGE, offset: pg * PAGE });
      if (id !== reqId.current) return;
      setRows(r.users);
      setTotal(r.total);
    } catch (e) {
      if (id === reqId.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (id === reqId.current) setBusy(false);
    }
  }, []);

  // Busca enquanto digita (com uma pequena espera)
  useEffect(() => {
    const t = setTimeout(() => load(query, plan, page), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [query, plan, page, load]);

  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <section className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }} aria-label="Usuários">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <input
          className="input"
          style={{ flex: "1 1 260px" }}
          type="search"
          placeholder="Buscar por e-mail…"
          value={query}
          autoFocus
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          aria-label="Buscar por e-mail"
        />
        <div className="seg" role="tablist" aria-label="Filtrar por plano">
          {["", "free", "criador", "pro", "studio"].map((p) => (
            <button
              key={p || "todos"}
              role="tab"
              aria-selected={plan === p}
              className={plan === p ? "on" : ""}
              onClick={() => {
                setPlan(p);
                setPage(0);
              }}
            >
              {p ? PLAN_NAME[p] : "Todos"}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="muted small">
        {busy ? "Buscando…" : `${total} conta${total === 1 ? "" : "s"}`}
        {total > PAGE && ` · página ${page + 1} de ${pages}`}
      </div>

      <div className="userList" role="list">
        <div className="userRow head" aria-hidden>
          <span>E-mail</span>
          <span>Plano</span>
          <span>Saldo</span>
          <span className="hideSm">Último acesso</span>
          <span className="hideSm">Criada em</span>
        </div>
        {rows.map((u) => (
          <button key={u.id} className="userRow" role="listitem" onClick={() => onOpen(u.id)} title={`Abrir perfil de ${u.email}`}>
            <span className="email">{u.email}</span>
            <span>
              <PlanBadge plan={u.plan} status={u.plan_status} />
            </span>
            <span>{hrs(u.credits_seconds + u.extra_seconds)}</span>
            <span className="muted hideSm">{date(u.last_sign_in_at)}</span>
            <span className="muted hideSm">{date(u.created_at)}</span>
          </button>
        ))}
        {!busy && rows.length === 0 && <div className="muted small" style={{ padding: "18px 0" }}>Nenhuma conta encontrada.</div>}
      </div>

      {total > PAGE && (
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn" disabled={page === 0 || busy} onClick={() => setPage((p) => p - 1)}>
            ← Anterior
          </button>
          <button className="btn" disabled={page + 1 >= pages || busy} onClick={() => setPage((p) => p + 1)}>
            Próxima →
          </button>
        </div>
      )}
    </section>
  );
}

export function PlanBadge({ plan, status }: { plan: string; status?: string }) {
  const paid = plan !== "free";
  const cancelled = paid && status === "cancelled";
  return (
    <span className={`badge ${paid ? (cancelled ? "warn" : "ok") : "free"}`}>
      {PLAN_NAME[plan] ?? plan}
      {cancelled && " · não renova"}
    </span>
  );
}

type Detail = {
  user: { id: string; email: string; createdAt: string; lastSignIn: string | null; confirmed: boolean };
  profile: {
    plan: string;
    planPeriod: string | null;
    planMethod: string | null;
    planStatus: string;
    planExpiresAt: string | null;
    creditsSeconds: number;
    extraSeconds: number;
    allowanceSeconds: number;
    cycleStart: string;
    hasSubscription: boolean;
    trialClaimed: boolean;
    termsVersion: string | null;
  };
  usage: { analyses: number; seconds: number; last: string | null };
  payments: Array<{ id: string; product: string; amount: number; method: string | null; created_at: string }>;
  actions: Array<{ id: number; admin_email: string; action: string; details: Record<string, unknown>; note: string | null; created_at: string }>;
};

type Pending = { label: string; body: Record<string, unknown>; danger?: boolean };

const DURATIONS = [
  { d: 7, l: "7 dias" },
  { d: 30, l: "30 dias" },
  { d: 90, l: "3 meses" },
  { d: 365, l: "1 ano" },
];

export function UserDrawer({ userId, onClose, onChanged }: { userId: string; onClose: () => void; onChanged?: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hours, setHours] = useState("1");
  const [plan, setPlan] = useState("pro");
  const [days, setDays] = useState(30);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [tab, setTab] = useState<"pag" | "hist">("hist");

  useEffect(() => {
    let alive = true;
    adminCall<Detail>({ action: "detail", userId })
      .then((r) => {
        if (!alive) return;
        setD(r);
        if (r.profile.plan !== "free") setPlan(r.profile.plan);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [userId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (pending ? setPending(null) : onClose());
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  const run = async (p: Pending) => {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const r = await adminCall<Detail>({ ...p.body, userId, note });
      setD(r);
      setOk(`${p.label} ✓`);
      setNote("");
      setPending(null);
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  const h = Number(hours.replace(",", "."));
  const hoursValid = Number.isFinite(h) && h > 0 && h <= 1000;
  const p = d?.profile;
  const balance = p ? p.creditsSeconds + p.extraSeconds : 0;

  return (
    <div className="modalBack drawerBack" role="dialog" aria-modal="true" aria-labelledby="u-title" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawerHead">
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <span className="eyebrow">Perfil da conta</span>
            <h2 id="u-title" className="sub" style={{ fontSize: 18, overflow: "hidden", textOverflow: "ellipsis" }} title={d?.user.email}>
              {d?.user.email ?? "Carregando…"}
            </h2>
          </div>
          <button className="btn" onClick={onClose} aria-label="Fechar">
            Fechar
          </button>
        </div>

        <div className="drawerBody">
          {error && <div className="error">{error}</div>}
          {ok && <div className="okMsg" role="status">{ok}</div>}

          {!d && !error && <div className="muted small">Carregando perfil…</div>}

          {d && p && (
            <>
              <div className="kpis" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
                <div className="stat">
                  <span className="muted small">Plano</span>
                  <span>
                    <PlanBadge plan={p.plan} status={p.planStatus} />
                  </span>
                  <span className="muted small">
                    {p.plan === "free" ? (p.trialClaimed ? "Usou o teste grátis" : "Teste ainda não liberado") : `Vence em ${date(p.planExpiresAt)}`}
                  </span>
                </div>
                <div className="stat">
                  <span className="muted small">Saldo</span>
                  <span className="big" style={{ fontSize: 24 }}>{hrs(balance)}</span>
                  <span className="muted small">
                    {hrs(p.creditsSeconds)} do plano · {hrs(p.extraSeconds)} avulsas
                  </span>
                </div>
                <div className="stat">
                  <span className="muted small">Uso</span>
                  <span className="big" style={{ fontSize: 24 }}>{hrs(d.usage.seconds)}</span>
                  <span className="muted small">
                    {d.usage.analyses} análises · última {date(d.usage.last)}
                  </span>
                </div>
              </div>

              <div className="kvList">
                <div className="kv">
                  <span>Conta criada</span>
                  <b>{dateTime(d.user.createdAt)}</b>
                </div>
                <div className="kv">
                  <span>Último acesso</span>
                  <b>{dateTime(d.user.lastSignIn)}</b>
                </div>
                <div className="kv">
                  <span>Cobrança</span>
                  <b>
                    {p.plan === "free"
                      ? "—"
                      : p.planMethod === "grupo"
                        ? "Membro de um grupo (o dono paga)"
                        : p.hasSubscription
                        ? `Cartão recorrente${p.planStatus === "cancelled" ? " (cancelada)" : ""}`
                        : `Avulso · ${p.planPeriod ?? "—"}`}
                  </b>
                </div>
                <div className="kv">
                  <span>Termos aceitos</span>
                  <b>{p.termsVersion ?? "Ainda não"}</b>
                </div>
              </div>

              {/* Horas */}
              <section className="adminBox" aria-labelledby="u-horas">
                <h3 id="u-horas">Horas</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {[1, 5, 10, 20].map((n) => (
                    <button key={n} className={`chip sm ${hours === String(n) ? "on" : ""}`} onClick={() => setHours(String(n))}>
                      {n} h
                    </button>
                  ))}
                  <input
                    className="input"
                    style={{ width: 110 }}
                    inputMode="decimal"
                    value={hours}
                    onChange={(e) => setHours(e.target.value.replace(/[^0-9.,]/g, ""))}
                    aria-label="Quantidade de horas"
                  />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <button
                    className="btn primary"
                    disabled={!hoursValid || busy}
                    onClick={() => setPending({ label: `Adicionar ${hours} h`, body: { action: "hours", hours: h } })}
                  >
                    + Adicionar {hoursValid ? `${hours} h` : ""}
                  </button>
                  <button
                    className="btn"
                    disabled={!hoursValid || busy || balance === 0}
                    onClick={() => setPending({ label: `Remover ${hours} h`, body: { action: "hours", hours: -h }, danger: true })}
                  >
                    − Remover {hoursValid ? `${hours} h` : ""}
                  </button>
                </div>
                <span className="muted" style={{ fontSize: 12 }}>
                  Horas adicionadas entram como avulsas (não vencem com o mês). Ao remover, saem primeiro das avulsas e depois das do plano.
                </span>
              </section>

              {/* Assinatura */}
              <section className="adminBox" aria-labelledby="u-plano">
                <h3 id="u-plano">Assinatura</h3>
                <div className="seg" role="radiogroup" aria-label="Plano">
                  {["criador", "pro", "studio"].map((k) => (
                    <button key={k} role="radio" aria-checked={plan === k} className={plan === k ? "on" : ""} onClick={() => setPlan(k)}>
                      {PLAN_NAME[k]}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {DURATIONS.map((x) => (
                    <button key={x.d} className={`chip sm ${days === x.d ? "on" : ""}`} onClick={() => setDays(x.d)}>
                      {x.l}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <button
                    className="btn primary"
                    disabled={busy}
                    onClick={() =>
                      setPending({ label: `Plano ${PLAN_NAME[plan]} por ${DURATIONS.find((x) => x.d === days)?.l}`, body: { action: "plan", plan, days } })
                    }
                  >
                    {p.plan === "free" ? "Dar plano" : "Trocar / renovar plano"}
                  </button>
                  {p.plan !== "free" && (
                    <button
                      className="btn"
                      disabled={busy}
                      onClick={() => setPending({ label: `Estender ${DURATIONS.find((x) => x.d === days)?.l}`, body: { action: "extend", days } })}
                    >
                      Estender vencimento
                    </button>
                  )}
                </div>
                <span className="muted" style={{ fontSize: 12 }}>
                  "Dar/trocar" começa hoje e recarrega as horas do plano. "Estender" só empurra o vencimento, sem mexer nas horas.
                </span>
                {p.plan !== "free" && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                    {p.hasSubscription && p.planStatus !== "cancelled" && (
                      <button
                        className="btn"
                        disabled={busy}
                        onClick={() =>
                          setPending({
                            label: "Cancelar renovação automática",
                            body: { action: "cancel_renewal" },
                            danger: true,
                          })
                        }
                      >
                        Cancelar renovação no cartão
                      </button>
                    )}
                    <button
                      className="btn danger"
                      disabled={busy}
                      onClick={() => setPending({ label: "Tirar o plano agora", body: { action: "plan", plan: "free", days: 0 }, danger: true })}
                    >
                      Tirar plano agora
                    </button>
                  </div>
                )}
              </section>

              <div className="field">
                <label htmlFor="u-note">Motivo (opcional, fica no histórico)</label>
                <input id="u-note" className="input" maxLength={300} placeholder="Ex.: cortesia, reembolso, erro no pagamento…" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>

              {/* Histórico */}
              <section className="adminBox" style={{ gap: 10 }}>
                <div className="seg" role="tablist">
                  <button role="tab" aria-selected={tab === "hist"} className={tab === "hist" ? "on" : ""} onClick={() => setTab("hist")}>
                    Alterações do admin ({d.actions.length})
                  </button>
                  <button role="tab" aria-selected={tab === "pag"} className={tab === "pag" ? "on" : ""} onClick={() => setTab("pag")}>
                    Pagamentos ({d.payments.length})
                  </button>
                </div>
                {tab === "pag" &&
                  (d.payments.length ? (
                    d.payments.map((x) => (
                      <div key={x.id} className="kv">
                        <span>
                          {PRODUCT[x.product] ?? x.product} · {date(x.created_at)}
                        </span>
                        <b>{brl(Number(x.amount))}</b>
                      </div>
                    ))
                  ) : (
                    <span className="muted small">Nenhum pagamento.</span>
                  ))}
                {tab === "hist" &&
                  (d.actions.length ? (
                    d.actions.map((a) => (
                      <div key={a.id} className="histItem">
                        <div className="kv">
                          <span>{describe(a)}</span>
                          <span className="muted small">{dateTime(a.created_at)}</span>
                        </div>
                        {a.note && <span className="muted small">“{a.note}”</span>}
                      </div>
                    ))
                  ) : (
                    <span className="muted small">Nenhuma alteração manual ainda.</span>
                  ))}
              </section>
            </>
          )}
        </div>

        {pending && (
          <div className="confirmBar" role="alertdialog" aria-label="Confirmar">
            <span>
              Confirmar: <b>{pending.label}</b> para {d?.user.email}?
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" onClick={() => setPending(null)} disabled={busy}>
                Voltar
              </button>
              <button className={`btn ${pending.danger ? "danger" : "primary"}`} onClick={() => run(pending)} disabled={busy} autoFocus>
                {busy ? "Aplicando…" : "Confirmar"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function describe(a: Detail["actions"][number]): string {
  const det = a.details ?? {};
  const base = ACTION[a.action] ?? a.action;
  if (a.action.startsWith("horas")) return `${base}: ${hrs(Math.abs(Number(det.segundos ?? 0)))}`;
  if (a.action === "plano_definido") return `${base}: ${PLAN_NAME[String(det.plano)] ?? det.plano} por ${det.dias} dias`;
  if (a.action === "plano_estendido") return `${base}: +${det.dias} dias`;
  return base;
}
