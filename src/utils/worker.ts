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

const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// Leave cores free for the camera decoder and UI thread; saturating every core
// with WASM inference is what causes the main thread to freeze on phones.
if (IS_MOBILE && env.backends?.onnx?.wasm) {
  const cores = navigator.hardwareConcurrency ?? 4;
  env.backends.onnx.wasm.numThreads = Math.max(1, Math.min(2, cores - 2));
}

// Progressive input sizes: shrinking the model input speeds up inference roughly
// quadratically; the pipeline rescales boxes back to the original size automatically.
const INPUT_SIZE_STEPS = [320, 224, 192] as const;
let inputSizeStep = 0;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyInputSize(p: any, shortestEdge: number) {
  try {
    const fe = p.processor?.feature_extractor ?? p.processor?.image_processor;
    if (fe?.size) {
      fe.size = { shortest_edge: shortestEdge, longest_edge: shortestEdge * 2 };
    }
  } catch {
    // Best-effort tuning only.
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
      if (IS_MOBILE) {
        inputSizeStep = 0;
        applyInputSize(p, INPUT_SIZE_STEPS[inputSizeStep]);
      }
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

  // Phone CPUs need the smallest input that still detects reliably.
  inputSizeStep = IS_MOBILE ? 1 : 0;
  applyInputSize(p, INPUT_SIZE_STEPS[inputSizeStep]);

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
  } else if (type === 'RETUNE') {
    if (detectorPipeline && inputSizeStep < INPUT_SIZE_STEPS.length - 1) {
      inputSizeStep++;
      applyInputSize(detectorPipeline, INPUT_SIZE_STEPS[inputSizeStep]);
    }
    self.postMessage({
      type: 'RETUNED',
      payload: {
        shortestEdge: INPUT_SIZE_STEPS[inputSizeStep],
        atFloor: inputSizeStep >= INPUT_SIZE_STEPS.length - 1,
      },
    });
  }
};
