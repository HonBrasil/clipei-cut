// Suporte da Clipei Studio Digital pelo WhatsApp.
import { openUrl } from "@tauri-apps/plugin-opener";
import { getVersion } from "@tauri-apps/api/app";

export const SUPPORT_WHATSAPP = "5562998689137";

export async function openSupport(context?: string): Promise<void> {
  let version = "";
  try {
    version = await getVersion();
  } catch {
    /* sem versão */
  }
  const msg = `Olá! Preciso de ajuda com o Clipei Cut${version ? ` (versão ${version})` : ""}.${context ? `\n${context}` : ""}`;
  await openUrl(`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(msg)}`);
}
