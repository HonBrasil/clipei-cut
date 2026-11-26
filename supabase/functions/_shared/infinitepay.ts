// Cliente da API de Checkout Integrado da InfinitePay.
// Docs: https://www.infinitepay.io/checkout-documentacao
const BASE = "https://api.checkout.infinitepay.io";

function creds() {
  const handle = (Deno.env.get("INFINITEPAY_HANDLE") ?? "").replace(/^\$/, "").trim();
  const key = (Deno.env.get("INFINITEPAY_API_KEY") ?? "").trim();
  if (!handle) throw new Error("INFINITEPAY_HANDLE não configurado");
  return { handle, key };
}

async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const { handle, key } = creds();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...(key ? { "X-Api-Key": key } : {}) },
    body: JSON.stringify({ handle, ...body }),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) throw new Error(`InfinitePay ${path} ${res.status}: ${typeof data === "string" ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300)}`);
  return data as T;
}

/** Acha o link de pagamento na resposta (o formato exato não é documentado). */
function findUrl(x: unknown): string | null {
  if (!x || typeof x !== "object") return typeof x === "string" && /^https:\/\//.test(x) ? x : null;
  const o = x as Record<string, unknown>;
  for (const k of ["url", "link", "checkout_url", "payment_url", "invoice_url"]) {
    if (typeof o[k] === "string" && /^https:\/\//.test(o[k] as string)) return o[k] as string;
  }
  for (const v of Object.values(o)) {
    const u = findUrl(v);
    if (u) return u;
  }
  return null;
}

export async function createLink(p: {
  orderNsu: string;
  description: string;
  priceCents: number;
  webhookUrl: string;
  redirectUrl: string;
  customer?: { name?: string; email?: string };
}): Promise<string> {
  const { key } = creds();
  const data = await call<unknown>("/links", {
    items: [{ quantity: 1, price: p.priceCents, description: p.description.slice(0, 120) }],
    order_nsu: p.orderNsu,
    redirect_url: p.redirectUrl,
    webhook_url: p.webhookUrl,
    ...(p.customer?.email ? { customer: { email: p.customer.email, ...(p.customer.name ? { name: p.customer.name } : {}) } } : {}),
    // Opções exigem a chave de API: link de uso único, válido por 3 dias, Pix ligado.
    // A taxa do cartão à vista fica com a Clipei (já está no preço); juros do parcelado ficam com o comprador.
    ...(key
      ? {
          options: {
            single_payment: true,
            valid_until: new Date(Date.now() + 3 * 86400_000).toISOString(),
            payment_methods_enabled: ["credit_card", "pix"],
            assured_installments: 1,
          },
        }
      : {}),
  });
  const url = findUrl(data);
  if (!url) throw new Error(`InfinitePay não devolveu o link: ${JSON.stringify(data).slice(0, 300)}`);
  return url;
}

export type PaymentCheck = { success?: boolean; paid?: boolean; amount?: number; paid_amount?: number; installments?: number; capture_method?: string };

export function paymentCheck(p: { orderNsu: string; transactionNsu: string; slug: string }): Promise<PaymentCheck> {
  return call<PaymentCheck>("/payment_check", { order_nsu: p.orderNsu, transaction_nsu: p.transactionNsu, slug: p.slug });
}
