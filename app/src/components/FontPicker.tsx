import { useEffect, useState } from "react";
import { FONT_CATS, FONTS, type FontCat, type FontId } from "../lib/settings";
import { loadCaptionFonts } from "../lib/native";

/** Escolha de fonte por categoria, com cada nome escrito na própria fonte. */
export function FontPicker({ value, onChange }: { value: FontId; onChange: (f: FontId) => void }) {
  const [cat, setCat] = useState<FontCat>(FONTS[value]?.cat ?? "populares");
  useEffect(() => {
    loadCaptionFonts();
  }, []);
  const list = (Object.keys(FONTS) as FontId[]).filter((f) => FONTS[f].cat === cat);

  return (
    <div className="fontPicker">
      <div className="seg sm fontCats" role="tablist" aria-label="Categorias de fonte">
        {FONT_CATS.map((c) => (
          <button key={c.id} role="tab" aria-selected={cat === c.id} className={cat === c.id ? "on" : ""} onClick={() => setCat(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="fontGrid" role="radiogroup" aria-label="Fonte">
        {list.map((f) => (
          <button key={f} role="radio" aria-checked={value === f} className={`fontOpt ${value === f ? "on" : ""}`} onClick={() => onChange(f)} title={FONTS[f].label}>
            <span className="fontSample" style={{ fontFamily: `clipei-${f}, sans-serif`, fontSize: "18px" }}>
              CLIPEI
            </span>
            <span className="fontName">{FONTS[f].label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
