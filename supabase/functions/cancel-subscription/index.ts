// Cancela a renovação automática. O plano continua até o fim do período já pago.
import { admin, corsHeaders, fail, json, requireUser } from "../_shared/common.ts";
import { mp } from "../_shared/mp.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("metodo", "Use POST.", 405);
  const user = await requireUser(req);
  if (!user) return fail("nao_autenticado", "Faça login novamente.", 401);

  const db = admin();
  const { data: prof } = await db.from("profiles").select("mp_preapproval_id, plan_expires_at").eq("id", user.id).single();
  if (!prof?.mp_preapproval_id) return fail("sem_assinatura", "Você não tem assinatura com renovação automática.");

  try {
    await mp(`/preapproval/${prof.mp_preapproval_id}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) });
  } catch {
    return fail("provedor", "Não consegui cancelar agora. Tente de novo em instantes.", 502);
  }
  await db.from("profiles").update({ plan_status: "cancelled" }).eq("id", user.id);
  return json({ ok: true, until: prof.plan_expires_at });
});
