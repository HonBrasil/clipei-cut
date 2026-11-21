// Plano e saldo da conta, e as compras pelo Mercado Pago.
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "./supabase";

export type PlanId = "free" | "criador" | "pro" | "studio";

export type Account = {
  plan: PlanId;
  planPeriod: "mensal" | "anual" | null;
  planMethod: "recorrente" | "avulso" | null;
  planStatus: "active" | "cancelled" | "expired";
  planExpiresAt: string | null;
  creditsSeconds: number; // horas do plano no mês atual
  extraSeconds: number; // horas avulsas (não vencem)
  allowanceSeconds: number; // horas por mês do plano
  cycleStart: string;
  hasSubscription: boolean;
  trialClaimed: boolean;
  termsVersion: string | null;
  totalSeconds: number;
};

export type TrialStatus = "liberado" | "ja_usado" | "dispositivo_usado" | "limite_rede" | "erro";

export const PLAN_INFO: Record<PlanId, { name: string; hours: number; monthly: number; yearly: number; perks: string[] }> = {
  free: { name: "Grátis", hours: 1, monthly: 0, yearly: 0, perks: ["1 hora de teste por computador (não renova)", "Marca d'água Clipei Cut", "Exporta em 720p", "Modelos de legenda prontos"] },
  criador: { name: "Criador", hours: 15, monthly: 34.9, yearly: 349.9, perks: ["15 horas de vídeo por mês", "Sem marca d'água", "1080p até 60 fps", "Todos os modelos e marca do canal"] },
  pro: { name: "Pro", hours: 50, monthly: 69.9, yearly: 699.9, perks: ["50 horas de vídeo por mês", "Tudo do Criador", "Ideal para quem faz live toda semana", "Prioridade no suporte"] },
  studio: { name: "Studio", hours: 150, monthly: 159.9, yearly: 1599.9, perks: ["150 horas de vídeo por mês", "Tudo do Pro", "Para agências e editores de vários canais", "Suporte prioritário"] },
};

export const HOUR_PACKS = [
  { id: "horas_5", hours: 5, price: 24.9 },
  { id: "horas_20", hours: 20, price: 69.9 },
] as const;

export function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export async function fetchAccount(): Promise<Account | null> {
  const { data, error } = await supabase.rpc("my_account");
  const r = Array.isArray(data) ? data[0] : data;
  if (error || !r) return null;
  return {
    plan: r.plan,
    planPeriod: r.plan_period,
    planMethod: r.plan_method,
    planStatus: r.plan_status,
    planExpiresAt: r.plan_expires_at,
    creditsSeconds: r.credits_seconds,
    extraSeconds: r.extra_seconds,
    allowanceSeconds: r.allowance_seconds,
    cycleStart: r.cycle_start,
    hasSubscription: r.has_subscription,
    trialClaimed: Boolean(r.trial_claimed),
    termsVersion: r.terms_version ?? null,
    totalSeconds: r.credits_seconds + r.extra_seconds,
  };
}

async function callFn(name: string, body: unknown): Promise<any> {
  const { data: s } = await supabase.auth.getSession();
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${s.session?.access_token ?? ""}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? "Não consegui falar com o servidor.");
  return json;
}

/** Abre o pagamento do Mercado Pago no navegador. */
export async function startCheckout(product: string, method: "recorrente" | "unico"): Promise<void> {
  const { url } = await callFn("checkout", { product, method });
  if (!url) throw new Error("O Mercado Pago não devolveu o link de pagamento.");
  await openUrl(url);
}

export async function cancelSubscription(): Promise<string | null> {
  const { until } = await callFn("cancel-subscription", {});
  return until ?? null;
}

export function isPaid(a: Account | null): boolean {
  return Boolean(a && a.plan !== "free");
}

/** Pede a hora de teste para este computador (o servidor decide se libera). */
export async function claimTrial(): Promise<TrialStatus> {
  try {
    const device = await invoke<string>("device_id");
    const { status } = await callFn("claim-trial", { device });
    return status as TrialStatus;
  } catch (e) {
    console.warn("Teste grátis", e);
    return "erro";
  }
}

export async function acceptTerms(version: string): Promise<void> {
  await callFn("accept-terms", { version });
}

/** Exclui a conta no servidor (cancela assinatura e apaga os dados pessoais). */
export async function deleteAccount(): Promise<void> {
  await callFn("delete-account", { confirm: "EXCLUIR" });
}
