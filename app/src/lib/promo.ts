// Materiais de divulgação do criador parceiro: artes para o OBS/redes e vídeo em loop.
// Tudo é desenhado no próprio app (canvas) com o código do criador e o QR code do site.
import QRCode from "qrcode";

export const DOWNLOAD_URL = "https://clipeistudiodigital.com.br/clipei-cut/";
export const qrUrl = (code: string) => `${DOWNLOAD_URL}?cupom=${encodeURIComponent(code)}`;

export type PromoKind = "card" | "faixa" | "post";
export const PROMO_INFO: Record<PromoKind, { label: string; desc: string; w: number; h: number; file: string }> = {
  card: { label: "Card com QR code", desc: "Fundo transparente, para um canto da live (OBS)", w: 600, h: 840, file: "card-qr" },
  faixa: { label: "Faixa inferior", desc: "Fundo transparente, para a parte de baixo da tela (OBS)", w: 1920, h: 220, file: "faixa" },
  post: { label: "Post quadrado", desc: "Para Instagram, Discord e WhatsApp", w: 1080, h: 1080, file: "post" },
};

const RED = "#E3121F";
const PURPLE = "#8B5CF6";
const FONT = '"clipei-montserrat", "clipei-poppins", "Montserrat", sans-serif';

let logoImg: Promise<HTMLImageElement> | null = null;
function logo(): Promise<HTMLImageElement> {
  logoImg ??= new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = "/logo-clipei-cut.png";
  });
  return logoImg;
}

