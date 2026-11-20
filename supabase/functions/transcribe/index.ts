// Recebe um pedaço de áudio do app, transcreve no Groq (Whisper) com o tempo
// de cada palavra e desconta os créditos pelo tempo real do áudio.
// O áudio não é salvo em lugar nenhum: só passa por aqui.
import { admin, corsHeaders, env, fail, getCredits, json, requireUser } from "../_shared/common.ts";

const MAX_BYTES = 24 * 1024 * 1024; // limite seguro do Groq por requisição

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("metodo", "Use POST.", 405);

  const user = await requireUser(req);
  if (!user) return fail("nao_autenticado", "Faça login novamente.", 401);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("formato", "Envie o áudio como multipart/form-data.");
  }

  const file = form.get("file");
  const declared = Number(form.get("duration") ?? 0);
  const language = String(form.get("language") ?? "pt");
  if (!(file instanceof File)) return fail("sem_arquivo", "Nenhum áudio recebido.");
  if (file.size > MAX_BYTES) return fail("muito_grande", "Pedaço de áudio grande demais.", 413);
  if (!Number.isFinite(declared) || declared <= 0 || declared > 1800) {
    return fail("duracao", "Duração do pedaço inválida.");
  }

  const db = admin();
  const credits = await getCredits(db, user.id);
  if (credits < Math.ceil(declared)) {
    return fail("sem_creditos", "Seus créditos de IA acabaram. Escolha um plano para continuar.", 402);
  }

  const groqForm = new FormData();
  groqForm.append("file", file, file.name || "audio.ogg");
  groqForm.append("model", env("GROQ_MODEL", "whisper-large-v3-turbo"));
  groqForm.append("response_format", "verbose_json");
  groqForm.append("timestamp_granularities[]", "word");
  groqForm.append("timestamp_granularities[]", "segment");
  groqForm.append("temperature", "0");
  if (language !== "auto") groqForm.append("language", language);

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("GROQ_API_KEY")}` },
    body: groqForm,
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("Groq falhou", res.status, detail.slice(0, 500));
    return fail("provedor", "O serviço de transcrição falhou. Tente de novo em instantes.", 502);
  }

  const data = await res.json();
  const duration = Math.ceil(Number(data.duration ?? declared));

  let remaining: number;
  const { data: rpc, error } = await db.rpc("consume_credits", {
    p_user: user.id,
    p_seconds: duration,
    p_kind: "transcribe",
    p_provider: "groq",
  });
  if (error) {
    if (String(error.message).includes("sem_creditos")) {
      return fail("sem_creditos", "Seus créditos de IA acabaram.", 402);
    }
    console.error("consume_credits", error);
    return fail("interno", "Erro ao registrar o uso.", 500);
  }
  remaining = rpc as number;

  type Seg = { start: number; end: number; text: string };
  type Word = { word: string; start: number; end: number };

  return json({
    duration,
    remaining,
    segments: ((data.segments ?? []) as Seg[]).map((s) => ({ start: s.start, end: s.end, text: String(s.text).trim() })),
    words: ((data.words ?? []) as Word[]).map((w) => ({ word: String(w.word).trim(), start: w.start, end: w.end })),
  });
});
