// Copia os arquivos WASM do MediaPipe e baixa o modelo de detecção de rosto
// para app/public/mediapipe, para o app funcionar 100% offline nessa etapa.
// Uso: npm run assets
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "mediapipe");
mkdirSync(out, { recursive: true });

cpSync(join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm"), join(out, "wasm"), { recursive: true });
console.log("WASM do MediaPipe copiado.");

const modelPath = join(out, "blaze_face_short_range.tflite");
if (!existsSync(modelPath)) {
  const url =
    "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar o modelo (${res.status})`);
  writeFileSync(modelPath, Buffer.from(await res.arrayBuffer()));
  console.log("Modelo de rosto baixado.");
} else {
  console.log("Modelo de rosto já existe.");
}
