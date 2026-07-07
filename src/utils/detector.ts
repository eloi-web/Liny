import type { Prediction } from './draw';

type ProgressPayload = { status?: string; file?: string; progress?: number };
export type DetectorDevice = 'webgpu' | 'wasm';

let worker: Worker | null = null;
let resolveModelLoad: ((value: DetectorDevice) => void) | null = null;
let rejectModelLoad: ((reason: Error) => void) | null = null;
let resolveDetect: ((value: Prediction[]) => void) | null = null;
let rejectDetect: ((reason: Error) => void) | null = null;
let onProgressCallback: ((progress: ProgressPayload) => void) | null = null;
let onDetectErrorCallback: ((message: string) => void) | null = null;

function ensureWorker() {
  if (worker) return;

  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

  worker.onerror = (event) => {
    const message = event.message || 'Worker failed to start';
    rejectModelLoad?.(new Error(message));
    rejectDetect?.(new Error(message));
    onDetectErrorCallback?.(message);
  };

  worker.onmessage = (event) => {
    const { type, payload } = event.data;

    if (type === 'MODEL_LOADED') {
      resolveModelLoad?.(payload?.device ?? 'wasm');
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
      rejectDetect = null;
    } else if (type === 'DETECT_ERROR') {
      onDetectErrorCallback?.(payload);
      resolveDetect?.([]);
      resolveDetect = null;
      rejectDetect = null;
    }
  };
}

export async function loadDetectorModel(onProgress?: (progress: ProgressPayload) => void) {
  ensureWorker();
  onProgressCallback = onProgress ?? null;

  return new Promise<DetectorDevice>((resolve, reject) => {
    resolveModelLoad = resolve;
    rejectModelLoad = reject;
    worker!.postMessage({ type: 'LOAD_MODEL' });
  });
}

function canvasToJpegBuffer(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to capture camera frame'));
          return;
        }
        blob.arrayBuffer().then(resolve).catch(reject);
      },
      'image/jpeg',
      0.85,
    );
  });
}

export async function detectObjects(
  imageSource: HTMLCanvasElement,
  threshold = 0.1,
  onError?: (message: string) => void,
) {
  if (!worker) return [];

  onDetectErrorCallback = onError ?? null;
  const imageBuffer = await canvasToJpegBuffer(imageSource);

  return new Promise<Prediction[]>((resolve, reject) => {
    resolveDetect = resolve;
    rejectDetect = reject;
    worker!.postMessage(
      {
        type: 'DETECT',
        payload: { imageBuffer, mimeType: 'image/jpeg', threshold },
      },
      [imageBuffer],
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
  rejectDetect = null;
  onProgressCallback = null;
  onDetectErrorCallback = null;
}
