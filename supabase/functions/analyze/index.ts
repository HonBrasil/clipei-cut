// Recebe a transcrição (com tempos) e pede ao Claude Haiku os melhores
// momentos para virar clipes. Devolve uma lista com início, fim, título e nota.
import { admin, corsHeaders, env, fail, json, requireUser } from "../_shared/common.ts";

type Line = { s: number; e: number; t: string };
type Clip = { start: number; end: number; title: string; score: number; reason: string; hook: string };

const MAX_CHARS = 350_000;

const SYSTEM = `Você é editor-chefe de cortes virais para TikTok, Reels e YouTube Shorts de criadores brasileiros (lives de jogos, podcasts, react, tutoriais).
Você recebe a transcrição de um trecho de vídeo, linha a linha, no formato [inicio-fim] texto (tempos em segundos).
Sua tarefa: escolher os MELHORES momentos para virar clipes curtos que prendem a atenção.

Critérios, em ordem:
1. Gancho forte nos primeiros 3 segundos (frase surpreendente, pergunta, emoção, conflito).
2. A ideia se fecha dentro do clipe (tem começo, meio e fim; não termina no meio de uma frase).
3. Emoção ou valor: risada, grito, reação, revelação, história pessoal, dica útil, opinião polêmica.
4. Entende-se sem contexto do resto do vídeo.

Regras:
- Cada clipe deve começar no início de uma frase e terminar no fim de uma frase, usando os tempos das linhas.
- Respeite a duração mínima e máxima pedida.
- Não sobreponha clipes.
- "score" de 0 a 100 = chance estimada de o clipe performar bem. Seja exigente: só dê acima de 85 para momentos realmente fortes.
- "title": título curto e chamativo em português (até 60 caracteres), sem emojis, sem hashtags.
- "reason": 2 a 5 palavras explicando por que foi escolhido (ex.: "Reação engraçada", "Dica útil").
- "hook": a primeira frase do clipe, como foi dita.
- Se não houver momentos bons, devolva lista vazia.
- Quando for pedida uma quantidade exata, tente chegar nela usando também momentos medianos (com nota menor), mas nunca invente trechos que não existem.
- Nunca repita nem sobreponha os trechos listados em "Já escolhidos".

Responda APENAS com JSON válido, sem texto antes ou depois, no formato:
{"clips":[{"start":0,"end":0,"title":"","score":0,"reason":"","hook":""}]}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("metodo", "Use POST.", 405);

  const user = await requireUser(req);
  if (!user) return fail("nao_autenticado", "Faça login novamente.", 401);

  let body: { lines?: Line[]; minSec?: number; maxSec?: number; maxClips?: number; exact?: boolean; exclude?: Array<{ s: number; e: number }> };
  try {
    body = await req.json();
  } catch {
    return fail("formato", "JSON inválido.");
  }

  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (lines.length === 0) return json({ clips: [] });
  const minSec = clamp(Number(body.minSec ?? 20), 5, 180);
  const maxSec = clamp(Number(body.maxSec ?? 60), minSec + 5, 300);
  let maxClips = clamp(Number(body.maxClips ?? 8), 1, 20);
  const exclude = (Array.isArray(body.exclude) ? body.exclude : [])
    .filter((x) => Number.isFinite(x?.s) && Number.isFinite(x?.e))
    .slice(0, 200);

  // Plano Grátis: no máximo 3 clipes e sem "gerar mais"
  const { data: prof } = await admin().from("profiles").select("plan").eq("id", user.id).single();
  const paid = Boolean(prof && prof.plan !== "free");
  if (!paid) {
    if (exclude.length > 0) return fail("plano", "Gerar mais clipes está disponível nos planos pagos.", 403);
    maxClips = Math.min(maxClips, 3);
  }
  const exact = paid && body.exact === true;

  const transcript = lines
    .filter((l) => Number.isFinite(l.s) && Number.isFinite(l.e) && typeof l.t === "string")
    .map((l) => `[${l.s.toFixed(1)}-${l.e.toFixed(1)}] ${l.t}`)
    .join("\n");
  if (transcript.length > MAX_CHARS) return fail("muito_grande", "Trecho de transcrição grande demais.", 413);

  const windowStart = lines[0].s;
  const windowEnd = lines[lines.length - 1].e;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env("ANTHROPIC_API_KEY"),
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env("ANTHROPIC_MODEL", "claude-haiku-5-5"),
      max_tokens: 6000,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content:
            `Duração de cada clipe: entre ${minSec} e ${maxSec} segundos.\n` +
            (exact ? `Escolha ${maxClips} clipes (quantidade pedida pelo usuário).\n` : `Escolha no máximo ${maxClips} clipes.\n`) +
            (exclude.length ? `Já escolhidos (não repetir): ${exclude.map((x) => `[${x.s.toFixed(1)}-${x.e.toFixed(1)}]`).join(" ")}\n` : "") +
            `\nTranscrição:\n${transcript}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("Anthropic falhou", res.status, detail.slice(0, 500));
    return fail("provedor", "A IA não respondeu. Tente de novo em instantes.", 502);
  }

  const data = await res.json();
  const text: string = (data.content ?? [])
    .filter((c: { type: string }) => c.type === "text")
    .map((c: { text: string }) => c.text)
    .join("");

  let parsed: { clips?: unknown[] } = {};
  try {
    parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch {
    console.error("Resposta não era JSON", text.slice(0, 300));
    return fail("resposta", "A IA devolveu uma resposta inesperada. Tente de novo.", 502);
  }

  const clips: Clip[] = [];
  for (const raw of parsed.clips ?? []) {
    const c = raw as Partial<Clip>;
    const start = Number(c.start);
    const end = Number(c.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    if (start < windowStart - 1 || end > windowEnd + 1) continue;
    const len = end - start;
    if (len < minSec * 0.8 || len > maxSec * 1.2) continue;
    if (clips.some((o) => start < o.end && end > o.start)) continue;
    if (exclude.some((o) => start < o.e - 2 && end > o.s + 2)) continue;
    clips.push({
      start,
      end,
      title: String(c.title ?? "Clipe").slice(0, 80),
      score: clamp(Math.round(Number(c.score ?? 50)), 0, 100),
      reason: String(c.reason ?? "").slice(0, 40),
      hook: String(c.hook ?? "").slice(0, 200),
    });
  }

  clips.sort((a, b) => b.score - a.score);
  return json({ clips: clips.slice(0, maxClips) });
});

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
