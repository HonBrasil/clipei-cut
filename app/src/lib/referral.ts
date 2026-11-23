// Indique e ganhe: código da conta, estatísticas e aplicar o código de um amigo.
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "./supabase";

export type Referral = {
  code: string;
  invited: number;
  converted: number;
  earnedSeconds: number;
  referrerSeconds: number;
  referredSeconds: number;
  referredBy: string | null;
  canApply: boolean;
  friendRewarded: boolean;
};

/** Código digitado no cadastro, aplicado depois do primeiro login. */
export const PENDING_REFERRAL_KEY = "clipei-indicacao-pendente";

export async function fetchReferral(): Promise<Referral> {
  const { data, error } = await supabase.rpc("my_referral");
  if (error) throw error;
  return data as Referral;
}

export async function applyReferral(code: string): Promise<string> {
  const device = await invoke<string>("device_id");
  const { data, error } = await supabase.functions.invoke("apply-referral", { body: { code, device } });
  if (error) {
    // A função devolve a mensagem amigável no corpo do erro
    const ctx = (error as { context?: Response }).context;
    const body = ctx ? await ctx.json().catch(() => null) : null;
    throw new Error(body?.error?.message ?? "Não consegui aplicar o código agora.");
  }
  return (data as { message: string }).message;
}

export function shareText(code: string): string {
  return `Tô usando o Clipei Cut pra transformar minhas lives em cortes automáticos com IA 🎬🔥 Usa meu código ${code} quando assinar e você ganha 1 hora extra: https://clipeistudiodigital.com.br`;
}
