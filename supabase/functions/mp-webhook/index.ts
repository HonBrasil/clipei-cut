// Recebe os avisos do Mercado Pago. Nunca confia no conteúdo do aviso:
// sempre consulta o pagamento/assinatura direto na API antes de liberar algo.
import { admin, json } from "../_shared/common.ts";
import { parseRef } from "../_shared/catalog.ts";
import { mp, validSignature } from "../_shared/mp.ts";

type Payment = {
  id: number;
  status: string;
  transaction_amount: number;
  payment_method_id?: string;
  external_reference?: string;
  metadata?: Record<string, unknown>;
  point_of_interaction?: { transaction_data?: { subscription_id?: string } };
};
type Preapproval = { id: string; status: string; external_reference?: string };

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: true });
  const url = new URL(req.url);
  const body = await req.json().catch(() => ({} as Record<string, any>));
  const type = String(body.type ?? body.topic ?? url.searchParams.get("type") ?? url.searchParams.get("topic") ?? "");
  const dataId = String(body.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");
  if (!dataId) return json({ ok: true });

  if (!(await validSignature(req, dataId))) {
    console.warn("Assinatura inválida no aviso", type, dataId);
    return json({ ok: false }, 401);
  }

  try {
    if (type === "payment") await onPayment(dataId);
    else if (type === "subscription_authorized_payment") await onAuthorizedPayment(dataId);
    else if (type === "subscription_preapproval" || type === "preapproval") await onPreapproval(dataId);
    return json({ ok: true });
  } catch (e) {
    console.error("webhook", type, dataId, e);
    return json({ ok: false }, 500); // o Mercado Pago tenta de novo
  }
});

async function onPayment(id: string) {
  const pay = await mp<Payment>(`/v1/payments/${id}`);
  if (pay.status !== "approved") return;
  const subId = (pay.metadata?.preapproval_id as string | undefined) ?? pay.point_of_interaction?.transaction_data?.subscription_id;
  if (subId) return applySubscriptionPayment(subId, String(pay.id), pay.transaction_amount, pay.payment_method_id);
  const ref = parseRef(pay.external_reference);
  if (!ref) return console.warn("Pagamento sem referência do Clipei Cut", id);
  if (Math.abs(pay.transaction_amount - ref.product.price) > 0.01) return console.error("Valor diferente do catálogo", id, pay.transaction_amount);
  await apply(ref.userId, String(pay.id), ref.product.id, pay.transaction_amount, pay.payment_method_id ?? "mp", null);
}

async function onAuthorizedPayment(id: string) {
  const ap = await mp<{ preapproval_id: string; status: string; transaction_amount?: number; payment?: { id: number; status: string } }>(`/authorized_payments/${id}`);
  if (!ap.payment?.id || ap.payment.status !== "approved") return;
  await applySubscriptionPayment(ap.preapproval_id, String(ap.payment.id), ap.transaction_amount ?? 0, "cartao_recorrente");
}

async function applySubscriptionPayment(preapprovalId: string, paymentId: string, amount: number, method?: string) {
  const sub = await mp<Preapproval>(`/preapproval/${preapprovalId}`);
  const ref = parseRef(sub.external_reference);
  if (!ref) return console.warn("Assinatura sem referência do Clipei Cut", preapprovalId);
  const db = admin();
  const { data: prof } = await db.from("profiles").select("mp_preapproval_id").eq("id", ref.userId).single();
  const applied = await apply(ref.userId, paymentId, ref.product.id, amount || ref.product.price, method ?? "cartao_recorrente", preapprovalId);
  // Trocou de plano: cancela a assinatura antiga para não cobrar duas vezes
  const old = prof?.mp_preapproval_id as string | null;
  if (applied && old && old !== preapprovalId) {
    await mp(`/preapproval/${old}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) }).catch((e) => console.error("cancelar antiga", e));
  }
}

async function onPreapproval(id: string) {
  const sub = await mp<Preapproval>(`/preapproval/${id}`);
  if (sub.status === "cancelled" || sub.status === "paused") {
    // Mantém o plano até o fim do período pago; depois volta para o Grátis sozinho
    await admin().from("profiles").update({ plan_status: "cancelled" }).eq("mp_preapproval_id", id);
  }
}

async function apply(userId: string, paymentId: string, product: string, amount: number, method: string, preapproval: string | null) {
  const { data, error } = await admin().rpc("apply_purchase", {
    p_user: userId,
    p_payment_id: paymentId,
    p_product: product,
    p_amount: amount,
    p_method: method,
    p_preapproval: preapproval,
  });
  if (error) throw error;
  console.log("Compra", data ? "aplicada" : "já aplicada antes", paymentId, product, userId);
  if (data) {
    // Indique e ganhe: no primeiro pagamento de um amigo indicado, os dois ganham horas
    const { data: rewarded, error: e2 } = await admin().rpc("grant_referral_reward", { p_user: userId, p_payment_id: paymentId });
    if (e2) console.error("grant_referral_reward", e2);
    else if (rewarded) console.log("Indicação recompensada", userId);
  }
  return Boolean(data);
}
