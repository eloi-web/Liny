import { pipeline, env } from '@huggingface/transformers';

import { DETECTION_MODEL } from './modelConfig';

env.allowLocalModels = false;
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let detectorPipeline: any = null;

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
        detectorPipeline = await pipeline('object-detection', DETECTION_MODEL, {
          device: 'wasm',
          progress_callback: (progress: { status?: string; file?: string; progress?: number }) => {
            self.postMessage({ type: 'MODEL_PROGRESS', payload: progress });
          },
        });
      }
      self.postMessage({ type: 'MODEL_LOADED', payload: true });
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
