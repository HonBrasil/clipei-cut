import { useState } from "react";
import { PLAN_INFO, type Account } from "../lib/account";

/** Planos pré-pagos: avisa nos últimos dias antes do vencimento, com um botão para renovar. */
export function RenewBanner({ account, onRenew }: { account: Account | null; onRenew: () => void }) {
  const [hidden, setHidden] = useState(() => sessionStorage.getItem("clipei-renova-oculto") === account?.planExpiresAt);
  if (!account || account.plan === "free" || !account.planExpiresAt || hidden) return null;
  // Assinatura antiga no cartão renova sozinha; grupo e criador não pagam por esta conta
  if (account.planMethod !== "avulso") return null;
  const days = Math.ceil((new Date(account.planExpiresAt).getTime() - Date.now()) / 86400_000);
  if (days > 5 || days < 0) return null;

  return (
    <div className="renewBanner" role="status">
      <span>
        ⏰ Seu plano <b>{PLAN_INFO[account.plan].name}</b> vence {days <= 0 ? "hoje" : days === 1 ? "amanhã" : `em ${days} dias`}. Renove para não perder suas horas e recursos — o
        tempo novo soma ao que você já tem.
      </span>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn primary" onClick={onRenew}>
          Renovar agora
        </button>
        <button
          className="btn"
          aria-label="Lembrar depois"
          onClick={() => {
            sessionStorage.setItem("clipei-renova-oculto", account.planExpiresAt ?? "");
            setHidden(true);
          }}
        >
          Depois
        </button>
      </div>
    </div>
  );
}
