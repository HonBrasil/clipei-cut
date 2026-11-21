import { useState, type FormEvent } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { openSupport } from "../lib/support";
import { TERMS_VERSION } from "../lib/legal";
import { LegalModal } from "../components/LegalModal";

type Mode = "in" | "up" | "code" | "forgot" | "reset";

export const PENDING_TERMS_KEY = "clipei-terms-aceitos";

export function Login({ online }: { online: boolean }) {
  const [mode, setMode] = useState<Mode>("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [accept, setAccept] = useState(false);
  const [legal, setLegal] = useState<null | "termos" | "privacidade">(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "ok"; text: string } | null>(null);

  const go = (m: Mode, text?: string) => {
    setMode(m);
    setCode("");
    setMsg(text ? { kind: "ok", text } : null);
  };

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ kind: "error", text: translate(e instanceof Error ? e.message : String(e)) });
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === "in")
      run(async () => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          if (/email not confirmed/i.test(error.message)) {
            await supabase.auth.resend({ type: "signup", email });
            go("code", "Seu e-mail ainda não foi confirmado. Enviamos um novo código para ele.");
            return;
          }
          throw error;
        }
      });
    if (mode === "up")
      run(async () => {
        if (!accept) throw new Error("Para criar a conta, aceite os Termos de uso e a Política de privacidade.");
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { terms_version: TERMS_VERSION } } });
        if (error) throw error;
        localStorage.setItem(PENDING_TERMS_KEY, TERMS_VERSION);
        if (!data.session) go("code", `Enviamos um código de 6 dígitos para ${email}. Digite abaixo para ativar sua conta.`);
      });
    if (mode === "code")
      run(async () => {
        const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "email" });
        if (error) throw error;
      });
    if (mode === "forgot")
      run(async () => {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw error;
        go("reset", `Se existir uma conta com ${email}, enviamos um código de 6 dígitos para criar a nova senha.`);
      });
    if (mode === "reset")
      run(async () => {
        const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "recovery" });
        if (error) throw error;
        const { error: e2 } = await supabase.auth.updateUser({ password });
        if (e2) throw e2;
      });
  }

  function resend() {
    run(async () => {
      const { error } = mode === "code" ? await supabase.auth.resend({ type: "signup", email }) : await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      setMsg({ kind: "ok", text: "Enviamos um novo código. Confira também a caixa de spam." });
    });
  }

  const titles: Record<Mode, string> = { in: "Entrar", up: "Criar conta", code: "Confirme seu e-mail", forgot: "Esqueci minha senha", reset: "Criar nova senha" };
  const button: Record<Mode, string> = { in: "Entrar", up: "Criar conta grátis", code: "Confirmar e entrar", forgot: "Enviar código", reset: "Salvar nova senha e entrar" };
  const needsCode = mode === "code" || mode === "reset";
  const needsPassword = mode === "in" || mode === "up" || mode === "reset";

  return (
    <div className="login">
      <form className="box card" onSubmit={submit}>
        <img src="/logo-clipei-cut.png" alt="Clipei Cut" />
        <div style={{ textAlign: "center" }}>
          <h1 className="title" style={{ fontSize: 26 }}>
            {titles[mode]}
          </h1>
          <p className="muted small" style={{ margin: "6px 0 0" }}>
            {mode === "forgot" ? "Digite o e-mail da sua conta para receber um código." : "Clipes automáticos com IA, direto do seu PC."}
          </p>
        </div>

        {!online && (
          <div className="offline" role="status">
            Sem internet. Para entrar na sua conta é preciso estar conectado.
          </div>
        )}
        {!supabaseConfigured && <div className="error">O app ainda não foi ligado ao servidor.</div>}

        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input id="email" className="input" type="email" autoComplete="email" required value={email} disabled={needsCode} onChange={(e) => setEmail(e.target.value)} />
        </div>

        {needsCode && (
          <div className="field">
            <label htmlFor="codigo">Código de 6 dígitos (veja seu e-mail)</label>
            <input
              id="codigo"
              className="input codeInput"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </div>
        )}

        {needsPassword && (
          <div className="field">
            <label htmlFor="senha">{mode === "reset" ? "Nova senha" : "Senha"}</label>
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
        )}

        {mode === "in" && (
          <button type="button" className="linkBtn" style={{ alignSelf: "flex-end", fontSize: 13, marginTop: -8 }} onClick={() => go("forgot")}>
            Esqueci minha senha
          </button>
        )}

        {mode === "up" && (
          <label className="acceptRow">
            <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
            <span>
              Li e aceito os{" "}
              <button type="button" className="linkBtn" style={{ padding: 0 }} onClick={() => setLegal("termos")}>
                Termos de uso
              </button>{" "}
              e a{" "}
              <button type="button" className="linkBtn" style={{ padding: 0 }} onClick={() => setLegal("privacidade")}>
                Política de privacidade
              </button>
              .
            </span>
          </label>
        )}

        {msg && <div className={msg.kind === "error" ? "error" : "note"}>{msg.text}</div>}

        <button className="btn primary big" type="submit" disabled={busy || !supabaseConfigured || !online || (mode === "up" && !accept)}>
          {busy ? "Aguarde…" : button[mode]}
        </button>

        {needsCode && (
          <p className="muted small" style={{ textAlign: "center", margin: 0 }}>
            Não chegou?{" "}
            <button type="button" className="linkBtn" onClick={resend} disabled={busy}>
              Reenviar código
            </button>{" "}
            ·{" "}
            <button type="button" className="linkBtn" onClick={() => go("in")}>
              Voltar
            </button>
          </p>
        )}
        {(mode === "in" || mode === "up") && (
          <p className="muted small" style={{ textAlign: "center", margin: 0 }}>
            {mode === "in" ? "Ainda não tem conta?" : "Já tem conta?"}{" "}
            <button type="button" className="linkBtn" onClick={() => go(mode === "in" ? "up" : "in")}>
              {mode === "in" ? "Criar conta" : "Entrar"}
            </button>
          </p>
        )}
        {mode === "forgot" && (
          <p className="muted small" style={{ textAlign: "center", margin: 0 }}>
            <button type="button" className="linkBtn" onClick={() => go("in")}>
              Voltar para o login
            </button>
          </p>
        )}
        <p className="muted small" style={{ textAlign: "center", margin: 0 }}>
          Problemas para entrar?{" "}
          <button type="button" className="linkBtn" onClick={() => openSupport("Estou com problema para entrar na conta.")}>
            Fale com o suporte no WhatsApp
          </button>
        </p>
      </form>
      {legal && <LegalModal initial={legal} onClose={() => setLegal(null)} />}
    </div>
  );
}

function translate(m: string): string {
  if (/invalid login/i.test(m)) return "E-mail ou senha incorretos.";
  if (/already registered|already been registered/i.test(m)) return "Esse e-mail já tem conta. Use a opção Entrar.";
  if (/token has expired|invalid.*otp|otp.*invalid|token.*invalid/i.test(m)) return "Código inválido ou vencido. Confira os números ou peça um novo código.";
  if (/rate limit|too many/i.test(m)) return "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.";
  if (/same.*password|different from the old/i.test(m)) return "A nova senha precisa ser diferente da anterior.";
  if (/password/i.test(m) && /6/.test(m)) return "A senha precisa ter pelo menos 6 caracteres.";
  return m;
}
