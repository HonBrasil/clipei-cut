// Detecta onde está a webcam no vídeo procurando um rosto que aparece
// sempre no mesmo lugar. Roda 100% local (MediaPipe), sem custo de IA.
import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";
import { readFile } from "@tauri-apps/plugin-fs";
import type { Rect, VideoInfo } from "./types";

let detectorPromise: Promise<FaceDetector> | null = null;

function getDetector(): Promise<FaceDetector> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const files = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
      return FaceDetector.createFromOptions(files, {
        baseOptions: { modelAssetPath: "/mediapipe/blaze_face_short_range.tflite", delegate: "CPU" },
        runningMode: "IMAGE",
        minDetectionConfidence: 0.5,
      });
    })();
  }
  return detectorPromise;
}

export type Detection = {
  webcam: Rect | null; // em pixels do vídeo original
  confidence: number; // 0..1 (em quantos quadros o rosto apareceu no mesmo lugar)
  faceCam: boolean; // rosto grande ocupando a tela (podcast/react sem gameplay)
  frameUrl: string; // imagem de referência para mostrar na tela
  speakers: [Rect, Rect] | null; // duas pessoas fixas na imagem (podcast/entrevista)
};

export async function detectWebcam(video: VideoInfo, framePaths: string[]): Promise<Detection> {
  const detector = await getDetector();
  type Face = { cx: number; cy: number; w: number; h: number; score: number };
  const perFrame: Face[][] = [];
  let frameUrl = "";
  let fw = 640;
  let fh = 360;

  for (let i = 0; i < framePaths.length; i++) {
    const bytes = await readFile(framePaths[i]);
    const blob = new Blob([bytes], { type: "image/jpeg" });
    if (i === Math.floor(framePaths.length / 2) || !frameUrl) frameUrl = toDataUrl(bytes);
    const bmp = await createImageBitmap(blob);
    fw = bmp.width;
    fh = bmp.height;
    const res = detector.detect(bmp);
    bmp.close();
    perFrame.push(
      res.detections
        .filter((d) => d.boundingBox)
        .map((d) => {
          const b = d.boundingBox!;
          return {
            cx: b.originX + b.width / 2,
            cy: b.originY + b.height / 2,
            w: b.width,
            h: b.height,
            score: d.categories?.[0]?.score ?? 0.5,
          };
        }),
    );
  }

  // Agrupa rostos que aparecem perto do mesmo ponto em vários quadros
  const all = perFrame.flat();
  let best: Face[] = [];
  for (const f of all) {
    const near = all.filter((g) => Math.hypot(g.cx - f.cx, g.cy - f.cy) < Math.max(f.w, 24) * 0.8);
    if (near.length > best.length) best = near;
  }
  const framesWithFace = new Set(perFrame.map((faces, i) => (faces.some((f) => best.includes(f)) ? i : -1)).filter((i) => i >= 0)).size;
  const confidence = framePaths.length ? framesWithFace / framePaths.length : 0;

  const med = (arr: number[]) => arr.slice().sort((a, b) => a - b)[Math.floor(arr.length / 2)];
  const sx = video.width / fw;
  const sy = video.height / fh;

  // Podcast: um segundo rosto fixo, longe do primeiro, em boa parte dos quadros
  let speakers: [Rect, Rect] | null = null;
  if (best.length) {
    const c1 = { cx: med(best.map((f) => f.cx)), cy: med(best.map((f) => f.cy)), w: med(best.map((f) => f.w)) };
    const rest = all.filter((f) => Math.hypot(f.cx - c1.cx, f.cy - c1.cy) > Math.max(c1.w, f.w) * 1.6);
    let second: Face[] = [];
    for (const f of rest) {
      const near = rest.filter((g) => Math.hypot(g.cx - f.cx, g.cy - f.cy) < Math.max(f.w, 24) * 0.8);
      if (near.length > second.length) second = near;
    }
    const frames2 = new Set(perFrame.map((faces, i) => (faces.some((f) => second.includes(f)) ? i : -1)).filter((i) => i >= 0)).size;
    if (second.length && framePaths.length && frames2 / framePaths.length >= 0.35) {
      const c2 = { cx: med(second.map((f) => f.cx)), cy: med(second.map((f) => f.cy)), w: med(second.map((f) => f.w)) };
      const area = (c: { cx: number; cy: number; w: number }): Rect => {
        let w = Math.min(fw, c.w * 3.4);
        let h = w / 1.125;
        if (h > fh) {
          h = fh;
          w = h * 1.125;
        }
        const x = Math.max(0, Math.min(fw - w, c.cx - w / 2));
        const y = Math.max(0, Math.min(fh - h, c.cy - h * 0.42));
        return { x: Math.round(x * sx), y: Math.round(y * sy), w: Math.round(w * sx), h: Math.round(h * sy) };
      };
      const pair = [c1, c2].sort((a, b) => a.cx - b.cx || a.cy - b.cy);
      speakers = [area(pair[0]), area(pair[1])];
    }
  }

  if (best.length === 0 || confidence < 0.35) {
    return { webcam: null, confidence: 0, faceCam: false, frameUrl, speakers: null };
  }

  const face = { cx: med(best.map((f) => f.cx)), cy: med(best.map((f) => f.cy)), w: med(best.map((f) => f.w)), h: med(best.map((f) => f.h)) };

  // Rosto grande = câmera é o vídeo inteiro (podcast, react em tela cheia)
  const faceCam = face.w / fw > 0.18;

  // A webcam sobreposta costuma ter o rosto ocupando ~35% da largura dela (proporção 4:3)
  let w = face.w * 2.9;
  let h = w * 0.75;
  let x = face.cx - w / 2;
  let y = face.cy - h * 0.45;
  x = Math.max(0, Math.min(fw - w, x));
  y = Math.max(0, Math.min(fh - h, y));
  w = Math.min(w, fw);
  h = Math.min(h, fh);

  return {
    webcam: faceCam ? null : { x: Math.round(x * sx), y: Math.round(y * sy), w: Math.round(w * sx), h: Math.round(h * sy) },
    confidence,
    faceCam,
    frameUrl,
    speakers,
  };
}

/** Converte o JPEG em data URL para poder salvar junto com o projeto. */
function toDataUrl(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/jpeg;base64,${btoa(bin)}`;
}
