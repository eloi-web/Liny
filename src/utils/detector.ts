import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;

let detectorPipeline: any = null;

export async function loadDetectorModel() {
  if (!detectorPipeline) {
    detectorPipeline = await pipeline('object-detection', 'Xenova/detr-resnet-50', {
      device: 'wasm',
      dtype: 'q8'
    });
  }
  return detectorPipeline;
}

export async function detectObjects(imageSource: any, threshold: number = 0.1) {
  if (!detectorPipeline) return [];
  
  const result = await detectorPipeline(imageSource.toDataURL(), { threshold });
  
  return result.map((item: any) => ({
    class: item.label,
    score: item.score,
    bbox: [item.box.xmin, item.box.ymin, item.box.xmax - item.box.xmin, item.box.ymax - item.box.ymin]
  }));
}

