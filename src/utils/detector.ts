let worker: Worker | null = null;
let resolveModelLoad: ((value: any) => void) | null = null;
let rejectModelLoad: ((reason: any) => void) | null = null;
let resolveDetect: ((value: any) => void) | null = null;

let onProgressCallback: ((progress: any) => void) | null = null;

export async function loadDetectorModel(onProgress?: (progress: any) => void) {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    
    worker.onmessage = (event) => {
      const { type, payload } = event.data;
      
      if (type === 'MODEL_LOADED') {
        if (resolveModelLoad) resolveModelLoad(true);
      } else if (type === 'MODEL_ERROR') {
        if (rejectModelLoad) rejectModelLoad(new Error(payload));
      } else if (type === 'MODEL_PROGRESS') {
        if (onProgressCallback) onProgressCallback(payload);
      } else if (type === 'DETECT_RESULT') {
        if (resolveDetect) {
          resolveDetect(payload);
          resolveDetect = null;
        }
      } else if (type === 'DETECT_ERROR') {
        if (resolveDetect) {
          console.error("Detection error:", payload);
          resolveDetect([]);
          resolveDetect = null;
        }
      }
    };
  }

  onProgressCallback = onProgress || null;

  return new Promise((resolve, reject) => {
    resolveModelLoad = resolve;
    rejectModelLoad = reject;
    worker!.postMessage({ type: 'LOAD_MODEL' });
  });
}

export async function detectObjects(imageSource: any, threshold: number = 0.1) {
  if (!worker) return [];
  
  return new Promise((resolve) => {
    resolveDetect = resolve;
    // We send a data URL to the worker to avoid transferring large canvas objects directly (since it's an offscreen canvas)
    worker!.postMessage({ 
      type: 'DETECT', 
      payload: { 
        image: imageSource.toDataURL('image/jpeg', 0.8), 
        threshold 
      } 
    });
  });
}

