// Exclui a conta do usuário (direito previsto na LGPD).
// Cancela a assinatura no Mercado Pago, se houver, e apaga os dados pessoais.
// Os pagamentos ficam registrados sem vínculo com a pessoa (obrigação fiscal).
import { admin, corsHeaders, fail, json, requireUser } from "../_shared/common.ts";
import { mp } from "../_shared/mp.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("metodo", "Use POST.", 405);
  const user = await requireUser(req);
  if (!user) return fail("nao_autenticado", "Faça login novamente.", 401);

  const body = await req.json().catch(() => ({}));
  if (String(body.confirm ?? "").trim().toUpperCase() !== "EXCLUIR") {
    return fail("confirmacao", "Digite EXCLUIR para confirmar.");
  }

  const db = admin();
  const { data: prof } = await db.from("profiles").select("mp_preapproval_id").eq("id", user.id).single();
  if (prof?.mp_preapproval_id) {
    try {
      await mp(`/preapproval/${prof.mp_preapproval_id}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) });
    } catch (e) {
      console.error("cancelar assinatura ao excluir", e);
      return fail("provedor", "Não consegui cancelar sua assinatura no Mercado Pago. Tente de novo ou fale com o suporte.", 502);
    }
  }

  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("deleteUser", error);
    return fail("interno", "Não consegui excluir a conta agora. Fale com o suporte.", 500);
  }
  console.log("Conta excluída", user.id);
  return json({ ok: true });
});
