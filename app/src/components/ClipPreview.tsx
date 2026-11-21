// Prévia do clipe como ele vai sair: mesmo recorte da exportação (desenhado num
// canvas a partir do vídeo original) + legenda animada no modelo escolhido.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Icon } from "./Icon";
import { captionY, groupWords, isBadWord, maskWord } from "../lib/ass";
import { fmtTime } from "../lib/format";
import { loadCaptionFonts } from "../lib/native";
import type { CaptionModel } from "../lib/settings";
import type { Clip, Layout, Rect, VideoInfo, Word } from "../lib/types";

type Box = { x: number; y: number; w: number; h: number };

/** Recorta a área de origem para cobrir o destino sem distorcer (igual ao "increase + crop" do FFmpeg). */
function cover(src: Box, destAspect: number): Box {
  const a = src.w / src.h;
  if (a > destAspect) {
    const w = src.h * destAspect;
    return { x: src.x + (src.w - w) / 2, y: src.y, w, h: src.h };
  }
  const h = src.w / destAspect;
  return { x: src.x, y: src.y + (src.h - h) / 2, w: src.w, h };
}

export function ClipPreview(props: {
  video: VideoInfo;
  clip: Clip;
  layout: Layout;
  webcam: Rect | null | undefined;
  words: Word[]; // tempos relativos ao clipe
  model: CaptionModel | null; // null = sem legenda
  censor: boolean;
  watermark: boolean;
  seek?: { t: number; n: number }; // pedido de pulo (tempo do vídeo original)
}) {
  const { video, clip, layout, webcam, words, model, censor, watermark, seek } = props;
  const vRef = useRef<HTMLVideoElement>(null);
  const cRef = useRef<HTMLCanvasElement>(null);
  const [t, setT] = useState(0); // tempo dentro do clipe
  const [playing, setPlaying] = useState(false);
  const src = useMemo(() => convertFileSrc(video.path), [video.path]);

  const vertical = layout !== "wide";
  const CW = vertical ? 540 : 960;
  const CH = vertical ? 960 : 540;
  const k = CW / (vertical ? 1080 : 1920);
  const len = clip.end - clip.start;
  const hasCam = layout === "cam-top" && Boolean(webcam);

  useEffect(() => {
    loadCaptionFonts();
  }, []);

  // Vai para o início do clipe quando ele muda
  useEffect(() => {
    const v = vRef.current;
    if (!v) return;
    const go = () => {
      v.currentTime = clip.start;
      setT(0);
    };
    if (v.readyState >= 1) go();
    else v.addEventListener("loadedmetadata", go, { once: true });
  }, [clip.id, clip.start, src]);

  useEffect(() => {
    const v = vRef.current;
    if (!v || !seek) return;
    v.currentTime = Math.min(Math.max(seek.t, clip.start), clip.end);
    v.play().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seek?.n]);

  // Desenha cada quadro com o mesmo recorte da exportação
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const v = vRef.current;
      const c = cRef.current;
      if (v && c && v.readyState >= 2) {
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, CW, CH);
        const W = video.width;
        const H = video.height;
        if (layout === "wide") {
          const s = Math.min(CW / W, CH / H);
          ctx.drawImage(v, (CW - W * s) / 2, (CH - H * s) / 2, W * s, H * s);
        } else if (hasCam && webcam) {
          const cam = cover({ x: webcam.x, y: webcam.y, w: Math.min(webcam.w, W), h: Math.min(webcam.h, H) }, 1080 / 720);
          ctx.drawImage(v, cam.x, cam.y, cam.w, cam.h, 0, 0, CW, 720 * k);
          const gw = Math.min(W, H * (1080 / 1200));
          const game = cover({ x: (W - gw) / 2, y: 0, w: gw, h: H }, 1080 / 1200);
          ctx.drawImage(v, game.x, game.y, game.w, game.h, 0, 720 * k, CW, 1200 * k);
        } else {
          const gw = Math.min(W, H * (9 / 16));
          const g = cover({ x: (W - gw) / 2, y: 0, w: gw, h: H }, 9 / 16);
          ctx.drawImage(v, g.x, g.y, g.w, g.h, 0, 0, CW, CH);
        }
        const rel = v.currentTime - clip.start;
        if (rel >= len || rel < -0.5) {
          v.currentTime = clip.start; // repete só o trecho do clipe
        }
        setT(Math.max(0, Math.min(len, rel)));
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [layout, hasCam, webcam, video.width, video.height, clip.start, len, CW, CH, k]);

  function toggle() {
    const v = vRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }

  // ----- Legenda ao vivo (mesma lógica do arquivo de legenda) -----
  const groups = useMemo(() => groupWords(words.filter((w) => w.end > 0 && w.start < len)), [words, len]);
  let caption: { list: Word[]; cur: number } | null = null;
  if (model) {
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      const gEnd = gi + 1 < groups.length ? Math.min(groups[gi + 1][0].start, g[g.length - 1].end + 0.6) : g[g.length - 1].end + 0.6;
      if (t >= g[0].start && t < gEnd) {
        let cur = 0;
        g.forEach((w, i) => {
          if (t >= w.start) cur = i;
        });
        caption = { list: model.anim === "digitacao" ? g.slice(0, cur + 1) : g, cur: model.anim === "frase" ? -1 : cur };
        break;
      }
    }
  }
  const fontSize = model ? (vertical ? 82 : 66) * (model.size / 100) * k : 0;
  const stroke = model?.outline && !model.box ? Math.max(1.2, fontSize * 0.075) : 0;
  const wordStyle = (on: boolean): CSSProperties => ({
    color: on ? model!.highlight : model!.base,
    display: "inline-block",
    transform: on ? `scale(${model!.anim === "pop" ? 1.18 : 1.12})` : "none",
    margin: on ? `0 ${fontSize * 0.1}px` : 0,
    WebkitTextStroke: stroke ? `${stroke}px #000` : undefined,
    paintOrder: "stroke fill",
    textShadow: stroke ? `0 ${fontSize * 0.06}px 0 #000` : "none",
  });
  const fmt = (w: string) => {
    const x = censor && isBadWord(w) ? maskWord(w) : w;
    return model?.uppercase ? x.toUpperCase() : x;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
      <div className="previewFrame" style={{ aspectRatio: `${CW} / ${CH}`, width: vertical ? "min(100%, 320px)" : "100%" }}>
        <canvas ref={cRef} width={CW} height={CH} style={{ width: "100%", height: "100%", display: "block" }} onClick={toggle} />
        {caption && model && (
          <div
            style={{
              position: "absolute",
              left: "6%",
              right: "6%",
              top: `${(captionY(layout, hasCam, model.position) * k * 100) / CH}%`,
              transform: "translateY(-50%)",
              textAlign: "center",
              pointerEvents: "none",
            }}
          >
            <span
              style={{
                fontFamily: `clipei-${model.font}, Impact, sans-serif`,
                fontSize: `${(fontSize / CW) * 100}cqw`,
                lineHeight: 1.15,
                background: model.box ? "rgba(0,0,0,0.7)" : "transparent",
                padding: model.box ? "0.15em 0.3em" : 0,
                borderRadius: model.box ? "0.15em" : 0,
              }}
            >
              {caption.list.map((w, i) => (
                <span key={i}>
                  {i > 0 && " "}
                  <span style={wordStyle(i === caption!.cur)}>{fmt(w.word)}</span>
                </span>
              ))}
            </span>
          </div>
        )}
        {model?.brand.trim() && (
          <span className="pvBrand" style={{ fontFamily: `clipei-${model.font}, sans-serif`, fontSize: `${((37 * (model.size / 100) * k) / CW) * 100}cqw` }}>
            {model.brand}
          </span>
        )}
        {watermark && <span className="pvMark">Feito com Clipei Cut</span>}
        {!playing && (
          <button className="pvPlay" onClick={toggle} aria-label="Reproduzir prévia">
            <Icon name="play" size={26} color="#fff" />
          </button>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, width: vertical ? "min(100%, 320px)" : "100%" }}>
        <button className="btn" style={{ minHeight: 36, padding: "0 12px" }} onClick={toggle} aria-label={playing ? "Pausar" : "Reproduzir"}>
          {playing ? "❚❚" : <Icon name="play" size={14} />}
        </button>
        <input
          type="range"
          min={0}
          max={len}
          step={0.05}
          value={t}
          aria-label="Posição no clipe"
          style={{ flex: 1, accentColor: "#e3121f" }}
          onChange={(e) => {
            const v = vRef.current;
            if (v) v.currentTime = clip.start + Number(e.target.value);
          }}
        />
        <span className="muted small" style={{ minWidth: 76, textAlign: "right" }}>
          {fmtTime(t)} / {fmtTime(len)}
        </span>
      </div>

      <video
        ref={vRef}
        src={src}
        preload="auto"
        playsInline
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
      />
    </div>
  );
}
