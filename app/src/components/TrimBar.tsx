import { useRef, type PointerEvent as RPointerEvent } from "react";

const fmt = (t: number) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
};

/** Barra de corte: duas alças para arrastar início e fim dentro de uma janela do vídeo. */
export function TrimBar(props: {
  start: number;
  end: number;
  min: number; // começo da janela visível
  max: number; // fim da janela visível
  orig?: { start: number; end: number }; // corte original da IA (marcado em cinza)
  playhead?: number | null;
  onChange: (start: number, end: number, edge: "start" | "end") => void;
}) {
  const { start, end, min, max, orig, playhead, onChange } = props;
  const bar = useRef<HTMLDivElement>(null);
  const drag = useRef<"start" | "end" | "range" | null>(null);
  const grab = useRef({ x: 0, s: 0, e: 0 });
  const span = Math.max(1, max - min);
  const pct = (t: number) => `${((Math.min(max, Math.max(min, t)) - min) / span) * 100}%`;

  const toTime = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return min + Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * span;
  };

  function down(e: RPointerEvent, what: "start" | "end" | "range") {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = what;
    grab.current = { x: e.clientX, s: start, e: end };
  }
  function move(e: RPointerEvent) {
    if (!drag.current || !bar.current) return;
    if (drag.current === "range") {
      const r = bar.current.getBoundingClientRect();
      let d = ((e.clientX - grab.current.x) / r.width) * span;
      d = Math.max(min - grab.current.s, Math.min(max - grab.current.e, d));
      onChange(grab.current.s + d, grab.current.e + d, "start");
      return;
    }
    const t = toTime(e.clientX);
    if (drag.current === "start") onChange(Math.min(t, end - 3), end, "start");
    else onChange(start, Math.max(t, start + 3), "end");
  }
  const up = () => (drag.current = null);

  // Teclado: setas movem 0,5 s (Shift = 5 s)
  const key = (edge: "start" | "end") => (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 5 : 0.5;
    const d = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
    if (!d) return;
    e.preventDefault();
    if (edge === "start") onChange(Math.max(min, Math.min(start + d, end - 3)), end, "start");
    else onChange(start, Math.min(max, Math.max(end + d, start + 3)), "end");
  };

  return (
    <div className="trimBar" onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <div className="trimTrack" ref={bar} onPointerDown={(e) => {
        // clique fora da seleção: leva a alça mais próxima até ali
        const t = toTime(e.clientX);
        if (Math.abs(t - start) < Math.abs(t - end)) onChange(Math.min(t, end - 3), end, "start");
        else onChange(start, Math.max(t, start + 3), "end");
      }}>
        {orig && <div className="trimOrig" style={{ left: pct(orig.start), width: `calc(${pct(orig.end)} - ${pct(orig.start)})` }} title="Corte original da IA" />}
        <div className="trimSel" style={{ left: pct(start), width: `calc(${pct(end)} - ${pct(start)})` }} onPointerDown={(e) => down(e, "range")} title="Arraste para mover o corte inteiro" />
        {playhead != null && playhead >= min && playhead <= max && <div className="trimHead" style={{ left: pct(playhead) }} />}
        <button
          className="trimHandle"
          style={{ left: pct(start) }}
          onPointerDown={(e) => down(e, "start")}
          onKeyDown={key("start")}
          aria-label={`Início do corte: ${fmt(start)}`}
          role="slider"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={start}
        />
        <button
          className="trimHandle end"
          style={{ left: pct(end) }}
          onPointerDown={(e) => down(e, "end")}
          onKeyDown={key("end")}
          aria-label={`Fim do corte: ${fmt(end)}`}
          role="slider"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={end}
        />
      </div>
      <div className="trimLabels">
        <span>{fmt(min)}</span>
        <b>
          {fmt(start)} → {fmt(end)} · {Math.round(end - start)} s
        </b>
        <span>{fmt(max)}</span>
      </div>
    </div>
  );
}
