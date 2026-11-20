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

  if (best.length === 0 || confidence < 0.35) {
    return { webcam: null, confidence: 0, faceCam: false, frameUrl };
  }

  const med = (arr: number[]) => arr.slice().sort((a, b) => a - b)[Math.floor(arr.length / 2)];
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

  const sx = video.width / fw;
  const sy = video.height / fh;
  return {
    webcam: faceCam ? null : { x: Math.round(x * sx), y: Math.round(y * sy), w: Math.round(w * sx), h: Math.round(h * sy) },
    confidence,
    faceCam,
    frameUrl,
  };
}

/** Converte o JPEG em data URL para poder salvar junto com o projeto. */
function toDataUrl(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/jpeg;base64,${btoa(bin)}`;
}
