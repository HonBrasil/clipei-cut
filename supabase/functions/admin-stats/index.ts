// Números do negócio para o painel de administração.
// Só responde para o e-mail de administrador (confirmado no login do Supabase).
import { admin, corsHeaders, fail, json, requireUser } from "../_shared/common.ts";

const ADMINS = (Deno.env.get("ADMIN_EMAILS") ?? "g4master01@gmail.com").split(",").map((e) => e.trim().toLowerCase());
const MP_FEE = 0.0499; // pior taxa do Mercado Pago (usada para estimar o líquido)
const AI_COST_PER_HOUR_BRL = 0.21; // transcrição + IA (estimativa)

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("metodo", "Use POST.", 405);

  const user = await requireUser(req);
  const email = user?.email?.toLowerCase() ?? "";
  if (!user || !ADMINS.includes(email) || !user.email_confirmed_at) return fail("proibido", "Acesso restrito.", 403);

  const db = admin();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const prevStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString();
  const day7 = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const count = async (q: any) => {
    const { count: c } = await q;
    return c ?? 0;
  };
  const profiles = () => db.from("profiles").select("id", { count: "exact", head: true });

  const [totalUsers, newMonth, new7, active, cancelled, criador, pro, studio, recorrentes] = await Promise.all([
    count(profiles()),
    count(profiles().gte("created_at", monthStart)),
    count(profiles().gte("created_at", day7)),
    count(profiles().neq("plan", "free").eq("plan_status", "active")),
    count(profiles().neq("plan", "free").eq("plan_status", "cancelled")),
    count(profiles().eq("plan", "criador")),
    count(profiles().eq("plan", "pro")),
    count(profiles().eq("plan", "studio")),
    count(profiles().neq("plan", "free").not("mp_preapproval_id", "is", null)),
  ]);

  const { data: payMonth } = await db.from("payments").select("amount, product").gte("created_at", monthStart);
  const { data: payPrev } = await db.from("payments").select("amount").gte("created_at", prevStart).lt("created_at", monthStart);
  const sum = (rows: Array<{ amount: number | string | null }> | null) => (rows ?? []).reduce((n, r) => n + Number(r.amount ?? 0), 0);
  const grossMonth = sum(payMonth);
  const grossPrev = sum(payPrev);

  const byProduct: Record<string, { qty: number; total: number }> = {};
  for (const r of payMonth ?? []) {
    const k = String(r.product);
    byProduct[k] = byProduct[k] ?? { qty: 0, total: 0 };
    byProduct[k].qty++;
    byProduct[k].total += Number(r.amount ?? 0);
  }

  // Uso de IA no mês (segundos de áudio transcritos)
  let usedSeconds = 0;
  let analyses = 0;
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("usage_events").select("audio_seconds").eq("kind", "transcribe").gte("created_at", monthStart).range(from, from + 999);
    if (!data?.length) break;
    for (const r of data) usedSeconds += Number(r.audio_seconds ?? 0);
    analyses += data.length;
    if (data.length < 1000) break;
  }

  const { data: recent } = await db.from("payments").select("id, user_id, product, amount, method, created_at").order("created_at", { ascending: false }).limit(10);
  const recentWithEmail = await Promise.all(
    (recent ?? []).map(async (p) => {
      const { data } = await db.auth.admin.getUserById(p.user_id);
      return { ...p, email: data.user?.email ?? "—" };
    }),
  );

  const { data: newest } = await db.from("profiles").select("id, plan, created_at").order("created_at", { ascending: false }).limit(8);
  const newestWithEmail = await Promise.all(
    (newest ?? []).map(async (p) => {
      const { data } = await db.auth.admin.getUserById(p.id);
      return { plan: p.plan, created_at: p.created_at, email: data.user?.email ?? "—" };
    }),
  );

  const usedHours = usedSeconds / 3600;
  const aiCost = usedHours * AI_COST_PER_HOUR_BRL;
  const netMonth = grossMonth * (1 - MP_FEE);

  return json({
    generatedAt: now.toISOString(),
    users: { total: totalUsers, newMonth, new7 },
    subscriptions: { active, cancelled, recorrentes, byPlan: { criador, pro, studio } },
    revenue: { grossMonth, netMonth, grossPrev, payments: (payMonth ?? []).length, byProduct },
    usage: { hours: usedHours, analyses, aiCost, profitEstimate: netMonth - aiCost },
    recentPayments: recentWithEmail,
    newestUsers: newestWithEmail,
  });
});
