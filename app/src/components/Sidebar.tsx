import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Icon } from "./Icon";
import { fmtHours } from "../lib/format";
import { PLAN_INFO, type Account } from "../lib/account";
import { openSupport } from "../lib/support";

export type Screen = "home" | "library" | "analysis" | "clips" | "captions" | "exports" | "settings" | "plans" | "admin";

export function Sidebar(props: {
  screen: Screen;
  credits: number | null;
  account: Account | null;
  isAdmin?: boolean;
  onNavigate: (s: Screen) => void;
  onLogout: () => void;
}) {
  const { screen, credits, account, isAdmin, onNavigate, onLogout } = props;
  const inNew = screen === "home" || screen === "analysis";
  const inLib = screen === "library" || screen === "clips";
  const [version, setVersion] = useState("");
  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion(""));
  }, []);
  const allowance = account?.allowanceSeconds ?? 3600;
  const pct = credits == null ? 0 : Math.min(100, (credits / allowance) * 100);
  return (
    <nav className="side" aria-label="Menu principal">
      <div className="logo">
        <img src="/logo-clipei-cut.png" alt="Clipei Cut" />
      </div>
      <button className={`nav-item ${inNew ? "active" : ""}`} onClick={() => onNavigate("home")} aria-current={inNew ? "page" : undefined}>
        <Icon name="plus" /> <span className="label">Novo projeto</span>
      </button>
      <button data-tour="nav-library" className={`nav-item ${inLib ? "active" : ""}`} onClick={() => onNavigate("library")} aria-current={inLib ? "page" : undefined}>
        <Icon name="grid" /> <span className="label">Meus clipes</span>
      </button>
      {(
        [
          ["captions", "text", "Modelos de legenda"],
          ["exports", "folder", "Pasta de exportação"],
          ["settings", "gear", "Configurações"],
        ] as Array<[Screen, string, string]>
      ).map(([id, icon, label]) => (
        <button key={id} data-tour={`nav-${id}`} className={`nav-item ${screen === id ? "active" : ""}`} onClick={() => onNavigate(id)} aria-current={screen === id ? "page" : undefined}>
          <Icon name={icon} /> <span className="label">{label}</span>
        </button>
      ))}

      {isAdmin && (
        <button className={`nav-item ${screen === "admin" ? "active" : ""}`} onClick={() => onNavigate("admin")} aria-current={screen === "admin" ? "page" : undefined}>
          <Icon name="grid" color="#b9a3ff" /> <span className="label">Painel admin</span>
        </button>
      )}
      <button data-tour="nav-support" className="nav-item" onClick={() => openSupport()} title="Falar com o suporte no WhatsApp">
        <Icon name="chat" color="#4ade80" /> <span className="label">Suporte (WhatsApp)</span>
      </button>

      <div className="credits" data-tour="credits">
        <div className="row">
          <span>{account ? `Plano ${PLAN_INFO[account.plan].name}` : "Créditos de IA"}</span>
          <b>{credits == null ? "—" : fmtHours(credits)}</b>
        </div>
        <div className="bar">
          <div style={{ width: `${pct}%` }} />
        </div>
        <button className="btn primary" style={{ minHeight: 38, fontSize: 13 }} onClick={() => onNavigate("plans")}>
          {account && account.plan !== "free" ? "Mais horas" : "Ver planos"}
        </button>
        <button className="linkBtn" style={{ alignSelf: "flex-start", fontSize: 13 }} onClick={onLogout}>
          Sair da conta
        </button>
      </div>
      {version && <span className="muted" style={{ fontSize: 11, padding: "8px 12px 0" }}>Clipei Cut versão {version}</span>}
    </nav>
  );
}
