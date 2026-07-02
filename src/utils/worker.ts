import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;

let detectorPipeline: any = null;

self.onmessage = async (event) => {
  const { type, payload } = event.data;

  if (type === 'LOAD_MODEL') {
    try {
      if (!detectorPipeline) {
        detectorPipeline = await pipeline('image-segmentation', 'Xenova/segformer-b0-finetuned-ade-512-512', {
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
      
      console.log('Worker running segmentation...');
      const result = await detectorPipeline(image);
      
      // result is array of { label, score, mask: RawImage }
      const mapped = result.map((item: any) => {
        let maxVal = 0;
        for (let i = 0; i < Math.min(1000, item.mask.data.length); i++) {
          if (item.mask.data[i] > maxVal) maxVal = item.mask.data[i];
        }
        console.log('Mask width:', item.mask.width, 'height:', item.mask.height, 'max (sample):', maxVal);
        return {
          class: item.label,
          score: item.score || 1.0,
          mask: {
            width: item.mask.width,
            height: item.mask.height,
            data: item.mask.data
          }
        };
      });
      
      self.postMessage({ type: 'DETECT_RESULT', payload: mapped });
    } catch (error: any) {
      self.postMessage({ type: 'DETECT_ERROR', payload: error.message });
    }
  }
};

