// Escreve o texto do post (título, descrição e hashtags) para TikTok, Shorts e Reels.
// Só para planos pagos. Usa só o texto falado no clipe (barato e rápido).
import { admin, corsHeaders, env, fail, json, requireUser } from "../_shared/common.ts";

const SYSTEM = `Você é social media de criadores de conteúdo brasileiros (games, lives, podcasts).
Recebe o texto falado de um clipe curto e escreve o texto para publicar no TikTok, YouTube Shorts e Instagram Reels.

Regras:
- Português do Brasil, linguagem natural de criador (pode ter gírias leves), sem exagero.
- "titulo": até 70 caracteres, chamativo, sem clickbait mentiroso, sem hashtags. No máximo 1 emoji.
- "descricao": 1 a 3 frases curtas que dão vontade de assistir até o fim e chamam para comentar ou seguir. No máximo 2 emojis.
- "hashtags": de 5 a 8 hashtags relevantes, misturando amplas (#shorts, #gaming) e específicas do assunto, sem acento, sem espaços, cada uma começando com #.
- Não invente fatos que não estão no texto falado.

Responda APENAS com JSON válido: {"titulo":"","descricao":"","hashtags":["#exemplo"]}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("metodo", "Use POST.", 405);

  const user = await requireUser(req);
  if (!user) return fail("nao_autenticado", "Faça login novamente.", 401);

  const { data: prof } = await admin().from("profiles").select("plan").eq("id", user.id).single();
  if (!prof || prof.plan === "free") return fail("plano", "Título, descrição e hashtags automáticos estão nos planos pagos.", 403);

  const body = await req.json().catch(() => ({}));
  const text = String(body.text ?? "").slice(0, 6000).trim();
  const hint = String(body.title ?? "").slice(0, 120);
  if (text.length < 10) return fail("texto", "Esse clipe tem pouca fala para escrever o post.");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: env("ANTHROPIC_MODEL", "claude-haiku-5-5"),
      max_tokens: 800,
      system: SYSTEM,
      messages: [{ role: "user", content: `Título provisório do clipe: ${hint}\n\nTexto falado no clipe:\n${text}` }],
    }),
  });
  if (!res.ok) {
    console.error("Anthropic", res.status, (await res.text()).slice(0, 300));
    return fail("provedor", "A IA não respondeu. Tente de novo em instantes.", 502);
  }
  const data = await res.json();
  const out: string = (data.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
  try {
    const j = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
    const hashtags = (Array.isArray(j.hashtags) ? j.hashtags : [])
      .map((h: unknown) => "#" + String(h).replace(/^#+/, "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]/g, ""))
      .filter((h: string) => h.length > 1)
      .slice(0, 10);
    return json({ titulo: String(j.titulo ?? "").slice(0, 100), descricao: String(j.descricao ?? "").slice(0, 600), hashtags });
  } catch {
    return fail("resposta", "A IA devolveu uma resposta inesperada. Tente de novo.", 502);
  }
});
