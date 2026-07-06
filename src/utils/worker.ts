import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let detectorPipeline: any = null;

async function runDetection(image: ImageBitmap, threshold: number) {
  const canvas = new OffscreenCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    image.close();
    return [];
  }

  ctx.drawImage(image, 0, 0);
  image.close();

  const result = await detectorPipeline!(canvas, { threshold });

  return result.map((item: { label: string; score: number; box: { xmin: number; ymin: number; xmax: number; ymax: number } }) => ({
    class: item.label,
    score: item.score,
    bbox: [item.box.xmin, item.box.ymin, item.box.xmax - item.box.xmin, item.box.ymax - item.box.ymin] as [number, number, number, number],
  }));
}

self.onmessage = async (event) => {
  const { type, payload } = event.data;

  if (type === 'LOAD_MODEL') {
    try {
      if (!detectorPipeline) {
        detectorPipeline = await pipeline('object-detection', 'Xenova/detr-resnet-50', {
          device: 'wasm',
          dtype: 'q8',
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

      const { image, threshold } = payload as { image: ImageBitmap; threshold: number };
      const mapped = await runDetection(image, threshold ?? 0.1);
      self.postMessage({ type: 'DETECT_RESULT', payload: mapped });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      self.postMessage({ type: 'DETECT_ERROR', payload: message });
    }
  }
};
