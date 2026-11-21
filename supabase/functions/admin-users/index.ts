// Gestão de contas pelo painel admin: buscar, ver perfil, dar/tirar horas e mudar assinatura.
// Só responde para o e-mail de administrador (confirmado no login do Supabase).
import { admin, corsHeaders, fail, json, requireUser } from "../_shared/common.ts";
import { mp } from "../_shared/mp.ts";

const ADMINS = (Deno.env.get("ADMIN_EMAILS") ?? "g4master01@gmail.com").split(",").map((e) => e.trim().toLowerCase());
const PLANS = ["free", "criador", "pro", "studio"];
const MAX_HOURS = 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("metodo", "Use POST.", 405);

  const me = await requireUser(req);
  const adminEmail = me?.email?.toLowerCase() ?? "";
  if (!me || !ADMINS.includes(adminEmail) || !me.email_confirmed_at) return fail("proibido", "Acesso restrito.", 403);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const userId = typeof body.userId === "string" ? body.userId : "";
  const note = typeof body.note === "string" ? body.note.slice(0, 300).trim() : "";
  const db = admin();

  const needUser = () => /^[0-9a-f-]{36}$/i.test(userId);

  try {
    if (action === "list") {
      const q = String(body.query ?? "").replace(/[%_\\]/g, "").trim().slice(0, 120);
      const plan = PLANS.includes(body.plan) ? body.plan : "";
      const limit = Math.min(Math.max(Number(body.limit) || 25, 1), 100);
      const offset = Math.max(Number(body.offset) || 0, 0);
      const { data, error } = await db.rpc("admin_find_users", { p_query: q, p_plan: plan, p_limit: limit, p_offset: offset });
      if (error) throw error;
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      return json({ total: Number(rows[0]?.total ?? 0), users: rows.map(({ total: _t, ...r }) => r) });
    }

    if (!needUser()) return fail("conta", "Conta inválida.");

    if (action === "detail") return json(await detail(db, userId));

    if (action === "hours") {
      const hours = Number(body.hours);
      if (!Number.isFinite(hours) || hours === 0 || Math.abs(hours) > MAX_HOURS) return fail("horas", `Informe entre -${MAX_HOURS} e ${MAX_HOURS} horas (diferente de zero).`);
      const { error } = await db.rpc("admin_adjust_hours", { p_user: userId, p_seconds: Math.round(hours * 3600), p_admin: adminEmail, p_note: note });
      if (error) throw error;
      return json(await detail(db, userId));
    }

    if (action === "plan" || action === "extend") {
      const plan = String(body.plan ?? "");
      const days = Math.round(Number(body.days) || 0);
      if (action === "plan" && !PLANS.includes(plan)) return fail("plano", "Plano inválido.");
      if ((action === "extend" || plan !== "free") && (days < 1 || days > 3660)) return fail("dias", "Informe de 1 a 3660 dias.");

      // Tirar o plano: cancela também a renovação no Mercado Pago, para não cobrar de novo
      if (action === "plan" && plan === "free") {
        const cancelled = await cancelRecurring(db, userId);
        if (cancelled === "erro") return fail("provedor", "Não consegui cancelar a renovação no Mercado Pago. Tente de novo.", 502);
      }
      const { error } = await db.rpc("admin_set_plan", {
        p_user: userId,
        p_plan: action === "extend" ? "free" : plan, // ignorado no modo extend
        p_days: days,
        p_mode: action === "extend" ? "extend" : "set",
        p_admin: adminEmail,
        p_note: note,
      });
      if (error) throw error;
      return json(await detail(db, userId));
    }

    if (action === "cancel_renewal") {
      const r = await cancelRecurring(db, userId);
      if (r === "sem") return fail("sem_assinatura", "Esta conta não tem renovação automática.");
      if (r === "erro") return fail("provedor", "Não consegui cancelar no Mercado Pago. Tente de novo.", 502);
      await db.from("profiles").update({ plan_status: "cancelled" }).eq("id", userId);
      await db.from("admin_actions").insert({ user_id: userId, admin_email: adminEmail, action: "renovacao_cancelada", note: note || null });
      return json(await detail(db, userId));
    }

    return fail("acao", "Ação desconhecida.");
  } catch (e) {
    const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e);
    console.error("admin-users", action, msg);
    const known: Record<string, string> = {
      conta_nao_encontrada: "Conta não encontrada.",
      sem_plano_para_estender: "Esta conta está no plano Grátis: defina um plano em vez de estender.",
      dias_invalidos: "Informe de 1 a 3660 dias.",
      plano_invalido: "Plano inválido.",
    };
    const k = Object.keys(known).find((c) => msg.includes(c));
    return fail(k ?? "erro", k ? known[k] : "Não consegui concluir. Tente de novo.", k ? 400 : 500);
  }
});

async function cancelRecurring(db: ReturnType<typeof admin>, userId: string): Promise<"ok" | "sem" | "erro"> {
  const { data } = await db.from("profiles").select("mp_preapproval_id").eq("id", userId).single();
  if (!data?.mp_preapproval_id) return "sem";
  try {
    await mp(`/preapproval/${data.mp_preapproval_id}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) });
    return "ok";
  } catch {
    return "erro";
  }
}

async function detail(db: ReturnType<typeof admin>, userId: string) {
  await db.rpc("refresh_account", { p_user: userId });
  const [{ data: u }, { data: profile }, { data: payments }, { data: actions }, { data: usage }] = await Promise.all([
    db.auth.admin.getUserById(userId),
    db.from("profiles").select("*").eq("id", userId).single(),
    db.from("payments").select("id, product, amount, method, status, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
    db.from("admin_actions").select("id, admin_email, action, details, note, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(30),
    db.from("usage_events").select("audio_seconds, created_at").eq("user_id", userId).eq("kind", "transcribe").order("created_at", { ascending: false }).limit(500),
  ]);
  if (!profile) throw new Error("conta_nao_encontrada");

  const usedTotal = (usage ?? []).reduce((n, r) => n + Number(r.audio_seconds ?? 0), 0);
  const { data: allowance } = await db.rpc("plan_allowance", { p_plan: profile.plan });

  return {
    user: {
      id: userId,
      email: u.user?.email ?? "—",
      createdAt: u.user?.created_at ?? profile.created_at,
      lastSignIn: u.user?.last_sign_in_at ?? null,
      confirmed: !!u.user?.email_confirmed_at,
    },
    profile: {
      plan: profile.plan,
      planPeriod: profile.plan_period,
      planMethod: profile.plan_method,
      planStatus: profile.plan_status,
      planExpiresAt: profile.plan_expires_at,
      creditsSeconds: profile.credits_seconds,
      extraSeconds: profile.extra_seconds,
      allowanceSeconds: Number(allowance ?? 0),
      cycleStart: profile.cycle_start,
      hasSubscription: !!profile.mp_preapproval_id,
      trialClaimed: !!profile.trial_claimed,
      termsVersion: profile.terms_version,
    },
    usage: { analyses: (usage ?? []).length, seconds: usedTotal, last: usage?.[0]?.created_at ?? null },
    payments: payments ?? [],
    actions: actions ?? [],
  };
}
