import { Icon } from "./Icon";
import { fmtHours } from "../lib/format";

export type Screen = "home" | "analysis" | "clips";

export function Sidebar(props: {
  screen: Screen;
  hasClips: boolean;
  credits: number | null;
  onNavigate: (s: Screen) => void;
  onLogout: () => void;
}) {
  const { screen, hasClips, credits, onNavigate, onLogout } = props;
  const pct = credits == null ? 0 : Math.min(100, (credits / 3600) * 100);
  return (
    <nav className="side" aria-label="Menu principal">
      <div className="logo">
        <img src="/logo-clipei-cut.png" alt="Clipei Cut" />
      </div>
      <button className={`nav-item ${screen === "home" ? "active" : ""}`} onClick={() => onNavigate("home")} aria-current={screen === "home" ? "page" : undefined}>
        <Icon name="plus" /> <span className="label">Novo projeto</span>
      </button>
      <button className={`nav-item ${screen === "clips" ? "active" : ""}`} onClick={() => onNavigate("clips")} disabled={!hasClips} aria-current={screen === "clips" ? "page" : undefined}>
        <Icon name="grid" /> <span className="label">Meus clipes</span>
      </button>
      <button className="nav-item" disabled>
        <Icon name="text" /> <span className="label">Modelos de legenda</span> <span className="soon">em breve</span>
      </button>
      <button className="nav-item" disabled>
        <Icon name="folder" /> <span className="label">Pasta de exportação</span> <span className="soon">em breve</span>
      </button>
      <button className="nav-item" disabled>
        <Icon name="gear" /> <span className="label">Configurações</span> <span className="soon">em breve</span>
      </button>

      <div className="credits">
        <div className="row">
          <span>Créditos de IA</span>
          <b>{credits == null ? "—" : fmtHours(credits)}</b>
        </div>
        <div className="bar">
          <div style={{ width: `${pct}%` }} />
        </div>
        <button className="linkBtn" style={{ alignSelf: "flex-start", fontSize: 13 }} onClick={onLogout}>
          Sair da conta
        </button>
      </div>
    </nav>
  );
}
