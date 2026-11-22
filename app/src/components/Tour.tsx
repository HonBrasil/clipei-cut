import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// Tutorial guiado: destaca uma parte do app por vez, com um balão explicando.
// A pessoa pode pular a qualquer momento (botão, Esc) e rever depois nas Configurações.

export type TourStep = {
  target?: string; // valor do atributo data-tour; sem alvo = balão no centro
  title: string;
  text: string;
  tip?: string;
};

export const TOUR_STEPS: TourStep[] = [
  {
    title: "Bem-vindo ao Clipei Cut 👋",
    text: "Em menos de 1 minuto você vê como transformar um vídeo longo em clipes prontos para TikTok, Reels e Shorts.",
    tip: "Você pode pular agora e rever quando quiser em Configurações › Ajuda.",
  },
  {
    target: "drop",
    title: "1. Escolha o vídeo",
    text: "Clique aqui ou arraste um vídeo do seu computador. Ele não é enviado para a internet: só o áudio vai para a IA.",
  },
  {
    target: "duracao",
    title: "2. Tamanho dos clipes",
    text: "Escolha a duração que combina com a rede onde você vai postar. Na dúvida, deixe o padrão.",
  },
  {
    target: "quantidade",
    title: "3. Quantos clipes",
    text: "No automático, a IA escolhe só os melhores momentos. Nos planos pagos você pode pedir uma quantidade exata.",
  },
  {
    target: "nav-library",
    title: "4. Meus clipes",
    text: "Todo projeto fica salvo aqui. Abra para ver o clipe no formato final, corrigir a legenda e exportar.",
    tip: "A webcam é detectada sozinha para montar o layout vertical.",
  },
  {
    target: "nav-captions",
    title: "5. Modelos de legenda",
    text: "Escolha o estilo das legendas animadas: fonte, cores e destaque da palavra falada. Dá para criar o seu.",
  },
  {
    target: "nav-exports",
    title: "6. Pasta de exportação",
    text: "Os clipes prontos vão para esta pasta. Você pode mudar o local e a qualidade em Configurações.",
  },
  {
    target: "credits",
    title: "7. Suas horas de IA",
    text: "Cada vídeo analisado consome horas conforme a duração dele. Você ganha 1 hora de teste neste computador.",
    tip: "Precisa de mais? É só abrir \"Ver planos\" no menu.",
  },
  {
    target: "nav-support",
    title: "Precisa de ajuda?",
    text: "Fale com a equipe da Clipei Studio Digital pelo WhatsApp a qualquer momento.",
  },
  {
    title: "Tudo pronto! 🎬",
    text: "Agora é com você: escolha um vídeo e deixe a IA encontrar os melhores momentos.",
  },
];

type Rect = { top: number; left: number; width: number; height: number };
const PAD = 8;
const CARD_W = 340;

