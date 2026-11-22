import { useEffect, useState, type CSSProperties } from "react";
import { FONTS, type CaptionModel } from "../lib/settings";

const SAMPLE = ["NÃO", "ACREDITO", "NISSO", "OLHA", "ESSA", "JOGADA"];

/**
 * Celular com "cam em cima" e a legenda animada como vai sair no vídeo.
 * `width` em px; as medidas seguem a proporção do vídeo 1080x1920.
 */
export function CaptionPreview({ model, width = 220, animate = true }: { model: CaptionModel; width?: number; animate?: boolean }) {
  const [i, setI] = useState(1);
  useEffect(() => {
    if (!animate) return;
    const t = setInterval(() => setI((n) => (n + 1) % SAMPLE.length), 420);
    return () => clearInterval(t);
  }, [animate]);

  const k = width / 1080;
  const fontSize = 82 * (model.size / 100) * (FONTS[model.font]?.scale ?? 1) * k;
  const top = { topo: 830, meio: 1010, baixo: 1560 }[model.position] * k;
  const group = i < 3 ? SAMPLE.slice(0, 3) : SAMPLE.slice(3);
  const cur = i % 3;
  const visible = model.anim === "digitacao" ? group.slice(0, cur + 1) : group;

  const stroke = model.outline && !model.box ? `${Math.max(1, fontSize * 0.07)}px` : "0";
  const word = (on: boolean): CSSProperties => ({
    color: on && model.anim !== "frase" ? model.highlight : model.base,
    display: "inline-block",
    transform: on && model.anim !== "frase" ? `scale(${model.anim === "pop" ? 1.18 : 1.1})` : "none",
    transition: "transform 0.12s",
    margin: on ? `0 ${fontSize * 0.1}px` : 0,
    WebkitTextStroke: `${stroke} #000`,
    paintOrder: "stroke fill",
    textShadow: model.outline && !model.box ? `0 ${fontSize * 0.06}px 0 #000` : "none",
    textTransform: model.uppercase ? "uppercase" : "none",
  });

  return (
    <div
      aria-hidden="true"
      style={{ position: "relative", width, aspectRatio: "9 / 16", borderRadius: 14 * (width / 220), overflow: "hidden", background: "#1c2833", border: "1px solid #2c2c36", flex: "0 0 auto" }}
    >
      <div style={{ height: "37.5%", background: "#3a2f4d", position: "relative" }}>
        <div style={{ position: "absolute", left: "50%", top: "22%", width: "24%", aspectRatio: "1", transform: "translateX(-50%)", borderRadius: 99, background: "#6a5a82" }} />
        <div style={{ position: "absolute", left: "50%", bottom: 0, width: "54%", height: "30%", transform: "translateX(-50%)", borderRadius: "50px 50px 0 0", background: "#6a5a82" }} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "26%", background: "#22301f" }} />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top,
          transform: "translateY(-50%)",
          display: "flex",
          justifyContent: "center",
          padding: "0 6%",
        }}
      >
        <span
          style={{
            fontFamily: `clipei-${model.font}, Impact, sans-serif`,
            fontSize,
            lineHeight: 1.15,
            letterSpacing: fontSize * 0.01,
            background: model.box ? "rgba(0,0,0,0.7)" : "transparent",
            padding: model.box ? `${fontSize * 0.15}px ${fontSize * 0.3}px` : 0,
            borderRadius: model.box ? fontSize * 0.15 : 0,
            textAlign: "center",
          }}
        >
          {visible.map((w, n) => (
            <span key={`${w}-${n}`}>
              {n > 0 && " "}
              <span style={word(n === cur)}>{model.uppercase ? w : w.toLowerCase()}</span>
            </span>
          ))}
        </span>
      </div>
      {model.brand.trim() && (
        <span style={{ position: "absolute", right: 40 * k, top: 40 * k, fontFamily: `clipei-${model.font}, sans-serif`, fontSize: 37 * (model.size / 100) * k, color: "rgba(255,255,255,0.82)", WebkitTextStroke: "0.5px #000" }}>
          {model.brand}
        </span>
      )}
    </div>
  );
}
