import type { Prediction } from './draw';

type ProgressPayload = { status?: string; file?: string; progress?: number };

let worker: Worker | null = null;
let resolveModelLoad: ((value: boolean) => void) | null = null;
let rejectModelLoad: ((reason: Error) => void) | null = null;
let resolveDetect: ((value: Prediction[]) => void) | null = null;
let onProgressCallback: ((progress: ProgressPayload) => void) | null = null;

function ensureWorker() {
  if (worker) return;

  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

  worker.onmessage = (event) => {
    const { type, payload } = event.data;

    if (type === 'MODEL_LOADED') {
      resolveModelLoad?.(true);
      resolveModelLoad = null;
      rejectModelLoad = null;
    } else if (type === 'MODEL_ERROR') {
      rejectModelLoad?.(new Error(payload));
      resolveModelLoad = null;
      rejectModelLoad = null;
    } else if (type === 'MODEL_PROGRESS') {
      onProgressCallback?.(payload);
    } else if (type === 'DETECT_RESULT') {
      resolveDetect?.(payload);
      resolveDetect = null;
    } else if (type === 'DETECT_ERROR') {
      if (import.meta.env.DEV) {
        console.error('Detection error:', payload);
      }
      resolveDetect?.([]);
      resolveDetect = null;
    }
  };
}

export async function loadDetectorModel(onProgress?: (progress: ProgressPayload) => void) {
  ensureWorker();
  onProgressCallback = onProgress ?? null;

  return new Promise<boolean>((resolve, reject) => {
    resolveModelLoad = resolve;
    rejectModelLoad = reject;
    worker!.postMessage({ type: 'LOAD_MODEL' });
  });
}

export async function detectObjects(imageSource: HTMLCanvasElement, threshold = 0.1) {
  if (!worker) return [];

  const bitmap = await createImageBitmap(imageSource);

  return new Promise<Prediction[]>((resolve) => {
    resolveDetect = resolve;
    worker!.postMessage(
      {
        type: 'DETECT',
        payload: { image: bitmap, threshold },
      },
      [bitmap],
    );
  });
}

export function terminateDetectorWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  resolveModelLoad = null;
  rejectModelLoad = null;
  resolveDetect = null;
  onProgressCallback = null;
}
