// Cria o pagamento no Mercado Pago e devolve o link para o app abrir no navegador.
// - "recorrente": assinatura mensal no cartão, renova sozinha (Mercado Pago Assinaturas)
// - "unico": pagamento único (Pix, cartão ou boleto) — anual, 1 mês avulso ou horas extras
import { admin, corsHeaders, env, fail, json, requireUser } from "../_shared/common.ts";
import { CATALOG, makeRef } from "../_shared/catalog.ts";
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

  const ref = makeRef(user.id, product.id);
  const notify = `${env("SUPABASE_URL")}/functions/v1/mp-webhook`;

  try {
    if (method === "recorrente") {
      const db = admin();
      const { data: prof } = await db.from("profiles").select("plan, plan_status, plan_method, mp_preapproval_id").eq("id", user.id).single();
      if (prof?.mp_preapproval_id && prof.plan_status === "active" && prof.plan === product.id.split("_")[0]) {
        return fail("ja_assinante", "Você já tem essa assinatura ativa.");
      }
      const sub = await mp<{ init_point: string }>("/preapproval", {
        method: "POST",
        body: JSON.stringify({
          reason: product.title,
          external_reference: ref,
          payer_email: user.email,
          auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: product.price, currency_id: "BRL" },
          back_url: BACK_URL,
          status: "pending",
        }),
      });
      return json({ url: sub.init_point });
    }

    const pref = await mp<{ init_point: string }>("/checkout/preferences", {
      method: "POST",
      body: JSON.stringify({
        items: [{ id: product.id, title: product.title, quantity: 1, unit_price: product.price, currency_id: "BRL" }],
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
