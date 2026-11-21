// Registra que o usuário aceitou a versão atual dos Termos e da Política de privacidade.
import { admin, corsHeaders, fail, json, requireUser } from "../_shared/common.ts";

const VERSAO_ATUAL = "2026-11-21";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("metodo", "Use POST.", 405);
  const user = await requireUser(req);
  if (!user) return fail("nao_autenticado", "Faça login novamente.", 401);
  const body = await req.json().catch(() => ({}));
  if (body.version !== VERSAO_ATUAL) return fail("versao", "Versão dos termos desatualizada. Atualize o app.");
  const { error } = await admin()
    .from("profiles")
    .update({ terms_version: VERSAO_ATUAL, terms_accepted_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) return fail("interno", "Não consegui registrar o aceite.", 500);
  return json({ ok: true, version: VERSAO_ATUAL });
});
