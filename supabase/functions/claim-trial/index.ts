// Libera a hora de teste uma vez por computador.
import { admin, corsHeaders, fail, json, requireUser } from "../_shared/common.ts";

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("metodo", "Use POST.", 405);
  const user = await requireUser(req);
  if (!user) return fail("nao_autenticado", "Faça login novamente.", 401);

  const body = await req.json().catch(() => ({}));
  const device = String(body.device ?? "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(device)) return fail("dispositivo", "Identificação do computador inválida.");

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const ipHash = ip ? await sha256(`clipei-ip:${ip}`) : null;

  const { data, error } = await admin().rpc("claim_trial", { p_user: user.id, p_device: device, p_ip: ipHash });
  if (error) {
    console.error("claim_trial", error);
    return fail("interno", "Não consegui verificar o teste grátis agora.", 500);
  }
  return json({ status: data });
});
