import { pipeline, env } from '@huggingface/transformers';

import { DETECTION_MODEL } from './modelConfig';

env.allowLocalModels = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let detectorPipeline: any = null;
let activeDevice: 'webgpu' | 'wasm' = 'wasm';

type ProgressCallback = (progress: { status?: string; file?: string; progress?: number }) => void;

async function hasWebGPU(): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gpu = (navigator as any).gpu;
  if (!gpu) return false;
  try {
    return !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

async function loadPipeline(progress_callback: ProgressCallback) {
  if (await hasWebGPU()) {
    try {
      const p = await pipeline('object-detection', DETECTION_MODEL, {
        device: 'webgpu',
        dtype: 'fp32',
        progress_callback,
      });
      activeDevice = 'webgpu';
      return p;
    } catch {
      // WebGPU init can fail on partial implementations; fall back to WASM.
    }
  }

  const p = await pipeline('object-detection', DETECTION_MODEL, {
    device: 'wasm',
    dtype: 'q8',
    progress_callback,
  });
  activeDevice = 'wasm';

  // On slow CPUs, halving the input resolution gives a ~4x WASM speedup.
  // The pipeline rescales boxes back to the original image size automatically.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proc = (p as any).processor;
    const fe = proc?.feature_extractor ?? proc?.image_processor;
    if (fe?.size) {
      fe.size = { shortest_edge: 320, longest_edge: 640 };
    }
  } catch {
    // Best-effort tuning only.
  }

  return p;
}

// First inference compiles WASM kernels / GPU shaders and is much slower than
// subsequent ones; run it on a dummy frame so the camera path is fast.
async function warmup() {
  try {
    if (typeof OffscreenCanvas === 'undefined') return;
    const c = new OffscreenCanvas(64, 64);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 64, 64);
    const blob = await c.convertToBlob({ type: 'image/jpeg' });
    const url = URL.createObjectURL(blob);
    try {
      await detectorPipeline(url, { threshold: 0.9 });
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    // Warmup is best-effort.
  }
}

async function runDetection(imageUrl: string, threshold: number) {
  const result = await detectorPipeline!(imageUrl, { threshold });

  return result.map(
    (item: {
      label: string;
      score: number;
      box: { xmin: number; ymin: number; xmax: number; ymax: number };
    }) => ({
      class: item.label,
      score: item.score,
      bbox: [
        item.box.xmin,
        item.box.ymin,
        item.box.xmax - item.box.xmin,
        item.box.ymax - item.box.ymin,
      ] as [number, number, number, number],
    }),
  );
}

self.onmessage = async (event) => {
  const { type, payload } = event.data;

  if (type === 'LOAD_MODEL') {
    try {
      if (!detectorPipeline) {
        detectorPipeline = await loadPipeline((progress) => {
          self.postMessage({ type: 'MODEL_PROGRESS', payload: progress });
        });
        await warmup();
      }
      self.postMessage({ type: 'MODEL_LOADED', payload: { device: activeDevice } });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      self.postMessage({ type: 'MODEL_ERROR', payload: message });
    }
  } else if (type === 'DETECT') {
    try {
      if (!detectorPipeline) {
        self.postMessage({ type: 'DETECT_RESULT', payload: [] });
        return;
      }

      const { imageBuffer, mimeType, threshold } = payload as {
        imageBuffer: ArrayBuffer;
        mimeType: string;
        threshold: number;
      };

      const blob = new Blob([imageBuffer], { type: mimeType });
      const url = URL.createObjectURL(blob);
      try {
        const mapped = await runDetection(url, threshold ?? 0.1);
        self.postMessage({ type: 'DETECT_RESULT', payload: mapped });
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      self.postMessage({ type: 'DETECT_ERROR', payload: message });
    }
  }
};
