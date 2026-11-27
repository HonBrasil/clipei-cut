// Cria o link de pagamento na InfinitePay (Pix ou cartão) e devolve para o app abrir no navegador.
// Planos são pré-pagos: mensal ou anual; para renovar, a pessoa paga de novo e o tempo soma.
import { admin, corsHeaders, env, fail, json, requireUser } from "../_shared/common.ts";
import { CATALOG, discounted, makeRef } from "../_shared/catalog.ts";
import { mp } from "../_shared/mp.ts";
import { createLink } from "../_shared/infinitepay.ts";

const BACK_URL = Deno.env.get("CHECKOUT_BACK_URL") ?? "https://clipeistudiodigital.com.br/clipei-cut/";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("metodo", "Use POST.", 405);

  const user = await requireUser(req);
  if (!user?.email) return fail("nao_autenticado", "Faça login novamente.", 401);

  const body = await req.json().catch(() => ({}));
  const product = CATALOG[String(body.product ?? "")];
  if (!product) return fail("produto", "Plano inválido.");
  // Produto de teste: só administradores
  const ADMINS = (Deno.env.get("ADMIN_EMAILS") ?? "g4master01@gmail.com").split(",").map((e) => e.trim().toLowerCase());
  if (product.kind === "teste" && (!ADMINS.includes(user.email.toLowerCase()) || !user.email_confirmed_at)) {
    return fail("produto", "Plano inválido.");
  }

  const db = admin();
  // Seguidor de criador parceiro: desconto no 1º pagamento de plano
  let discount = 0;
  if (product.kind === "plano") {
    const { data: d } = await db.rpc("follower_discount", { p_user: user.id });
    discount = Math.max(0, Math.min(50, Number(d) || 0));
  }
  const price = discount ? discounted(product.price, discount) : product.price;
  const cents = Math.round(price * 100);
  const title = discount ? `${product.title} (${discount}% OFF)` : product.title;
  const orderNsu = `cc-${crypto.randomUUID()}`;

  // Reserva: enquanto a InfinitePay não estiver configurada, usa o Mercado Pago (pagamento avulso)
  if (!Deno.env.get("INFINITEPAY_HANDLE")) {
    try {
      const pref = await mp<{ init_point: string }>("/checkout/preferences", {
        method: "POST",
        body: JSON.stringify({
          items: [{ id: product.id, title, quantity: 1, unit_price: price, currency_id: "BRL" }],
          payer: { email: user.email },
          external_reference: makeRef(user.id, product.id, discount),
          notification_url: `${env("SUPABASE_URL")}/functions/v1/mp-webhook`,
          statement_descriptor: "CLIPEICUT",
          back_urls: { success: BACK_URL, failure: BACK_URL, pending: BACK_URL },
          auto_return: "approved",
          payment_methods: { installments: product.period === "anual" ? 12 : 1 },
        }),
      });
      return json({ url: pref.init_point });
    } catch (e) {
      console.error("checkout mp", e);
      return fail("provedor", "Não consegui abrir o pagamento agora. Tente de novo em instantes.", 502);
    }
  }

  const { error: e1 } = await db.from("checkout_orders").insert({
    order_nsu: orderNsu,
    user_id: user.id,
    product: product.id,
    amount_cents: cents,
    discount_pct: discount,
  });
  if (e1) {
    console.error("pedido", e1);
    return fail("interno", "Não consegui iniciar o pagamento. Tente de novo.", 500);
  }

  try {
    const url = await createLink({
      orderNsu,
      description: title,
      priceCents: cents,
      webhookUrl: `${env("SUPABASE_URL")}/functions/v1/ip-webhook`,
      redirectUrl: `${BACK_URL}?pagamento=ok`,
      customer: { email: user.email, name: (user.user_metadata?.name as string) ?? undefined },
    });
    await db.from("checkout_orders").update({ checkout_url: url }).eq("order_nsu", orderNsu);
    return json({ url });
  } catch (e) {
    console.error("checkout", e);
    const msg = String(e);
    if (msg.includes("external_checkout_not_enabled")) return fail("provedor", "O checkout ainda não está habilitado na conta InfinitePay.", 502);
    return fail("provedor", "Não consegui abrir o pagamento agora. Tente de novo em instantes.", 502);
  }
});
