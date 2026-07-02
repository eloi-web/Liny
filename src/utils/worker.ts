import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;

let detectorPipeline: any = null;

self.onmessage = async (event) => {
  const { type, payload } = event.data;

  if (type === 'LOAD_MODEL') {
    try {
      if (!detectorPipeline) {
        detectorPipeline = await pipeline('object-detection', 'Xenova/detr-resnet-50', {
          device: 'wasm',
          dtype: 'q8',
          progress_callback: (progress: any) => {
            self.postMessage({ type: 'MODEL_PROGRESS', payload: progress });
          }
        });
      }
      self.postMessage({ type: 'MODEL_LOADED', payload: true });
    } catch (error: any) {
      self.postMessage({ type: 'MODEL_ERROR', payload: error.message });
    }
  } else if (type === 'DETECT') {
    try {
      if (!detectorPipeline) {
        self.postMessage({ type: 'DETECT_RESULT', payload: [] });
        return;
      }
      
      const { image } = payload;
      
      console.log('Worker running detection...');
      const result = await detectorPipeline(image, { threshold: 0.1 });
      
      const mapped = result.map((item: any) => ({
        class: item.label,
        score: item.score,
        bbox: [item.box.xmin, item.box.ymin, item.box.xmax - item.box.xmin, item.box.ymax - item.box.ymin]
      }));
      
      self.postMessage({ type: 'DETECT_RESULT', payload: mapped });
    } catch (error: any) {
      self.postMessage({ type: 'DETECT_ERROR', payload: error.message });
    }
  }
};

