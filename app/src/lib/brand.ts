// Kit da marca (planos pagos): logo, cor e chamada final ("Siga @fulano").
import type { BrandKit, CaptionModel } from "./settings";
import { layoutSize, type Layout } from "./types";

const MARGIN = 40;

/** Posição e tamanho da logo no vídeo final (em pixels). */
export function logoBox(kit: BrandKit, layout: Layout): { x: number; y: number; w: number; h: number } {
  const { w: VW, h: VH } = layoutSize(layout);
  const w = Math.round((VW * kit.logoSize) / 100);
  const h = Math.round(w / (kit.logoAspect || 1));
  const right = kit.logoPos === "tr" || kit.logoPos === "br";
  const bottom = kit.logoPos === "bl" || kit.logoPos === "br";
  return { x: right ? VW - w - MARGIN : MARGIN, y: bottom ? VH - h - MARGIN - (VH > VW ? 120 : 0) : MARGIN, w, h };
}

/** O kit vale para esta exportação? */
export function brandActive(kit: BrandKit | undefined, paid: boolean): kit is BrandKit {
  return Boolean(paid && kit && kit.on);
}

/** Modelo de legenda com a cor da marca no destaque, se a pessoa pediu. */
export function brandedModel(model: CaptionModel, kit: BrandKit | undefined, paid: boolean): CaptionModel {
  return brandActive(kit, paid) && kit.captionColor ? { ...model, highlight: kit.color } : model;
}

export type Cta = { text: string; color: string; textColor: string; seconds: number };

export function ctaOf(kit: BrandKit | undefined, paid: boolean): Cta | null {
  if (!brandActive(kit, paid) || !kit.cta.on || !kit.cta.text.trim()) return null;
  return { text: kit.cta.text.trim().slice(0, 60), color: kit.color, textColor: kit.textColor, seconds: Math.min(6, Math.max(2, kit.cta.seconds)) };
}

/** Altura (0..1) onde a chamada aparece: na parte de baixo, longe da legenda e do rosto. */
export function ctaY(captionPos: "topo" | "meio" | "baixo"): number {
  return captionPos === "baixo" ? 0.66 : 0.8;
}
