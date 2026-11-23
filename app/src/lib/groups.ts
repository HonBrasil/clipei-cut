// Planos em grupo: Duo, Trio e Squad (Criador e Pro). O dono paga; cada pessoa tem as próprias horas.
import { supabase } from "./supabase";

export type GroupSize = "duo" | "trio" | "squad";
export type GroupPlan = "criador" | "pro";

export const GROUP_SIZES: Array<{ id: GroupSize; label: string; people: number; discount: number }> = [
  { id: "duo", label: "Duo", people: 2, discount: 10 },
  { id: "trio", label: "Trio", people: 3, discount: 15 },
  { id: "squad", label: "Squad", people: 4, discount: 20 },
];

/** Mesmos valores do catálogo do servidor (quem manda no preço é o servidor). */
export const GROUP_PRICES: Record<GroupPlan, Record<GroupSize, { mensal: number; anual: number }>> = {
  criador: { duo: { mensal: 62.9, anual: 629.9 }, trio: { mensal: 89.9, anual: 899.9 }, squad: { mensal: 111.9, anual: 1119.9 } },
  pro: { duo: { mensal: 125.9, anual: 1259.9 }, trio: { mensal: 179.9, anual: 1799.9 }, squad: { mensal: 224.9, anual: 2249.9 } },
};

export type GroupMember = { id: string; email: string; owner: boolean; joinedAt: string };
export type Group =
  | { role: "none" }
  | {
      role: "owner" | "member";
      plan: GroupPlan;
      size: number;
      period: "mensal" | "anual";
      inviteCode: string | null;
      expiresAt: string | null;
      renews: boolean;
      swapsLeft: number;
      ownerEmail: string;
      members: GroupMember[];
    };

export const sizeName = (n: number) => GROUP_SIZES.find((s) => s.people === n)?.label ?? `${n} pessoas`;

export async function fetchGroup(): Promise<Group> {
  const { data, error } = await supabase.rpc("my_group");
  if (error) throw error;
  return data as Group;
}

const JOIN_MSG: Record<string, string> = {
  codigo_invalido: "Não encontrei esse código de grupo. Confira com quem te convidou.",
  ja_dono: "Você é o dono deste grupo.",
  ja_em_grupo: "Você já está em um grupo. Saia dele antes de entrar em outro.",
  grupo_inativo: "O plano deste grupo não está ativo no momento.",
  grupo_cheio: "Este grupo já está completo.",
  nao_autenticado: "Faça login novamente.",
};

/** Entra num grupo. Devolve "tem_plano" quando a pessoa já tem plano próprio (precisa confirmar). */
export async function joinGroup(code: string, force = false): Promise<"ok" | "tem_plano"> {
  const { data, error } = await supabase.rpc("join_group", { p_code: code.trim().toUpperCase(), p_force: force });
  if (error) throw error;
  const r = String(data);
  if (r === "ok" || r === "tem_plano") return r;
  throw new Error(JOIN_MSG[r] ?? "Não foi possível entrar no grupo.");
}

export async function leaveGroup(): Promise<void> {
  const { data, error } = await supabase.rpc("leave_group");
  if (error) throw error;
  if (data !== "ok") throw new Error("Não foi possível sair do grupo.");
}

export async function removeMember(id: string): Promise<void> {
  const { data, error } = await supabase.rpc("remove_group_member", { p_member: id });
  if (error) throw error;
  if (data === "limite_trocas") throw new Error("Você já fez 2 trocas nos últimos 30 dias. Tente de novo depois.");
  if (data !== "ok") throw new Error("Não foi possível remover este membro.");
}

export async function newInvite(): Promise<string> {
  const { data, error } = await supabase.rpc("new_group_invite");
  if (error || !data) throw error ?? new Error("Não foi possível gerar um novo código.");
  return String(data);
}

export function groupInviteText(code: string, plan: GroupPlan): string {
  return `Entra no meu grupo do Clipei Cut ${plan === "pro" ? "Pro" : "Criador"} 🎬 Instala o app (https://clipeistudiodigital.com.br), cria sua conta e em "Meu grupo" usa o código ${code}. Você ganha o plano completo com suas próprias horas!`;
}
