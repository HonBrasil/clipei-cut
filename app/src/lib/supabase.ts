import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anon);

export const supabase = createClient(url ?? "https://exemplo.supabase.co", anon ?? "sem-chave", {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "clipei-cut-auth" },
});

export async function getCreditsSeconds(): Promise<number | null> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id;
  if (!uid) return null;
  const { data } = await supabase.from("profiles").select("credits_seconds").eq("id", uid).single();
  return (data?.credits_seconds as number | undefined) ?? null;
}
