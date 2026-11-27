// Jogadas na tela: recebe poucas imagens dos momentos candidatos (cada uma com 3 quadros:
// antes, no momento e depois) e a IA diz se houve uma jogada, de que tipo e quão forte.
import { admin, corsHeaders, env, fail, json, requireUser } from "../_shared/common.ts";

const MAX_FRAMES = 8;
const MAX_B64 = 220_000; // ~160 KB por imagem
const DAILY = { paid: 1200, free: 150 }; // imagens por dia

const CAT: Record<string, string> = {
  fps: "jogo de tiro em primeira pessoa (Valorant, CS2, CoD, Overwatch). Jogadas: abates em sequência no kill feed, headshot, ACE/clutch, vitória de round, morte engraçada, jogada com granada/habilidade decisiva.",
  br: "battle royale (Fortnite, Free Fire, Warzone, PUBG). Jogadas: derrubar/eliminar vários inimigos, contador de abates subindo, Victory Royale/Booyah/1º lugar, fuga no limite, círculo final, eliminação do jogador.",
  moba: "MOBA (LoL, Dota 2, Wild Rift, Mobile Legends). Jogadas: banners de Double/Triple/Quadra/Penta Kill ou Maniac/Savage, abate de objetivo grande (Barão, Dragão, Roshan, Lorde), teamfight vencida, destruição do Nexus/Ancient, Vitória/Derrota.",
  esportes: "jogo de esporte ou corrida (EA FC, NBA 2K, Rocket League, corrida). Jogadas: gol, cesta decisiva, replay, placar mudando, defesa difícil, final de partida, ultrapassagem ou batida, comemoração.",
  luta: "jogo de luta (Street Fighter, Tekken, Mortal Kombat). Jogadas: K.O., Perfect, Fatality, combo longo, golpe especial/super, virada com pouca vida, fim de round.",
  terror: "jogo de terror. Jogadas: aparição súbita do monstro (jumpscare), perseguição, morte do personagem, momento de tensão máxima, reação de susto.",
  outros: "jogo (qualquer gênero). Jogadas: vitória ou derrota, conquista/troféu na tela, chefão derrotado, acidente engraçado, explosão, momento inesperado, tela de fim de partida.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("metodo", "Use POST.", 405);
  const user = await requireUser(req);
  if (!user) return fail("nao_autenticado", "Faça login novamente.", 401);

  const body = await req.json().catch(() => ({}));
  const cat = String(body.category ?? "outros");
  if (!CAT[cat]) return fail("categoria", "Categoria inválida.");
  const frames = (Array.isArray(body.frames) ? body.frames : [])
    .filter((f: { t?: unknown; img?: unknown }) => Number.isFinite(Number(f?.t)) && typeof f?.img === "string" && (f.img as string).length < MAX_B64 && /^[A-Za-z0-9+/=]+$/.test(f.img as string))
    .slice(0, MAX_FRAMES) as Array<{ t: number; img: string }>;
  if (!frames.length) return fail("imagens", "Nenhuma imagem válida.");

  // Limite diário de imagens por conta
  const db = admin();
  const { data: prof } = await db.from("profiles").select("plan").eq("id", user.id).single();
  const paid = prof?.plan && prof.plan !== "free";
  const since = new Date(Date.now() - 86400_000).toISOString();
  const { data: used } = await db.from("usage_events").select("audio_seconds").eq("user_id", user.id).eq("kind", "vision").gte("created_at", since);
  const usedN = (used ?? []).reduce((n, r) => n + Number(r.audio_seconds ?? 0), 0);
  if (usedN + frames.length > (paid ? DAILY.paid : DAILY.free)) return fail("limite", "Limite diário da detecção de jogadas atingido. A análise segue só pela fala.", 429);

  const content: unknown[] = [];
  frames.forEach((f, i) => {
    content.push({ type: "text", text: `Imagem ${i} (momento ${Math.round(f.t)} s):` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: f.img } });
  });
  content.push({
    type: "text",
    text:
      `Cada imagem tem 3 quadros lado a lado (1,5 s antes, no momento, 1,5 s depois) de uma gravação de ${CAT[cat]}\n` +
      `Para cada imagem, diga se ali acontece uma JOGADA que vale um clipe curto para TikTok/Reels/Shorts. Seja exigente: tela parada, menus, loading e andar pelo mapa NÃO são jogada.\n` +
      `Responda só JSON: {"momentos":[{"i":0,"jogada":true,"forca":0-100,"tipo":"palavra curta, ex.: triple kill","descricao":"até 8 palavras, em português"}]}`,
  });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: env("ANTHROPIC_MODEL", "claude-haiku-5-5"), max_tokens: 1200, messages: [{ role: "user", content }] }),
  });
  if (!res.ok) {
    console.error("visão Anthropic", res.status, (await res.text()).slice(0, 300));
    return fail("provedor", "A IA de visão não respondeu.", 502);
  }
  const data = await res.json();
  const text: string = (data.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
  let parsed: { momentos?: Array<Record<string, unknown>> } = {};
  try {
    parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch {
    console.error("visão: resposta não JSON", text.slice(0, 200));
  }

  await db.from("usage_events").insert({ user_id: user.id, kind: "vision", audio_seconds: frames.length, provider: "anthropic" });

  const events = (parsed.momentos ?? [])
    .filter((m) => m?.jogada === true && Number.isInteger(m?.i) && frames[m.i as number])
    .map((m) => ({
      t: frames[m.i as number].t,
      score: Math.max(0, Math.min(100, Math.round(Number(m.forca) || 0))),
      type: String(m.tipo ?? "jogada").slice(0, 30),
      label: String(m.descricao ?? "").slice(0, 80),
    }));
  return json({ events });
});
