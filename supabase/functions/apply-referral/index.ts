// Indique e ganhe: liga a conta ao código de quem indicou (com o computador, contra autoindicação).
import { admin, corsHeaders, fail, json, requireUser } from "../_shared/common.ts";

const MSG: Record<string, string> = {
  ok: "Código aplicado! Quando você assinar um plano, você ganha 1 hora extra e seu amigo também ganha.",
  ja_tem: "Sua conta já está ligada a um código de indicação.",
  ja_cliente: "Códigos de indicação valem só para quem ainda não assinou.",
  codigo_invalido: "Não encontrei esse código. Confira e tente de novo.",
  proprio: "Esse é o seu próprio código. 😉",
  mesmo_computador: "Esse código não pode ser usado neste computador.",
  conta: "Conta não encontrada.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("metodo", "Use POST.", 405);
  const user = await requireUser(req);
  if (!user) return fail("nao_autenticado", "Faça login novamente.", 401);

  const body = await req.json().catch(() => ({}));
  const code = String(body.code ?? "").trim().toUpperCase().slice(0, 20);
  const device = String(body.device ?? "").toLowerCase();
  if (!/^[A-Z0-9-]{4,20}$/.test(code)) return fail("codigo_invalido", MSG.codigo_invalido);
  if (!/^[a-f0-9]{64}$/.test(device)) return fail("dispositivo", "Identificação do computador inválida.");

  const { data, error } = await admin().rpc("apply_referral", { p_user: user.id, p_code: code, p_device: device });
  if (error) {
    console.error("apply_referral", error);
    return fail("interno", "Não consegui aplicar o código agora. Tente de novo.", 500);
  }
  const status = String(data);
  if (status !== "ok") return fail(status, MSG[status] ?? "Não foi possível usar esse código.");
  return json({ status, message: MSG.ok });
});