function findTarget(name?: string): Rect | null {
  if (!name) return null;
  const el = document.querySelector<HTMLElement>(`[data-tour="${name}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return null; // escondido (ex.: tela estreita)
  return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
}

export function Tour({ onFinish, onLastAction, startAt = 0 }: { onFinish: (completed: boolean) => void; onLastAction?: () => void; startAt?: number }) {
  const [i, setI] = useState(startAt);
  const [rect, setRect] = useState<Rect | null>(null);
  const [card, setCard] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const step = TOUR_STEPS[i];
  const last = i === TOUR_STEPS.length - 1;

  const next = useCallback(() => (last ? onFinish(true) : setI((n) => n + 1)), [last, onFinish]);
  const back = useCallback(() => setI((n) => Math.max(0, n - 1)), []);

  // Leva o alvo para a tela e mede a posição
  useLayoutEffect(() => {
    const el = step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null;
    el?.scrollIntoView({ block: "center", behavior: "auto" });
    const measure = () =>
      setRect((old) => {
        const r = findTarget(step.target);
        const same = old && r && Math.abs(old.top - r.top) < 1 && Math.abs(old.left - r.left) < 1 && Math.abs(old.width - r.width) < 1 && Math.abs(old.height - r.height) < 1;
        return same ? old : r;
      });
    measure();
    window.addEventListener("resize", measure);
    const main = document.querySelector(".main");
    main?.addEventListener("scroll", measure, { passive: true });
    // Imagens e fontes que terminam de carregar mudam o layout: acompanha por um tempo
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    if (el) ro.observe(el);
    const tick = setInterval(measure, 400);
    return () => {
      window.removeEventListener("resize", measure);
      main?.removeEventListener("scroll", measure);
      ro.disconnect();
      clearInterval(tick);
    };
  }, [step.target]);

  // Posiciona o balão: à direita do menu, ou abaixo/acima do conteúdo, sempre dentro da janela
  useLayoutEffect(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const h = cardRef.current?.offsetHeight ?? 220;
    const w = Math.min(CARD_W, vw - 32);
    if (!rect) {
      setCard({ top: Math.max(16, (vh - h) / 2), left: Math.max(16, (vw - w) / 2) });
      return;
    }
    let top: number;
    let left: number;
    if (rect.left + rect.width + 16 + w <= vw && rect.width < vw * 0.4) {
      left = rect.left + rect.width + 16; // à direita
      top = rect.top + rect.height / 2 - h / 2;
    } else if (rect.top + rect.height + 16 + h <= vh) {
      top = rect.top + rect.height + 16; // abaixo
      left = rect.left + rect.width / 2 - w / 2;
    } else {
      top = rect.top - 16 - h; // acima
      left = rect.left + rect.width / 2 - w / 2;
    }
    setCard({ top: Math.min(Math.max(16, top), vh - h - 16), left: Math.min(Math.max(16, left), vw - w - 16) });
  }, [rect, i]);

  // Teclado: → / Enter avança, ← volta, Esc pula
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFinish(false);
      else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, back, onFinish]);

  useEffect(() => {
    cardRef.current?.focus();
  }, [i]);

  const first = i === 0;

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-text">
      {rect ? (
        <div className="tourHole" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />
      ) : (
        <div className="tourDim" />
      )}
      {/* Bloqueia cliques no app enquanto o tour está aberto */}
      <div className="tourBlock" onClick={(e) => e.stopPropagation()} />

      <div
        ref={cardRef}
        tabIndex={-1}
        className={`tourCard ${first || last ? "hero" : ""}`}
        style={{ top: card?.top ?? -9999, left: card?.left ?? -9999, width: Math.min(CARD_W, window.innerWidth - 32) }}
      >
        <div className="tourTop">
          <span className="tourCount">
            {first ? "Tutorial rápido" : last ? "Fim do tutorial" : `Passo ${i} de ${TOUR_STEPS.length - 2}`}
          </span>
          {!last && (
            <button className="linkBtn tourSkip" onClick={() => onFinish(false)}>
              Pular tutorial
            </button>
          )}
        </div>
        <h2 id="tour-title">{step.title}</h2>
        <p id="tour-text">{step.text}</p>
        {step.tip && <p className="tourTip">{step.tip}</p>}

        <div className="tourDots" aria-hidden>
          {TOUR_STEPS.map((_, n) => (
            <span key={n} className={n === i ? "on" : n < i ? "done" : ""} />
          ))}
        </div>

        <div className="tourActions">
          {first ? (
            <>
              <button className="btn" onClick={() => onFinish(false)}>
                Agora não
              </button>
              <button className="btn primary" onClick={next}>
                Começar o tour →
              </button>
            </>
          ) : last ? (
            <>
              <button className="btn" onClick={back}>
                ← Voltar
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  onFinish(true);
                  onLastAction?.();
                }}
              >
                Escolher meu primeiro vídeo
              </button>
            </>
          ) : (
            <>
              <button className="btn" onClick={back}>
                ← Voltar
              </button>
              <button className="btn primary" onClick={next}>
                Próximo →
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
