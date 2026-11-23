import { useEffect, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { join } from "@tauri-apps/api/path";
import { Icon } from "../components/Icon";
import { brl } from "../lib/account";
import { runWithProgress, workDir } from "../lib/ffmpeg";
import { loadCaptionFonts, revealPath, saveBytes } from "../lib/native";
import { drawPromo, loopVideoArgs, promoPng, PROMO_INFO, type PromoKind } from "../lib/promo";
import { supabase } from "../lib/supabase";

type CreatorData = {
  creator: true;
  code: string;
  discountPct: number;
  referrerSeconds: number;
  referredSeconds: number;
  activeSubs: number;
  tier: "inicio" | "bronze" | "prata" | "ouro";
  tierPlan: string | null;
  nextAt: number | null;
  invited: number;
  converted: number;
  earnedSeconds: number;
  revenue: number;
};

const TIERS = [
  { id: "bronze", at: 3, icon: "🥉", name: "Bronze", plan: "Criador grátis" },
  { id: "prata", at: 10, icon: "🥈", name: "Prata", plan: "Pro grátis" },
  { id: "ouro", at: 25, icon: "🥇", name: "Ouro", plan: "Studio grátis" },
] as const;
const hrs = (s: number) => `${(s / 3600).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;

export function Creator() {
  const [d, setD] = useState<CreatorData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Partial<Record<PromoKind, string>>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string; path?: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [videoPct, setVideoPct] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    supabase.rpc("my_creator").then(({ data, error: e }) => {
      if (e) setError(e.message);
      else setD(data as CreatorData);
    });
  }, []);

  // Prévias das artes com o código do criador
  useEffect(() => {
    if (!d) return;
    let alive = true;
    (async () => {
      await loadCaptionFonts().catch(() => {});
      for (const k of Object.keys(PROMO_INFO) as PromoKind[]) {
        const c = await drawPromo(k, d.code, d.discountPct);
        if (alive) setPreviews((p) => ({ ...p, [k]: c.toDataURL("image/png") }));
      }
    })();
    return () => {
      alive = false;
    };
  }, [d]);

  async function download(kind: PromoKind) {
    if (!d) return;
    const path = await save({ defaultPath: `clipei-cut-${PROMO_INFO[kind].file}-${d.code}.png`, filters: [{ name: "Imagem PNG", extensions: ["png"] }] });
    if (!path) return;
    setBusy(kind);
    setMsg(null);
    try {
      await saveBytes(path, await promoPng(kind, d.code, d.discountPct));
      setMsg({ ok: true, text: `${PROMO_INFO[kind].label} salvo.`, path });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function makeVideo() {
    if (!d) return;
    const out = await save({ defaultPath: `clipei-cut-loop-${d.code}.webm`, filters: [{ name: "Vídeo WebM (transparente)", extensions: ["webm"] }] });
    if (!out) return;
    setBusy("video");
    setVideoPct(0);
    setMsg(null);
    try {
      const wdir = await workDir("promo");
      const card = await join(wdir, "card.png");
      await saveBytes(card, await promoPng("card", d.code, d.discountPct));
      await runWithProgress(loopVideoArgs(card, out), 10, setVideoPct, wdir);
      setMsg({ ok: true, text: "Vídeo em loop criado! No OBS: Fonte de mídia → escolha o arquivo → marque “Repetir”.", path: out });
    } catch (e) {
      setMsg({ ok: false, text: `Não consegui gerar o vídeo: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(null);
    }
  }

  const share = d
    ? `Faço os cortes das minhas lives com o Clipei Cut 🎬🔥 A IA acha os melhores momentos e já deixa com legenda. Usa meu cupom ${d.code} e ganha ${d.discountPct}% OFF no 1º mês: https://clipeistudiodigital.com.br/clipei-cut/`
    : "";
  const tierIdx = d ? TIERS.findIndex((t) => t.id === d.tier) : -1;
  const next = d && d.nextAt ? TIERS.find((t) => t.at === d.nextAt) : null;
  const prevAt = tierIdx >= 0 ? TIERS[tierIdx].at : 0;
  const progress = d && d.nextAt ? Math.min(1, (d.activeSubs - prevAt) / (d.nextAt - prevAt)) : 1;

  return (
    <>
      <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="eyebrow">
          <span className="creatorBadge">★ Criador parceiro</span>
        </span>
        <h1 className="title">
          <span className="sl">//</span> Painel do <em>criador</em>
        </h1>
      </header>

      {error && <div className="error">Não consegui carregar: {error}</div>}
      {!d && !error && <div className="muted small">Carregando…</div>}

      {d && (
        <>
          <section className="card refHero">
            <div className="refHeroText">
              <h2 className="sub" style={{ fontSize: 22 }}>
                Cada seguidor que assinar com seu cupom: você ganha <span className="refGold">{hrs(d.referrerSeconds)}</span> e ele ganha{" "}
                <span className="refGold">
                  {d.discountPct}% OFF + {hrs(d.referredSeconds)}
                </span>
                .
              </h2>
              <span className="muted small">Sem limite de indicações. Mantenha assinantes ativos para ganhar planos grátis.</span>
            </div>
            <div className="refCodeBox">
              <span className="muted small">Seu cupom</span>
              <div className="refCode">{d.code}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                <button
                  className="btn"
                  onClick={async () => {
                    await navigator.clipboard.writeText(d.code).catch(() => {});
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? "✓ Copiado" : "Copiar cupom"}
                </button>
                <button className="btn primary" style={{ background: "#1f9d55", borderColor: "#1f9d55" }} onClick={() => openUrl(`https://wa.me/?text=${encodeURIComponent(share)}`)}>
                  <Icon name="chat" size={16} /> WhatsApp
                </button>
                <button className="btn" onClick={() => navigator.clipboard.writeText(share).catch(() => {})}>
                  Copiar texto p/ descrição
                </button>
              </div>
            </div>
          </section>

          <section className="card tierCard" aria-label="Metas">
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
              <b>
                {tierIdx >= 0 ? `${TIERS[tierIdx].icon} Nível ${TIERS[tierIdx].name} · ${TIERS[tierIdx].plan}` : "Rumo à primeira meta"}
              </b>
              <span className="muted small">
                {d.activeSubs} assinante{d.activeSubs === 1 ? "" : "s"} ativo{d.activeSubs === 1 ? "" : "s"}
                {next ? ` · faltam ${d.nextAt! - d.activeSubs} para ${next.icon} ${next.name} (${next.plan})` : " · nível máximo! 🎉"}
              </span>
            </div>
            <div className="bar" style={{ height: 10 }}>
              <div style={{ width: `${progress * 100}%`, background: "linear-gradient(90deg, #e3121f, #ffd27a)" }} />
            </div>
            <div className="tierSteps">
              {TIERS.map((t, i) => (
                <div key={t.id} className={`tierStep ${i <= tierIdx ? "on" : ""}`}>
                  <span className="tierIcon">{t.icon}</span>
                  <b>{t.name}</b>
                  <span>
                    {t.at} assinantes · {t.plan}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <div className="kpis">
            <div className="stat">
              <span className="muted small">Cadastros com seu cupom</span>
              <span className="big">{d.invited}</span>
            </div>
            <div className="stat">
              <span className="muted small">Assinaram</span>
              <span className="big">{d.converted}</span>
            </div>
            <div className="stat">
              <span className="muted small">Horas que você ganhou</span>
              <span className="big">{hrs(d.earnedSeconds)}</span>
            </div>
            <div className="stat">
              <span className="muted small">Vendas pelo seu cupom</span>
              <span className="big">{brl(Number(d.revenue))}</span>
            </div>
          </div>

          <section className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }} aria-labelledby="c-mat">
            <div>
              <h2 id="c-mat" className="sub" style={{ fontSize: 18 }}>
                Materiais de divulgação
              </h2>
              <span className="muted small">Prontos com o seu cupom e o QR code que leva para o download do app. Use na live, nas redes e no Discord.</span>
            </div>
            {msg && (
              <div className={msg.ok ? "okMsg" : "error"} style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                <span>{msg.text}</span>
                {msg.path && (
                  <button className="btn sm" onClick={() => revealPath(msg.path!)}>
                    Abrir pasta
                  </button>
                )}
              </div>
            )}
            <div className="promoGrid">
              <div className="promoItem video">
                <div className="promoPreview checker">
                  {previews.card && <img src={previews.card} alt="" className="loopAnim" />}
                </div>
                <b>Vídeo em loop para o OBS</b>
                <span className="muted" style={{ fontSize: 12 }}>
                  10 s, fundo transparente (WebM). O card entra, fica na tela e sai.
                </span>
                <button className="btn primary" disabled={!!busy} onClick={makeVideo}>
                  {busy === "video" ? `Gerando… ${Math.round(videoPct * 100)}%` : "Gerar vídeo"}
                </button>
              </div>
              {(Object.keys(PROMO_INFO) as PromoKind[]).map((k) => (
                <div key={k} className={`promoItem ${k}`}>
                  <div className={`promoPreview ${k === "post" ? "" : "checker"}`}>{previews[k] ? <img src={previews[k]} alt={PROMO_INFO[k].label} /> : <span className="muted small">Gerando…</span>}</div>
                  <b>{PROMO_INFO[k].label}</b>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {PROMO_INFO[k].desc} · {PROMO_INFO[k].w}×{PROMO_INFO[k].h}
                  </span>
                  <button className="btn" disabled={!!busy || !previews[k]} onClick={() => download(k)}>
                    {busy === k ? "Salvando…" : "Baixar PNG"}
                  </button>
                </div>
              ))}
            </div>
            <div className="note small" style={{ display: "block" }}>
              <b>Como colocar no OBS:</b> em Fontes, clique em <b>+</b> → <b>Imagem</b> (para o PNG) ou <b>Fonte de mídia</b> (para o vídeo, marque “Repetir”). Arraste para o
              canto da tela. O fundo já é transparente.
            </div>
          </section>
        </>
      )}
    </>
  );
}
