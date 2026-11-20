import { useEffect, useRef, useState } from "react";
import type { Clip, Word } from "../lib/types";
import { fmtTime } from "../lib/format";

/**
 * Lista as palavras do clipe para corrigir a legenda.
 * Clique numa palavra para ouvir o trecho e editar. Apague o texto para remover a palavra da legenda.
 */
export function CaptionEditor(props: {
  clip: Clip;
  words: Word[]; // transcrição inteira (tempos do vídeo original)
  onEdit: (index: number, text: string) => void;
  onSeek: (t: number) => void;
  onClose: () => void;
}) {
  const { clip, words, onEdit, onSeek, onClose } = props;
  const [editing, setEditing] = useState<number | null>(null);
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const items = words.map((w, i) => ({ w, i })).filter(({ w }) => w.end > clip.start && w.start < clip.end);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [editing]);

  function open(i: number) {
    setEditing(i);
    setValue(words[i].word);
    onSeek(Math.max(clip.start, words[i].start - 0.3));
  }
  function save() {
    if (editing == null) return;
    const v = value.replace(/\s+/g, " ").trim();
    if (v !== words[editing].word) onEdit(editing, v);
    setEditing(null);
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <b>Corrigir legenda</b>
        <button className="linkBtn" onClick={onClose}>
          Fechar
        </button>
      </div>
      <span className="muted small">
        Clique numa palavra para ouvir e corrigir. Enter salva, Esc cancela. Deixe vazio para tirar a palavra da legenda.
      </span>
      <div className="wordFlow" aria-label="Palavras do clipe">
        {items.map(({ w, i }) =>
          editing === i ? (
            <input
              key={i}
              ref={input}
              className="wordInput"
              value={value}
              aria-label={`Corrigir palavra em ${fmtTime(w.start)}`}
              style={{ width: `${Math.max(3, value.length + 1)}ch` }}
              onChange={(e) => setValue(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") setEditing(null);
              }}
            />
          ) : (
            <button key={i} className={`word ${w.word ? "" : "removed"}`} onClick={() => open(i)} title={fmtTime(w.start)}>
              {w.word || "∅"}
            </button>
          ),
        )}
      </div>
      <span className="muted" style={{ fontSize: 12 }}>
        As correções valem para todos os clipes que usam esse trecho e ficam salvas no projeto.
      </span>
    </div>
  );
}
