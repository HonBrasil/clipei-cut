import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function fail(code: string, message: string, status = 400): Response {
  return json({ error: { code, message } }, status);
}

export function env(name: string, fallback?: string): string {
  const v = Deno.env.get(name) ?? fallback;
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

/** Cliente com a chave de serviço (só no servidor). */
export function admin(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

/** Identifica o usuário a partir do token enviado pelo app. */
export async function requireUser(req: Request): Promise<User | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const client = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

export async function getCredits(db: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await db.from("profiles").select("credits_seconds").eq("id", userId).single();
  if (error || !data) return 0;
  return data.credits_seconds as number;
}
