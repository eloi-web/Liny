import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;

let detectorPipeline: any = null;

const CANDIDATE_LABELS = [
  'person', 'computer', 'laptop', 'phone', 'charger', 'bicycle', 'flower', 
  'door', 'window', 'desk', 'chair', 'bed', 'tv', 'book', 'bottle', 
  'cup', 'backpack', 'shoes', 'plant', 'wall', 'car', 'keyboard', 'mouse',
  'poster', 'painting', 'frame', 'watch', 'headphones', 'glasses', 'mug', 
  'bag', 'cabinet', 'shelf', 'pillow', 'blanket', 'clock', 'mirror', 
  'light', 'lamp', 'speaker', 'rug', 'box', 'pen', 'pencil', 'notebook'
];

export async function loadDetectorModel() {
  if (!detectorPipeline) {
    detectorPipeline = await pipeline('zero-shot-object-detection', 'Xenova/owlvit-base-patch32', {
      device: 'wasm'
    });
  }
  return detectorPipeline;
}

export async function detectObjects(imageSource: any, threshold: number = 0.1) {
  if (!detectorPipeline) return [];
  
  // zero-shot object detection accepts image and candidate_labels
  const result = await detectorPipeline(imageSource.toDataURL(), CANDIDATE_LABELS, { threshold });
  
  // result is array of { score, label, box: { xmin, ymin, xmax, ymax } }
  return result.map((item: any) => ({
    class: item.label,
    score: item.score,
    bbox: [item.box.xmin, item.box.ymin, item.box.xmax - item.box.xmin, item.box.ymax - item.box.ymin]
  }));
}

