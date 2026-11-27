import { useEffect, useRef, useState } from "react";
import { fetchAccount, startCheckout } from "../lib/account";

/** Só no painel admin: paga R$ 1,00 pela InfinitePay e confere se o servidor liberou (6 min de horas avulsas). */
export function PaymentTest() {
  const [state, setState] = useState<"idle" | "opening" | "waiting" | "ok" | "timeout" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const poll = useRef<number | null>(null);
  useEffect(() => () => {
    if (poll.current) clearInterval(poll.current);
  }, []);

  async function run() {
    setError(null);
    setState("opening");
    try {
      const before = (await fetchAccount())?.extraSeconds ?? 0;
      await startCheckout("teste_1", "unico");
      setState("waiting");
      let tries = 0;
      poll.current = window.setInterval(async () => {
        tries++;
        const a = await fetchAccount().catch(() => null);
        if (a && a.extraSeconds > before) {
          clearInterval(poll.current!);
          setState("ok");
        } else if (tries > 120) {
          clearInterval(poll.current!);
          setState("timeout");
        }
      }, 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }

  return (
    <section className="card adminBox" aria-labelledby="pay-test" style={{ borderColor: "#3a2f5c" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h3 id="pay-test">Testar pagamento (R$ 1,00)</h3>
          <span className="muted small">Abre um pagamento real de R$ 1,00 pela InfinitePay. Ao aprovar, sua conta ganha 6 minutos de horas avulsas — prova de que tudo funcionou.</span>
        </div>
        <button className="btn primary" disabled={state === "opening" || state === "waiting"} onClick={run}>
          {state === "opening" ? "Abrindo…" : state === "waiting" ? "Aguardando pagamento…" : "Pagar R$ 1,00 de teste"}
        </button>
      </div>
      {state === "waiting" && <div className="note small">Pague no navegador (Pix é o mais rápido). Esta tela confere sozinha a cada 5 segundos.</div>}
      {state === "ok" && <div className="okMsg">✅ Pagamento aprovado e liberado pelo servidor! A integração com a InfinitePay está funcionando de ponta a ponta.</div>}
      {state === "timeout" && (
        <div className="error">Não vi o pagamento em 10 minutos. Se você pagou, confira em Supabase › Edge Functions › ip-webhook › Logs e me mande um print.</div>
      )}
      {state === "error" && error && <div className="error">{error}</div>}
    </section>
  );
}
