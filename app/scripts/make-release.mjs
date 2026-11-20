// Prepara os arquivos do release: o instalador (sem espaços no nome) e o
// latest.json que o app consulta para saber se há atualização.
// Uso: node scripts/make-release.mjs <versao> <owner/repo> <tag> "<notas>"
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [version, repo, tag, notesRaw = ""] = process.argv.slice(2);
if (!version || !repo || !tag) throw new Error("uso: make-release.mjs <versao> <owner/repo> <tag> [notas]");

const nsis = join("src-tauri", "target", "release", "bundle", "nsis");
const exe = readdirSync(nsis).find((f) => f.endsWith("-setup.exe"));
if (!exe) throw new Error("Instalador não encontrado em " + nsis);

const out = "release";
mkdirSync(out, { recursive: true });
const name = `ClipeiCut_${version}_x64-setup.exe`;
copyFileSync(join(nsis, exe), join(out, name));

const sigPath = join(nsis, `${exe}.sig`);
if (existsSync(sigPath)) {
  const notes = notesRaw
    .split("\n")
    .filter((l) => !/^(Co-Authored-By|Claude-Session):/i.test(l.trim()))
    .join("\n")
    .trim();
  const latest = {
    version,
    notes: notes || "Melhorias e correções.",
    pub_date: new Date().toISOString(),
    platforms: {
      "windows-x86_64": {
        signature: readFileSync(sigPath, "utf8").trim(),
        url: `https://github.com/${repo}/releases/download/${tag}/${name}`,
      },
    },
  };
  writeFileSync(join(out, "latest.json"), JSON.stringify(latest, null, 2));
  console.log("latest.json criado para a versão", version);
} else {
  console.log("Sem assinatura (.sig): o release sai sem atualização automática.");
}
