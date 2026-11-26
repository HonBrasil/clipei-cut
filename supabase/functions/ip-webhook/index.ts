// Aviso de pagamento da InfinitePay. Não confiamos no conteúdo do aviso: cada pagamento é
// conferido direto na InfinitePay (payment_check) antes de liberar plano ou horas.
import { admin, json } from "../_shared/common.ts";
import { CATALOG } from "../_shared/catalog.ts";
import { paymentCheck } from "../_shared/infinitepay.ts";

const ok = () => json({ ok: true });

Deno.serve(async (req) => {
  if (req.method !== "POST") return ok();
  const ev = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!ev) return new Response("bad", { status: 400 });

  const orderNsu = String(ev.order_nsu ?? "");
  const transactionNsu = String(ev.transaction_nsu ?? "");
  const slug = String(ev.invoice_slug ?? ev.slug ?? "");
  const event = String(ev.event ?? ev.type ?? ev.status ?? "paid");
  if (!orderNsu.startsWith("cc-")) return ok(); // não é nosso

  const db = admin();
  const { data: order } = await db.from("checkout_orders").select("*").eq("order_nsu", orderNsu).maybeSingle();
  if (!order) {
    console.warn("pedido desconhecido", orderNsu);
    return ok();
  }

  if (/refund|cancel/i.test(event)) {
    console.warn("InfinitePay", event, orderNsu);
    await db.from("checkout_orders").update({ status: /refund/i.test(event) ? "refunded" : "canceled" }).eq("order_nsu", orderNsu);
    return ok();
  }
  if (order.status === "paid") return ok(); // já aplicado
  if (!transactionNsu || !slug) return ok(); // eventos sem pagamento (ex.: created)

  // Confere direto na InfinitePay
  let check;
  try {
    check = await paymentCheck({ orderNsu, transactionNsu, slug });
  } catch (e) {
    console.error("payment_check", e);
    return new Response("retry", { status: 500 }); // a InfinitePay tenta de novo
  }
  if (!check.success || !check.paid) {
    console.log("ainda não pago", orderNsu, check);
    return ok();
  }
  // Valor: em centavos (ou em reais, por garantia). Pode vir maior quando o comprador paga juros do parcelado.
  const amt = Number(check.amount ?? 0);
  const matches = Math.abs(amt - order.amount_cents) <= 1 || Math.abs(Math.round(amt * 100) - order.amount_cents) <= 1;
  if (!matches) {
    console.error("valor diferente do pedido", orderNsu, check.amount, order.amount_cents);
    return ok();
  }
  const product = CATALOG[order.product];
  if (!product || !order.user_id) return ok();

  const { data: applied, error } = await db.rpc("apply_purchase", {
    p_user: order.user_id,
    p_payment_id: `ip_${transactionNsu}`,
    p_product: product.id,
    p_amount: order.amount_cents / 100,
    p_method: check.capture_method ?? "infinitepay",
    p_preapproval: null,
  });
  if (error) {
    console.error("apply_purchase", error);
    return new Response("retry", { status: 500 });
  }
  await db
    .from("checkout_orders")
    .update({ status: "paid", paid_at: new Date().toISOString(), transaction_nsu: transactionNsu, capture_method: check.capture_method ?? null })
    .eq("order_nsu", orderNsu);
  if (applied) {
    const { error: e2 } = await db.rpc("grant_referral_reward", { p_user: order.user_id, p_payment_id: `ip_${transactionNsu}` });
    if (e2) console.error("grant_referral_reward", e2);
  }
  console.log("Pagamento InfinitePay aplicado", orderNsu, product.id);
  return ok();
});
