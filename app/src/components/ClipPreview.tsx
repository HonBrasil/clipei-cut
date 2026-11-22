// Prévia do clipe como ele vai sair: mesmo recorte da exportação (desenhado num
// canvas a partir do vídeo original) + legenda animada no modelo escolhido.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Icon } from "./Icon";
import { captionY, groupWords, isBadWord, keywordColor, maskWord } from "../lib/ass";
import { fromOut, toOut, zoomAt, type ClipPlan } from "../lib/edit";
import { fmtTime } from "../lib/format";
import { loadCaptionFonts } from "../lib/native";
import type { CaptionModel } from "../lib/settings";
import { captionBase, layoutSize, type Clip, type Layout, type Rect, type VideoInfo, type Word } from "../lib/types";
import { ctaY, logoBox, type Cta } from "../lib/brand";
import type { BrandKit } from "../lib/settings";

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

// Áreas cobertas pelos botões e textos de cada rede no vídeo vertical (em pixels de 1080x1920).
type Zone = "off" | "tiktok" | "reels" | "shorts";
const ZONES: Record<Exclude<Zone, "off">, { name: string; boxes: Array<{ x: number; y: number; w: number; h: number; label?: string }> }> = {
  tiktok: {
    name: "TikTok",
    boxes: [
      { x: 0, y: 0, w: 1080, h: 170, label: "Abas" },
      { x: 900, y: 760, w: 180, h: 840, label: "Botões" },
      { x: 0, y: 1500, w: 900, h: 420, label: "Nome e descrição" },
    ],
  },
  reels: {
    name: "Reels",
    boxes: [
      { x: 0, y: 0, w: 1080, h: 200, label: "Topo" },
      { x: 920, y: 900, w: 160, h: 760, label: "Botões" },
      { x: 0, y: 1560, w: 920, h: 360, label: "Nome e legenda" },
    ],
  },
  shorts: {
    name: "Shorts",
    boxes: [
      { x: 0, y: 0, w: 1080, h: 150, label: "Topo" },
      { x: 920, y: 960, w: 160, h: 760, label: "Botões" },
      { x: 0, y: 1610, w: 920, h: 310, label: "Título do canal" },
    ],
  },
};
const ZONE_KEY = "clipei-zona-segura";

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
  plan?: ClipPlan; // cortes, destaques, emojis e zoom (edição automática)
  speakers?: [Rect, Rect] | null; // podcast
  brand?: { kit: BrandKit; cta: Cta | null } | null; // kit da marca (planos pagos)
}) {
  const { video, clip, layout, webcam, model, censor, watermark, seek, plan, speakers, brand } = props;
  const words = plan ? plan.words : props.words;
  const [zone, setZone] = useState<Zone>(() => (localStorage.getItem(ZONE_KEY) as Zone) || "off");
  const pickZone = (z: Zone) => {
    setZone(z);
    localStorage.setItem(ZONE_KEY, z);
  };
  const vRef = useRef<HTMLVideoElement>(null);
  const cRef = useRef<HTMLCanvasElement>(null);
  const [t, setT] = useState(0); // tempo dentro do clipe
  const [playing, setPlaying] = useState(false);
  const src = useMemo(() => convertFileSrc(video.path), [video.path]);

  const size = layoutSize(layout);
  const vertical = size.h > size.w;
  const square = size.h === size.w;
  const k = vertical ? 0.5 : square ? 600 / 1080 : 0.5;
  const CW = size.w * k;
  const CH = size.h * k;
  const len = plan ? plan.outLen : clip.end - clip.start; // duração final
  const rawLen = clip.end - clip.start;
  const keeps = plan?.keeps;
  const zoomList = plan?.zoom ?? [];
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
        // Tempo original dentro do clipe → pula os trechos cortados
        let rel = v.currentTime - clip.start;
        if (keeps && keeps.length && rel >= 0 && rel < rawLen) {
          const inside = keeps.some(([a, b]) => rel >= a && rel <= b);
          if (!inside) {
            const nxt = keeps.find(([a]) => a > rel);
            if (nxt) {
              v.currentTime = clip.start + nxt[0];
              rel = nxt[0];
            } else rel = rawLen;
          }
        }
        const tOut = keeps ? (toOut(Math.max(0, rel), keeps) ?? 0) : rel;
        const z = zoomList.length ? zoomAt(tOut, zoomList) : 1;
        // Zoom: aproxima o centro da área (mesma curva da exportação)
        const zoomed = (b: Box): Box => (z === 1 ? b : { x: b.x + (b.w - b.w / z) / 2, y: b.y + (b.h - b.h / z) / 2, w: b.w / z, h: b.h / z });
        if (layout === "wide") {
          const s = Math.min(CW / W, CH / H) * z;
          ctx.drawImage(v, (CW - W * s) / 2, (CH - H * s) / 2, W * s, H * s);
        } else if ((layout === "podcast" || layout === "square") && speakers) {
          // Podcast: duas pessoas (em cima/embaixo no 9:16, lado a lado no 1:1)
          const side = layout === "square";
          speakers.forEach((r, i) => {
            const a = zoomed(cover({ x: r.x, y: r.y, w: Math.min(r.w, W), h: Math.min(r.h, H) }, side ? 0.5 : 1080 / 960));
            if (side) ctx.drawImage(v, a.x, a.y, a.w, a.h, (i * CW) / 2, 0, CW / 2, CH);
            else ctx.drawImage(v, a.x, a.y, a.w, a.h, 0, (i * CH) / 2, CW, CH / 2);
          });
        } else if (layout === "square") {
          const sd = Math.min(W, H);
          const a = zoomed({ x: (W - sd) / 2, y: (H - sd) / 2, w: sd, h: sd });
          ctx.drawImage(v, a.x, a.y, a.w, a.h, 0, 0, CW, CH);
        } else if (hasCam && webcam) {
          const cam = zoomed(cover({ x: webcam.x, y: webcam.y, w: Math.min(webcam.w, W), h: Math.min(webcam.h, H) }, 1080 / 720));
          ctx.drawImage(v, cam.x, cam.y, cam.w, cam.h, 0, 0, CW, 720 * k);
          const gw = Math.min(W, H * (1080 / 1200));
          const game = cover({ x: (W - gw) / 2, y: 0, w: gw, h: H }, 1080 / 1200);
          ctx.drawImage(v, game.x, game.y, game.w, game.h, 0, 720 * k, CW, 1200 * k);
        } else {
          const gw = Math.min(W, H * (9 / 16));
          const g = zoomed(cover({ x: (W - gw) / 2, y: 0, w: gw, h: H }, 9 / 16));
          ctx.drawImage(v, g.x, g.y, g.w, g.h, 0, 0, CW, CH);
        }
        if (rel >= rawLen || rel < -0.5) {
          v.currentTime = clip.start + (keeps?.[0]?.[0] ?? 0); // repete só o trecho do clipe
        }
        setT(Math.max(0, Math.min(len, tOut)));
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [layout, hasCam, webcam, speakers, video.width, video.height, clip.start, len, rawLen, keeps, zoomList, CW, CH, k]);

  function toggle() {
    const v = vRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }

  // ----- Legenda ao vivo (mesma lógica do arquivo de legenda) -----
  const groups = useMemo(
    () => groupWords(words.map((w, i) => ({ ...w, kw: plan?.keywords.has(i) ?? false })).filter((w) => w.end > 0 && w.start < len)) as Array<Array<Word & { kw?: boolean }>>,
    [words, len, plan],
  );
  let caption: { list: Array<Word & { kw?: boolean }>; cur: number } | null = null;
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
  const fontSize = model ? captionBase(layout) * (model.size / 100) * k : 0;
  const stroke = model?.outline && !model.box ? Math.max(1.2, fontSize * 0.075) : 0;
  const kwColor = model ? keywordColor(model) : "#FFD43B";
  const emojiNow = plan?.emojis.find((e) => t >= e.start && t < e.end) ?? null;
  const wordStyle = (on: boolean, kw = false): CSSProperties => ({
    color: on ? model!.highlight : kw ? kwColor : model!.base,
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
      <div className="previewFrame" style={{ aspectRatio: `${CW} / ${CH}`, width: vertical ? "min(100%, 320px)" : square ? "min(100%, 400px)" : "100%" }}>
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
                  <span style={wordStyle(i === caption!.cur, w.kw)}>{fmt(w.word)}</span>
                </span>
              ))}
            </span>
          </div>
        )}
        {emojiNow && (
          <span
            key={emojiNow.start}
            className="pvEmoji"
            aria-hidden
            style={{
              top: `${((captionY(layout, hasCam, model?.position ?? "meio") - fontSize / k - 75) * k * 100) / CH}%`,
              fontSize: `${((130 * k) / CW) * 100}cqw`,
            }}
          >
            {emojiNow.emoji}
          </span>
        )}
        {brand?.kit.logo && (
          (() => {
            const b = logoBox(brand.kit, layout);
            return (
              <img
                className="pvLogo"
                src={convertFileSrc(brand.kit.logo)}
                alt=""
                style={{ left: `${(b.x / size.w) * 100}%`, top: `${(b.y / size.h) * 100}%`, width: `${(b.w / size.w) * 100}%`, opacity: brand.kit.logoOpacity / 100 }}
              />
            );
          })()
        )}
        {brand?.cta && t >= len - brand.cta.seconds && (
          <span
            className="pvCta"
            style={{
              top: `${ctaY(model?.position ?? "meio") * 100}%`,
              background: brand.cta.color,
              color: brand.cta.textColor,
              fontSize: `${((captionBase(layout) * 0.78 * (model ? model.size / 100 : 1) * k) / CW) * 100}cqw`,
            }}
          >
            {brand.cta.text}
          </span>
        )}
        {model?.brand.trim() && (
          <span className="pvBrand" style={{ fontFamily: `clipei-${model.font}, sans-serif`, fontSize: `${((37 * (model.size / 100) * k) / CW) * 100}cqw` }}>
            {model.brand}
          </span>
        )}
        {watermark && <span className="pvMark">Feito com Clipei Cut</span>}
        {vertical && zone !== "off" && (
          <div className="safeZones" aria-hidden>
            {ZONES[zone].boxes.map((b, n) => (
              <div key={n} className="safeBox" style={{ left: `${(b.x / 1080) * 100}%`, top: `${(b.y / 1920) * 100}%`, width: `${(b.w / 1080) * 100}%`, height: `${(b.h / 1920) * 100}%` }}>
                {b.label && <span>{b.label}</span>}
              </div>
            ))}
          </div>
        )}
        {!playing && (
          <button className="pvPlay" onClick={toggle} aria-label="Reproduzir prévia">
            <Icon name="play" size={26} color="#fff" />
          </button>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, width: vertical ? "min(100%, 320px)" : square ? "min(100%, 400px)" : "100%" }}>
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
            if (v) v.currentTime = clip.start + (keeps ? fromOut(Number(e.target.value), keeps) : Number(e.target.value));
          }}
        />
        <span className="muted small" style={{ minWidth: 76, textAlign: "right" }}>
          {fmtTime(t)} / {fmtTime(len)}
        </span>
      </div>

      {vertical && (
        <div className="zonePick" style={{ width: "min(100%, 320px)" }}>
          <span className="muted" style={{ fontSize: 12 }}>Zona segura</span>
          <div className="seg sm" role="radiogroup" aria-label="Mostrar zona segura">
            {(["off", "tiktok", "reels", "shorts"] as Zone[]).map((z) => (
              <button key={z} role="radio" aria-checked={zone === z} className={zone === z ? "on" : ""} onClick={() => pickZone(z)}>
                {z === "off" ? "Não" : ZONES[z].name}
              </button>
            ))}
          </div>
        </div>
      )}
      {vertical && zone !== "off" && model && hidden(ZONES[zone].boxes, captionY(layout, hasCam, model.position), fontSize / k) && (
        <span className="zoneWarn" style={{ width: "min(100%, 320px)" }}>
          ⚠️ A legenda fica atrás da interface do {ZONES[zone].name}. Mude a posição da legenda para “Meio” no modelo.
        </span>
      )}
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

/** A faixa da legenda (centro y, altura ~2 linhas) cai numa área coberta que pega a largura toda? */
function hidden(boxes: Array<{ x: number; y: number; w: number; h: number }>, y: number, font: number): boolean {
  const top = y - font;
  const bottom = y + font;
  return boxes.some((b) => b.w >= 800 && bottom > b.y && top < b.y + b.h);
}
