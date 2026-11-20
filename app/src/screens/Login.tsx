import { useState, type FormEvent } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";

export function Login({ online }: { online: boolean }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "ok"; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const fn = mode === "in" ? supabase.auth.signInWithPassword : supabase.auth.signUp;
    const { data, error } = await fn.call(supabase.auth, { email, password });
    setBusy(false);
    if (error) {
      setMsg({ kind: "error", text: translate(error.message) });
      return;
    }
    if (mode === "up" && !data.session) {
      setMsg({ kind: "ok", text: "Conta criada! Confirme pelo link que enviamos para o seu e-mail e depois entre." });
      setMode("in");
    }
  }

  return (
    <div className="login">
      <form className="box card" onSubmit={submit}>
        <img src="/logo-clipei-cut.png" alt="Clipei Cut" />
        <div style={{ textAlign: "center" }}>
          <h1 className="title" style={{ fontSize: 26 }}>
            {mode === "in" ? "Entrar" : "Criar conta"}
          </h1>
          <p className="muted small" style={{ margin: "6px 0 0" }}>
            Clipes automáticos com IA, direto do seu PC.
          </p>
        </div>

        {!online && (
          <div className="offline" role="status">
            Sem internet. Para entrar na sua conta é preciso estar conectado.
          </div>
        )}

        {!supabaseConfigured && (
          <div className="error">
            O app ainda não foi ligado ao servidor. Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (veja o README).
          </div>
        )}

        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="senha">Senha</label>
          <input
            id="senha"
            className="input"
            type="password"
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            minLength={6}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {msg && <div className={msg.kind === "error" ? "error" : "note"}>{msg.text}</div>}

        <button className="btn primary big" type="submit" disabled={busy || !supabaseConfigured || !online}>
          {busy ? "Aguarde…" : mode === "in" ? "Entrar" : "Criar conta grátis"}
        </button>
        <p className="muted small" style={{ textAlign: "center", margin: 0 }}>
          {mode === "in" ? "Ainda não tem conta?" : "Já tem conta?"}{" "}
          <button type="button" className="linkBtn" onClick={() => setMode(mode === "in" ? "up" : "in")}>
            {mode === "in" ? "Criar conta" : "Entrar"}
          </button>
        </p>
      </form>
    </div>
  );
}

function translate(m: string): string {
  if (/invalid login/i.test(m)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(m)) return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
  if (/already registered/i.test(m)) return "Esse e-mail já tem conta. Use a opção Entrar.";
  if (/password/i.test(m)) return "A senha precisa ter pelo menos 6 caracteres.";
  return m;
}
