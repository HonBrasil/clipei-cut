// Cria o pagamento no Mercado Pago e devolve o link para o app abrir no navegador.
// - "recorrente": assinatura mensal no cartão, renova sozinha (Mercado Pago Assinaturas)
// - "unico": pagamento único (Pix, cartão ou boleto) — anual, 1 mês avulso ou horas extras
import { admin, corsHeaders, env, fail, json, requireUser } from "../_shared/common.ts";
import { CATALOG, discounted, makeRef } from "../_shared/catalog.ts";
import { mp } from "../_shared/mp.ts";

const BACK_URL = Deno.env.get("CHECKOUT_BACK_URL") ?? "https://clipeistudiodigital.com.br/";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("metodo", "Use POST.", 405);

  const user = await requireUser(req);
  if (!user?.email) return fail("nao_autenticado", "Faça login novamente.", 401);

  const body = await req.json().catch(() => ({}));
  const product = CATALOG[String(body.product ?? "")];
  const method = body.method === "recorrente" ? "recorrente" : "unico";
  if (!product) return fail("produto", "Plano inválido.");
  if (method === "recorrente" && product.period !== "mensal") return fail("produto", "Só os planos mensais podem renovar sozinhos.");

  // Seguidor de criador parceiro: desconto no 1º pagamento de plano
  let discount = 0;
  if (product.kind === "plano") {
    const { data: d } = await admin().rpc("follower_discount", { p_user: user.id });
    discount = Math.max(0, Math.min(50, Number(d) || 0));
  }
  const price = discount ? discounted(product.price, discount) : product.price;
  const title = discount ? `${product.title} · ${discount}% OFF no 1º pagamento` : product.title;
  const ref = makeRef(user.id, product.id, discount);
  const notify = `${env("SUPABASE_URL")}/functions/v1/mp-webhook`;

  try {
    if (method === "recorrente") {
      const db = admin();
      const { data: prof } = await db.from("profiles").select("plan, plan_status, plan_method, mp_preapproval_id").eq("id", user.id).single();
      // Mesmo plano e mesmo tamanho de grupo = já é assinante (trocar de Pro para Pro Trio é permitido)
      const { data: grp } = await db.from("groups").select("size").eq("owner_id", user.id).maybeSingle();
      const SIZE_NAME: Record<number, string> = { 2: "duo", 3: "trio", 4: "squad" };
      const current = prof?.plan_method === "recorrente" ? `${prof.plan}${grp ? `_${SIZE_NAME[grp.size]}` : ""}` : "";
      const wanted = product.id.replace(/_mensal$/, "");
      if (prof?.mp_preapproval_id && prof.plan_status === "active" && current === wanted) {
        return fail("ja_assinante", "Você já tem essa assinatura ativa.");
      }
      const sub = await mp<{ init_point: string }>("/preapproval", {
        method: "POST",
        body: JSON.stringify({
          reason: title,
          external_reference: ref,
          payer_email: user.email,
          auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: price, currency_id: "BRL" },
          back_url: BACK_URL,
          status: "pending",
        }),
      });
      return json({ url: sub.init_point });
    }

    const pref = await mp<{ init_point: string }>("/checkout/preferences", {
      method: "POST",
      body: JSON.stringify({
        items: [{ id: product.id, title, quantity: 1, unit_price: price, currency_id: "BRL" }],
        payer: { email: user.email },
        external_reference: ref,
        notification_url: notify,
        statement_descriptor: "CLIPEICUT",
        back_urls: { success: BACK_URL, failure: BACK_URL, pending: BACK_URL },
        auto_return: "approved",
        payment_methods: { installments: product.period === "anual" ? 12 : 1 },
        metadata: { user_id: user.id, product: product.id },
      }),
    });
    return json({ url: pref.init_point });
  } catch (e) {
    console.error("checkout", e);
    return fail("provedor", "Não consegui abrir o pagamento agora. Tente de novo em instantes.", 502);
  }
});