async function qrCanvas(code: string, size: number): Promise<HTMLCanvasElement> {
  const c = document.createElement("canvas");
  await QRCode.toCanvas(c, qrUrl(code), { width: size, margin: 1, errorCorrectionLevel: "M", color: { dark: "#0B0B0F", light: "#FFFFFF" } });
  return c;
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Texto que encolhe para caber na largura. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight = 900): number {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px ${FONT}`;
    if (ctx.measureText(text).width <= maxW) break;
    s -= 2;
  } while (s > 12);
  return s;
}

function pill(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, size: number, maxW: number) {
  const s = fit(ctx, text, maxW - size * 1.2, size);
  const w = ctx.measureText(text).width + s * 1.2;
  const h = s * 1.45;
  ctx.save();
  ctx.shadowColor = "rgba(227,18,31,0.55)";
  ctx.shadowBlur = s * 0.6;
  const g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
  g.addColorStop(0, RED);
  g.addColorStop(1, "#FF4D5A");
  ctx.fillStyle = g;
  rounded(ctx, cx - w / 2, cy - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, cy + s * 0.04);
}

/** Desenha uma das artes. Devolve o canvas pronto. */
export async function drawPromo(kind: PromoKind, code: string, discountPct: number): Promise<HTMLCanvasElement> {
  const { w, h } = PROMO_INFO[kind];
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  await document.fonts.ready.catch(() => {});
  const lg = await logo().catch(() => null);
  const offer = discountPct > 0 ? `${discountPct}% OFF no 1º mês + horas de bônus` : "Ganhe horas de bônus ao assinar";

  if (kind === "card") {
    // Cartão escuro com borda vermelha
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 30;
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "rgba(27,20,36,0.97)");
    bg.addColorStop(1, "rgba(12,12,16,0.97)");
    ctx.fillStyle = bg;
    rounded(ctx, 20, 20, w - 40, h - 40, 36);
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 4;
    ctx.strokeStyle = RED;
    rounded(ctx, 20, 20, w - 40, h - 40, 36);
    ctx.stroke();

    if (lg) {
      const lw = 300;
      const lh = (lg.height / lg.width) * lw;
      ctx.drawImage(lg, (w - lw) / 2, 52, lw, lh);
    }
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    fit(ctx, "CORTES DA LIVE COM IA", w - 110, 36);
    ctx.fillText("CORTES DA LIVE COM IA", w / 2, 190);

    const q = await qrCanvas(code, 300);
    ctx.fillStyle = "#fff";
    rounded(ctx, (w - 330) / 2, 225, 330, 330, 22);
    ctx.fill();
    ctx.drawImage(q, (w - 300) / 2, 240, 300, 300);

    ctx.fillStyle = "#C9C9D6";
    ctx.font = `800 26px ${FONT}`;
    ctx.fillText("USE O CUPOM", w / 2, 608);
    pill(ctx, code, w / 2, 672, 56, w - 90);
    ctx.fillStyle = "#4ADE80";
    fit(ctx, offer, w - 90, 24, 800);
    ctx.fillText(offer, w / 2, 748);
    ctx.fillStyle = "#8A8A99";
    ctx.font = `700 19px ${FONT}`;
    ctx.fillText("clipeistudiodigital.com.br/clipei-cut", w / 2, 786);
  }

  if (kind === "faixa") {
    const bh = 170;
    const y = h - bh - 18;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 24;
    const bg = ctx.createLinearGradient(0, 0, w, 0);
    bg.addColorStop(0, "rgba(14,14,19,0.95)");
    bg.addColorStop(0.65, "rgba(27,20,36,0.95)");
    bg.addColorStop(1, "rgba(60,12,20,0.95)");
    ctx.fillStyle = bg;
    rounded(ctx, 30, y, w - 60, bh, 28);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = RED;
    rounded(ctx, 30, y, 14, bh, 7);
    ctx.fill();

    let x = 80;
    if (lg) {
      const lh = 96;
      const lw = (lg.width / lg.height) * lh;
      ctx.drawImage(lg, x, y + (bh - lh) / 2, lw, lh);
      x += lw + 40;
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#fff";
    ctx.font = `900 46px ${FONT}`;
    ctx.fillText("Clipes da live com IA, em minutos", x, y + 72);
    ctx.fillStyle = "#4ADE80";
    ctx.font = `800 30px ${FONT}`;
    ctx.fillText(offer, x, y + 122);

    const q = await qrCanvas(code, 132);
    const qx = w - 60 - 150;
    ctx.fillStyle = "#fff";
    rounded(ctx, qx, y + 12, 146, 146, 14);
    ctx.fill();
    ctx.drawImage(q, qx + 7, y + 19, 132, 132);
    ctx.fillStyle = "#C9C9D6";
    ctx.textAlign = "center";
    ctx.font = `800 22px ${FONT}`;
    ctx.fillText("CUPOM", qx - 190, y + 58);
    pill(ctx, code, qx - 190, y + 108, 44, 330);
  }

  if (kind === "post") {
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, "#1B1424");
    bg.addColorStop(0.55, "#0E0E13");
    bg.addColorStop(1, "#3A0A12");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    // brilhos
    const glow = (x: number, y: number, r: number, col: string) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, col);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    };
    glow(900, 160, 420, "rgba(227,18,31,0.28)");
    glow(120, 980, 460, "rgba(139,92,246,0.25)");

    if (lg) {
      const lw = 420;
      const lh = (lg.height / lg.width) * lw;
      ctx.drawImage(lg, (w - lw) / 2, 70, lw, lh);
    }
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    fit(ctx, "SUA LIVE VIRA CLIPES", w - 140, 76);
    ctx.fillText("SUA LIVE VIRA CLIPES", w / 2, 300);
    ctx.fillStyle = PURPLE;
    fit(ctx, "AUTOMATICAMENTE COM IA", w - 140, 56);
    ctx.fillText("AUTOMATICAMENTE COM IA", w / 2, 370);

    const q = await qrCanvas(code, 340);
    ctx.fillStyle = "#fff";
    rounded(ctx, (w - 380) / 2, 420, 380, 380, 28);
    ctx.fill();
    ctx.drawImage(q, (w - 340) / 2, 440, 340, 340);

    ctx.fillStyle = "#C9C9D6";
    ctx.font = `800 32px ${FONT}`;
    ctx.fillText("USE O CUPOM", w / 2, 862);
    pill(ctx, code, w / 2, 935, 70, w - 200);
    ctx.fillStyle = "#4ADE80";
    fit(ctx, offer, w - 140, 32, 800);
    ctx.fillText(offer, w / 2, 1030);
  }
  return c;
}

export async function promoPng(kind: PromoKind, code: string, discountPct: number): Promise<Uint8Array> {
  const c = await drawPromo(kind, code, discountPct);
  const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Falha ao gerar a imagem"))), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

/** Argumentos do FFmpeg para o vídeo em loop (10 s, fundo transparente, WebM VP9 com alfa).
 * O card entra pela direita, dá um "pulinho", fica 8 s e sai; recomeça vazio por meio segundo. */
export function loopVideoArgs(cardPng: string, out: string): string[] {
  const W = PROMO_INFO.card.w;
  const H = PROMO_INFO.card.h;
  const D = 10;
  // x: entra (0–0,7 s, com desaceleração), parado, sai (8,8–9,5 s)
  const x = `if(lt(t,0.7), ${W}*pow(1-t/0.7,3), if(lt(t,8.8), 0, ${W}*pow(min(1,(t-8.8)/0.7),3)))`;
  // leve flutuação vertical enquanto está parado
  const y = `if(between(t,0.7,8.8), 6*sin((t-0.7)*2.4), 0)`;
  return [
    "-y",
    "-f", "lavfi", "-i", `color=c=black@0.0:s=${W}x${H + 20}:r=30:d=${D},format=rgba`,
    "-loop", "1", "-t", String(D), "-i", cardPng,
    "-filter_complex", `[1:v]format=rgba[c];[0:v][c]overlay=x='${x}':y='10+${y}':format=auto,format=yuva420p[v]`,
    "-map", "[v]",
    "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "1500k", "-auto-alt-ref", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4",
    "-t", String(D),
    out,
  ];
}
